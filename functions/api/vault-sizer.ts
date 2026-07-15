import { buildVmAgentRequest } from "../../src/lib/simple-mode/build-vm-agent-request";
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
    const upstream = await fetch(VAULT_SIZER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vmAgentInputs),
    });

    const upstreamBody: unknown = await upstream.json();

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
