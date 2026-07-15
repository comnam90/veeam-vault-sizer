import { useEffect, useRef, useState } from "react";
import { callVaultSizerApi } from "@/lib/api/vault-sizer-client";
import { validateRepositoryConfig } from "@/lib/simple-mode/validate-repository-config";
import { validateWorkloadData } from "@/lib/simple-mode/validate-workload-data";
import type {
  RepositoryConfigValues,
  SizerResult,
  WorkloadDataValues,
} from "@/types/simple-mode";

const DEBOUNCE_MS = 500;

interface CalculatedSizing {
  data: SizerResult | null;
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
    // Dedicated ref, not derived from requestId === 1: if the very first
    // render's data fails validation, the early return above never
    // increments requestId, so a requestId === 1 check would misfire on
    // the next real attempt instead of this one. See ADR-0017 for why this
    // also means a dev-only Strict Mode double-invoke costs the real first
    // load its immediate (no-debounce) dispatch.
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
