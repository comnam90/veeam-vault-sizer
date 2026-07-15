import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCalculatedSizing } from "./use-calculated-sizing";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const mockData: CVmAgentReturnObject = {
  totalStorageTB: 18.4,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("useCalculatedSizing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fires immediately on mount, with no debounce delay", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, mode: "direct", data: mockData }),
    );

    const { result } = renderHook(() =>
      useCalculatedSizing(
        DEFAULT_WORKLOAD_DATA_VALUES,
        DEFAULT_REPOSITORY_CONFIG_VALUES,
      ),
    );

    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.waitFor(() =>
      expect(result.current.data).toEqual({ mode: "direct", data: mockData }),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("settles a copy-mode payload into state, with loading/error behaving like direct mode", async () => {
    const primaryData: CVmAgentReturnObject = {
      ...mockData,
      totalStorageTB: 24,
    };
    const secondaryData: CVmAgentReturnObject = {
      ...mockData,
      totalStorageTB: 18.4,
    };
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        mode: "copy",
        primary: primaryData,
        secondary: secondaryData,
      }),
    );

    const { result } = renderHook(() =>
      useCalculatedSizing(DEFAULT_WORKLOAD_DATA_VALUES, {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES,
        backupPath: "copy",
      }),
    );

    await vi.waitFor(() =>
      expect(result.current.data).toEqual({
        mode: "copy",
        primary: primaryData,
        secondary: secondaryData,
      }),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("collapses rapid consecutive changes into a single fetch call, using the latest values", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, mode: "direct", data: mockData }),
    );

    const { rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    expect(fetch).toHaveBeenCalledTimes(1); // the immediate mount fetch

    const secondEdit: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    const thirdEdit: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "12",
    };

    act(() => rerender({ workloadData: secondEdit }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    act(() => rerender({ workloadData: thirdEdit }));

    // Still within the 500ms debounce window from the *last* edit — no second dispatch yet.
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/vault-sizer",
      expect.objectContaining({
        body: JSON.stringify({
          workloadData: thirdEdit,
          repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        }),
      }),
    );
  });

  it("sets isLoading synchronously on a value change and clears it once the request settles", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, mode: "direct", data: mockData }),
    );

    const { result, rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    act(() => rerender({ workloadData: edited }));

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("reflects the newer response and aborts the older request when a slower older request is superseded", async () => {
    let resolveFirst!: (value: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const olderData: CVmAgentReturnObject = { ...mockData, totalStorageTB: 1 };
    const newerData: CVmAgentReturnObject = {
      ...mockData,
      totalStorageTB: 2,
    };

    vi.mocked(fetch)
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce(
        jsonResponse({ success: true, mode: "direct", data: newerData }),
      );

    const { result, rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    const firstCallSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    act(() => rerender({ workloadData: edited }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() =>
      expect(result.current.data).toEqual({ mode: "direct", data: newerData }),
    );

    // The superseded first request's controller was aborted.
    expect(firstCallSignal?.aborted).toBe(true);

    // The first request resolving *after* the second has already settled
    // must not clobber the newer state.
    resolveFirst(
      jsonResponse({ success: true, mode: "direct", data: olderData }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data).toEqual({ mode: "direct", data: newerData });
  });

  it("leaves error null when a rejection is caused by abort (supersession, not failure)", async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() => {
        const error = new DOMException("Aborted", "AbortError");
        return Promise.reject(error);
      })
      .mockResolvedValueOnce(
        jsonResponse({ success: true, mode: "direct", data: mockData }),
      );

    const { result, rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    act(() => rerender({ workloadData: edited }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() =>
      expect(result.current.data).toEqual({ mode: "direct", data: mockData }),
    );
    expect(result.current.error).toBeNull();
  });

  it("sets error on a non-abort rejection and leaves prior data intact", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ success: true, mode: "direct", data: mockData }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { success: false, error: "Upstream sizing API unreachable" },
          502,
        ),
      );

    const { result, rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    await vi.waitFor(() =>
      expect(result.current.data).toEqual({ mode: "direct", data: mockData }),
    );

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    act(() => rerender({ workloadData: edited }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() =>
      expect(result.current.error).toBe("Upstream sizing API unreachable"),
    );
    expect(result.current.data).toEqual({ mode: "direct", data: mockData });
  });

  it("never calls fetch while workloadData fails validation", async () => {
    const invalid: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "",
    };

    const { result } = renderHook(() =>
      useCalculatedSizing(invalid, DEFAULT_REPOSITORY_CONFIG_VALUES),
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("carries an updated projectLengthYears through to the outbound request body as projectLength", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, mode: "direct", data: mockData }),
    );

    const { rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      projectLengthYears: "5",
    };
    act(() => rerender({ workloadData: edited }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetch).toHaveBeenLastCalledWith(
      "/api/vault-sizer",
      expect.objectContaining({
        body: JSON.stringify({
          workloadData: edited,
          repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        }),
      }),
    );
  });
});
