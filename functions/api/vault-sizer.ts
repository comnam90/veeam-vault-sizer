import {
  buildCopyVmAgentRequests,
  buildVmAgentRequest,
} from "../../src/lib/simple-mode/build-vm-agent-request";
import {
  buildPhantomCapacityInputs,
  computeCorrectedThreshold,
  detectsArchiveTierWithoutCapacity,
  hasLeakedNonGfsPoints,
  isArchiveComplete,
} from "../../src/lib/simple-mode/resolve-archive-tier-workaround";
import type {
  ArchiveTierNotice,
  SizerBffRequest,
  SizerBffResponse,
} from "../../src/types/simple-mode";
import type {
  CVmAgentReturnObject,
  ReturnMessage,
  ValidationProblemDetails,
  VmAgentInputs,
} from "../../src/types/vault-sizer-api";

const VAULT_SIZER_API_URL = "https://calculator.veeam.com/vse/api/VmAgent";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: SizerBffResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function extractErrorMessage(body: unknown): string {
  const returnMessage = body as ReturnMessage | null;
  if (returnMessage?.messages && returnMessage.messages.length > 0) {
    return returnMessage.messages[0];
  }

  const validationProblem = body as ValidationProblemDetails | null;
  if (validationProblem?.errors) {
    return Object.values(validationProblem.errors).flat().join(", ");
  }

  return "Calculation engine rejected the request";
}

function upstreamFetch(inputs: VmAgentInputs): Promise<Response> {
  return fetch(VAULT_SIZER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });
}

// Never throws — a non-JSON error body still resolves so the caller surfaces a
// side-labeled message via extractErrorMessage's fallback, not a 502.
async function parseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

type FetchOutcome =
  | { ok: true; data: CVmAgentReturnObject }
  | { ok: false; error: string; status: number };

async function fetchAndParse(inputs: VmAgentInputs): Promise<FetchOutcome> {
  const upstream = await upstreamFetch(inputs);
  const upstreamBody: unknown = await parseBody(upstream);

  if (upstream.ok) {
    const { data } = upstreamBody as { data: CVmAgentReturnObject };
    return { ok: true, data };
  }

  return {
    ok: false,
    error: extractErrorMessage(upstreamBody),
    status: upstream.status,
  };
}

type ResolvedInputs =
  | {
      ok: true;
      data: CVmAgentReturnObject;
      archiveTierNotice?: ArchiveTierNotice;
    }
  | { ok: false; error: string; status: number };

// Orchestrates the Archive Tier detect-and-resubmit SOBR workaround (ADR-0022;
// docs/evidence/sobr-archive-tier-no-capacity/README.md). Retire this once
// Veeam confirms a fix for Issues 1/2, or once
// `node docs/evidence/sobr-archive-tier-no-capacity/probe.mjs` reports drift
// from README.md's documented findings.
async function resolveInputs(inputs: VmAgentInputs): Promise<ResolvedInputs> {
  if (!detectsArchiveTierWithoutCapacity(inputs)) {
    return fetchAndParse(inputs);
  }

  const phantomInputs = buildPhantomCapacityInputs(inputs);
  const first = await fetchAndParse(phantomInputs);
  if (!first.ok) return first;

  let finalData = first.data;
  let finalThreshold = phantomInputs.capacityTierDays;

  if (hasLeakedNonGfsPoints(first.data)) {
    const correctedThreshold = computeCorrectedThreshold(first.data);
    const correctedInputs = {
      ...phantomInputs,
      capacityTierDays: correctedThreshold,
    };
    const second = await fetchAndParse(correctedInputs);
    if (!second.ok) return second;
    finalData = second.data;
    finalThreshold = correctedThreshold;
  }

  if (isArchiveComplete(finalData)) {
    return {
      ok: true,
      data: finalData,
      archiveTierNotice:
        finalThreshold !== inputs.archiveTierDays
          ? { status: "adjusted", effectiveThresholdDays: finalThreshold }
          : undefined,
    };
  }

  const fallback = await fetchAndParse(inputs);
  if (!fallback.ok) return fallback;
  return {
    ok: true,
    data: fallback.data,
    archiveTierNotice: { status: "failed" },
  };
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context: {
  request: Request;
}): Promise<Response> {
  let bffRequest: SizerBffRequest;
  try {
    bffRequest = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (!bffRequest?.repositoryConfig) {
    return jsonResponse({ success: false, error: "Invalid request body" }, 400);
  }

  if (bffRequest.repositoryConfig.backupPath === "copy") {
    return handleCopy(bffRequest);
  }
  return handleDirect(bffRequest);
}

async function handleDirect(bffRequest: SizerBffRequest): Promise<Response> {
  let vmAgentInputs: VmAgentInputs;
  try {
    vmAgentInputs = buildVmAgentRequest(
      bffRequest.workloadData,
      bffRequest.repositoryConfig,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return jsonResponse({ success: false, error: message }, 400);
  }

  try {
    const resolved = await resolveInputs(vmAgentInputs);

    if (!resolved.ok) {
      return jsonResponse(
        { success: false, error: resolved.error },
        resolved.status,
      );
    }

    return jsonResponse(
      {
        success: true,
        mode: "direct",
        data: resolved.data,
        archiveTierNotice: resolved.archiveTierNotice,
      },
      200,
    );
  } catch {
    return jsonResponse(
      { success: false, error: "Upstream sizing API unreachable" },
      502,
    );
  }
}

async function handleCopy(bffRequest: SizerBffRequest): Promise<Response> {
  let inputs: { primary: VmAgentInputs; secondary: VmAgentInputs };
  try {
    inputs = buildCopyVmAgentRequests(
      bffRequest.workloadData,
      bffRequest.repositoryConfig,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return jsonResponse({ success: false, error: message }, 400);
  }

  try {
    const [primaryResolved, secondaryResolved] = await Promise.all([
      resolveInputs(inputs.primary),
      resolveInputs(inputs.secondary),
    ]);

    if (!primaryResolved.ok) {
      return jsonResponse(
        {
          success: false,
          error: `Primary (on-premises) sizing failed: ${primaryResolved.error}`,
        },
        primaryResolved.status,
      );
    }
    if (!secondaryResolved.ok) {
      return jsonResponse(
        {
          success: false,
          error: `Secondary (offsite Vault) sizing failed: ${secondaryResolved.error}`,
        },
        secondaryResolved.status,
      );
    }

    return jsonResponse(
      {
        success: true,
        mode: "copy",
        primary: primaryResolved.data,
        secondary: secondaryResolved.data,
        archiveTierNotice:
          primaryResolved.archiveTierNotice ??
          secondaryResolved.archiveTierNotice,
      },
      200,
    );
  } catch {
    return jsonResponse(
      { success: false, error: "Upstream sizing API unreachable" },
      502,
    );
  }
}
