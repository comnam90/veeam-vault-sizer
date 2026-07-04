import type { VmAgentRequest, VmAgentResponse } from "@/types/vault-sizer-api";

const API_URL = "/api/vault-sizer";

export async function callVaultSizerApi(
  request: VmAgentRequest,
): Promise<VmAgentResponse> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      `Vault Sizer API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<VmAgentResponse>;
}
