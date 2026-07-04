import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callVaultSizerApi } from "./vault-sizer-client";
import type { VmAgentRequest, VmAgentResponse } from "@/types/vault-sizer-api";

const minimalRequest: VmAgentRequest = {
  sourceTB: 10,
  ChangeRate: 3,
  Reduction: 50,
  backupWindowHours: 8,
  GrowthRatePercent: 10,
  GrowthRateScopeYears: 3,
  blockGenerationDays: 10,
  retention: {
    days: 30,
    gfs: { isDefined: true, weeks: 4, months: 12, years: 3 },
    isGfsDefined: true,
  },
  days: 30,
  Weeklies: 4,
  Monthlies: 12,
  Yearlies: 3,
  Blockcloning: true,
  ObjectStorage: true,
  moveCapacityTierEnabled: false,
  capacityTierDays: 14,
  copyCapacityTierEnabled: false,
  immutablePerf: true,
  immutablePerfDays: 30,
  immutableCap: true,
  immutableCapDays: 30,
  archiveTierEnabled: false,
  archiveTierStandalone: false,
  archiveTierDays: 90,
  isCapTierVDCV: true,
  isManaged: true,
  machineType: 0,
  hyperVisor: 0,
  calculatorMode: 0,
  productVersion: 0,
  instanceCount: 1,
};

const mockResponse: VmAgentResponse = {
  success: true,
  data: {
    totalStorageTB: 18.4,
    proxyCompute: { compute: { cores: 4, ram: 8, volumes: [] } },
    repoCompute: { compute: { cores: 8, ram: 16, volumes: [] } },
    transactions: {},
    performanceTierImmutabilityTaxGB: 0,
    capacityTierImmutabilityTaxGB: 0,
  },
};

describe("callVaultSizerApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the request to /api/vault-sizer and returns the parsed response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await callVaultSizerApi(minimalRequest);

    expect(fetch).toHaveBeenCalledWith("/api/vault-sizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(minimalRequest),
    });
    expect(result).toEqual(mockResponse);
  });

  it("throws a descriptive error when the response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(callVaultSizerApi(minimalRequest)).rejects.toThrow(
      "Vault Sizer API error: 500 Internal Server Error",
    );
  });
});
