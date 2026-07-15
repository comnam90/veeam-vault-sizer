import {
  buildCopyVmAgentRequests,
  buildVmAgentRequest,
} from "../../src/lib/simple-mode/build-vm-agent-request";
import type {
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
    const upstream = await upstreamFetch(vmAgentInputs);
    const upstreamBody: unknown = await parseBody(upstream);

    if (upstream.ok) {
      const { data } = upstreamBody as { data: CVmAgentReturnObject };
      return jsonResponse({ success: true, mode: "direct", data }, 200);
    }

    return jsonResponse(
      { success: false, error: extractErrorMessage(upstreamBody) },
      upstream.status,
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
    const [primaryRes, secondaryRes] = await Promise.all([
      upstreamFetch(inputs.primary),
      upstreamFetch(inputs.secondary),
    ]);
    const [primaryBody, secondaryBody] = await Promise.all([
      parseBody(primaryRes),
      parseBody(secondaryRes),
    ]);

    if (!primaryRes.ok) {
      return jsonResponse(
        {
          success: false,
          error: `Primary (on-premises) sizing failed: ${extractErrorMessage(primaryBody)}`,
        },
        primaryRes.status,
      );
    }
    if (!secondaryRes.ok) {
      return jsonResponse(
        {
          success: false,
          error: `Secondary (offsite Vault) sizing failed: ${extractErrorMessage(secondaryBody)}`,
        },
        secondaryRes.status,
      );
    }

    return jsonResponse(
      {
        success: true,
        mode: "copy",
        primary: (primaryBody as { data: CVmAgentReturnObject }).data,
        secondary: (secondaryBody as { data: CVmAgentReturnObject }).data,
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
