import { describe, expect, it } from "vitest";
import {
  getTargetTierLabels,
  getTierStorageRows,
  getTotalStorageGB,
} from "./storage-tiers";
import { DEFAULT_REPOSITORY_CONFIG_VALUES } from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

function makeData(
  volumes: { diskGB: number; diskPurpose: number }[],
): CVmAgentReturnObject {
  return {
    totalStorageTB: 0,
    workspaceGB: 0,
    performanceTierImmutabilityTaxGB: 0,
    capacityTierImmutabilityTaxGB: 0,
    repoCompute: { compute: { cores: 2, ram: 8, volumes } },
  };
}

describe("getTierStorageRows", () => {
  it("returns no rows for null data", () => {
    expect(getTierStorageRows(null)).toEqual([]);
  });

  it("maps diskPurpose 2 (RepoLocal) and 3 (RepoObject) both to the Performance tier", () => {
    expect(
      getTierStorageRows(makeData([{ diskGB: 100, diskPurpose: 2 }])),
    ).toEqual([
      {
        key: "performance",
        label: "Performance",
        diskGB: 100,
        colorClassName: "bg-tier-performance",
      },
    ]);
    expect(
      getTierStorageRows(makeData([{ diskGB: 100, diskPurpose: 3 }]))[0].key,
    ).toBe("performance");
  });

  it("returns Performance, Capacity, and Archive rows in that order when all are present", () => {
    const rows = getTierStorageRows(
      makeData([
        { diskGB: 3, diskPurpose: 4 }, // archive, listed first to prove ordering is fixed
        { diskGB: 1, diskPurpose: 3 }, // performance
        { diskGB: 2, diskPurpose: 13 }, // capacity
      ]),
    );
    expect(rows.map((r) => r.key)).toEqual([
      "performance",
      "capacity",
      "archive",
    ]);
  });

  it("filters out tiers whose volume is present but zero (the real upstream shape)", () => {
    const rows = getTierStorageRows(
      makeData([
        { diskGB: 2048, diskPurpose: 3 },
        { diskGB: 0, diskPurpose: 13 },
        { diskGB: 0, diskPurpose: 4 },
      ]),
    );
    expect(rows.map((r) => r.key)).toEqual(["performance"]);
  });
});

describe("getTotalStorageGB", () => {
  it("sums only the tiers that pass the > 0 filter", () => {
    const data = makeData([
      { diskGB: 2048, diskPurpose: 3 },
      { diskGB: 4096, diskPurpose: 13 },
      { diskGB: 0, diskPurpose: 4 },
    ]);
    expect(getTotalStorageGB(data)).toBe(6144);
  });

  it("is 0 for null data", () => {
    expect(getTotalStorageGB(null)).toBe(0);
  });
});

describe("getTargetTierLabels", () => {
  it("returns only a performance label for a standalone (non-SOBR) target", () => {
    expect(
      getTargetTierLabels("vault-azure", DEFAULT_REPOSITORY_CONFIG_VALUES.sobr),
    ).toEqual({ performance: "Vault Azure" });
  });

  it("returns performance-only for a SOBR target with Capacity Tier disabled", () => {
    const sobr = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
      performanceType: "hardened-repository" as const,
    };
    expect(getTargetTierLabels("sobr", sobr)).toEqual({
      performance: "Hardened Repository",
    });
  });

  it("adds a capacity label when Capacity Tier is enabled, and never adds an archive label", () => {
    const sobr = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
      performanceType: "hardened-repository" as const,
      capacityTier: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier,
        enabled: true,
        type: "vault-azure" as const,
      },
      archiveTier: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.archiveTier,
        enabled: true,
      },
    };
    const labels = getTargetTierLabels("sobr", sobr);
    expect(labels).toEqual({
      performance: "Hardened Repository",
      capacity: "Vault Azure",
    });
    expect(labels.archive).toBeUndefined();
  });
});
