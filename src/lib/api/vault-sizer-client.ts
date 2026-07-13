import type {
  RepositoryConfigValues,
  SizerBffResponse,
  WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const API_URL = "/api/vault-sizer";

export async function callVaultSizerApi(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
  signal?: AbortSignal,
): Promise<CVmAgentReturnObject> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workloadData, repositoryConfig }),
    signal,
  });

  const body: SizerBffResponse = await response.json();

  if (!body.success) {
    throw new Error(body.error);
  }

  return body.data;
}
