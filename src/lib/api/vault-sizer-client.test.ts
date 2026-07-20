import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callVaultSizerApi } from "./vault-sizer-client";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const mockData: CVmAgentReturnObject = {
  totalStorageTB: 18.4,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
};

describe("callVaultSizerApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs workloadData and repositoryConfig to /api/vault-sizer and returns the unwrapped data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, mode: "direct", data: mockData }),
        {
          status: 200,
        },
      ),
    );

    const result = await callVaultSizerApi(
      DEFAULT_WORKLOAD_DATA_VALUES,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(fetch).toHaveBeenCalledWith("/api/vault-sizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    });
    expect(result).toEqual({ mode: "direct", data: mockData });
  });

  it("returns the copy-mode primary/secondary data unmutated", async () => {
    const primaryData: CVmAgentReturnObject = {
      ...mockData,
      totalStorageTB: 24,
    };
    const secondaryData: CVmAgentReturnObject = {
      ...mockData,
      totalStorageTB: 18.4,
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          mode: "copy",
          primary: primaryData,
          secondary: secondaryData,
        }),
        { status: 200 },
      ),
    );

    const result = await callVaultSizerApi(DEFAULT_WORKLOAD_DATA_VALUES, {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
    });

    expect(result).toEqual({
      mode: "copy",
      primary: primaryData,
      secondary: secondaryData,
    });
  });

  it("throws the gateway's error message when success is false", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: "sourceTB must be between 0 and 1,024,000",
        }),
        { status: 400 },
      ),
    );

    await expect(
      callVaultSizerApi(
        DEFAULT_WORKLOAD_DATA_VALUES,
        DEFAULT_REPOSITORY_CONFIG_VALUES,
      ),
    ).rejects.toThrow("sourceTB must be between 0 and 1,024,000");
  });

  it("threads archiveTierNotice through for direct mode", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          mode: "direct",
          data: mockData,
          archiveTierNotice: { status: "adjusted", effectiveThresholdDays: 30 },
        }),
        { status: 200 },
      ),
    );

    const result = await callVaultSizerApi(
      DEFAULT_WORKLOAD_DATA_VALUES,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(result.archiveTierNotice).toEqual({
      status: "adjusted",
      effectiveThresholdDays: 30,
    });
  });

  it("forwards an AbortSignal to fetch when provided", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, mode: "direct", data: mockData }),
        {
          status: 200,
        },
      ),
    );
    const controller = new AbortController();

    await callVaultSizerApi(
      DEFAULT_WORKLOAD_DATA_VALUES,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
      controller.signal,
    );

    expect(fetch).toHaveBeenCalledWith(
      "/api/vault-sizer",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
