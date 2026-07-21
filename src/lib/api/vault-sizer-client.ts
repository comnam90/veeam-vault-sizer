import type {
  RepositoryConfigValues,
  SizerBffResponse,
  SizerResult,
  WorkloadDataValues,
} from "@/types/simple-mode";

const API_URL = "/api/vault-sizer";

export async function callVaultSizerApi(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
  signal?: AbortSignal,
): Promise<SizerResult> {
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

  if (body.mode === "direct") {
    return {
      mode: "direct",
      data: body.data,
      archiveTierNotice: body.archiveTierNotice,
    };
  }

  return {
    mode: "copy",
    primary: body.primary,
    secondary: body.secondary,
    archiveTierNotice: body.archiveTierNotice,
  };
}
