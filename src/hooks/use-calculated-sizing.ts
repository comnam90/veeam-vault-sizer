import { useEffect, useRef, useState } from "react";
import { callVaultSizerApi } from "@/lib/api/vault-sizer-client";
import { validateRepositoryConfig } from "@/lib/simple-mode/validate-repository-config";
import { validateWorkloadData } from "@/lib/simple-mode/validate-workload-data";
import type {
  RepositoryConfigValues,
  WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const DEBOUNCE_MS = 500;

interface CalculatedSizing {
  data: CVmAgentReturnObject | null;
  isLoading: boolean;
  error: string | null;
}

export function useCalculatedSizing(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): CalculatedSizing {
  const [state, setState] = useState<CalculatedSizing>({
    data: null,
    isLoading: false,
    error: null,
  });
  const latestRequestId = useRef(0);
  const hasRunRef = useRef(false);

  useEffect(() => {
    const workloadErrors = validateWorkloadData(workloadData);
    const repositoryErrors = validateRepositoryConfig(
      repositoryConfig,
      workloadData,
    );
    if (
      Object.keys(workloadErrors).length > 0 ||
      Object.keys(repositoryErrors).length > 0
    ) {
      setState((prev) => ({ ...prev, isLoading: false, error: null }));
      return;
    }

    const requestId = ++latestRequestId.current;
    const controller = new AbortController();
    const isFirstRun = !hasRunRef.current;
    hasRunRef.current = true;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const dispatch = async () => {
      try {
        const data = await callVaultSizerApi(
          workloadData,
          repositoryConfig,
          controller.signal,
        );
        if (latestRequestId.current === requestId) {
          setState({ data, isLoading: false, error: null });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (latestRequestId.current === requestId) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }));
        }
      }
    };

    const timeoutId = isFirstRun
      ? undefined
      : setTimeout(dispatch, DEBOUNCE_MS);
    if (isFirstRun) void dispatch();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      controller.abort();
    };
  }, [workloadData, repositoryConfig]);

  return state;
}
