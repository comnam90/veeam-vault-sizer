import { describe, expect, it } from "vitest";
import {
  getRepositoryConfigComparisonRows,
  getSizingComparisonRows,
  getTotalRequiredStorageTB,
  getWorkloadDataComparisonRows,
  type CompareEntry,
} from "./compare-sizings";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
  type SizerResult,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

function directRepo(data: CVmAgentReturnObject): SizerResult {
  return { mode: "direct", data };
}

const directWithSobr: CVmAgentReturnObject = {
  totalStorageTB: 0,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
  repoCompute: {
    compute: {
      cores: 4,
      ram: 16,
      volumes: [
        { diskGB: 2048, diskPurpose: 3 }, // Performance: 2.0 TB
        { diskGB: 4096, diskPurpose: 13 }, // Capacity: 4.0 TB
      ],
    },
  },
  proxyCompute: {
    compute: {
      cores: 8,
      ram: 32,
      networkThroughput: { inboundMBps: 100, outboundMBps: 50 },
    },
  },
};

describe("getTotalRequiredStorageTB", () => {
  it("returns null when data is null (Live before first load)", () => {
    expect(getTotalRequiredStorageTB(null)).toBeNull();
  });

  it("sums Performance + Capacity + Archive for a direct-mode result", () => {
    expect(getTotalRequiredStorageTB(directRepo(directWithSobr))).toBeCloseTo(
      6,
      5,
    ); // 2.0 + 4.0
  });

  it("sums both primary and secondary totals for a copy-mode result", () => {
    const primary: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 2,
          ram: 8,
          volumes: [{ diskGB: 2048, diskPurpose: 2 }],
        },
      },
    };
    const secondary: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 2,
          ram: 8,
          volumes: [{ diskGB: 1024, diskPurpose: 3 }],
        },
      },
    };
    expect(
      getTotalRequiredStorageTB({ mode: "copy", primary, secondary }),
    ).toBeCloseTo(3, 5); // 2.0 + 1.0
  });
});

describe("getSizingComparisonRows", () => {
  it("renders Total Required Storage as null (N/A) for a Live entry with no data yet", () => {
    const entries: CompareEntry[] = [
      {
        label: "Live",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
    ];
    const rows = getSizingComparisonRows(entries);
    const totalRow = rows.find((row) => row.label === "Total Required Storage");
    expect(totalRow?.values).toEqual([null]);
  });

  it("includes Primary tier rows and omits Secondary rows for a direct-mode-only comparison", () => {
    const entries: CompareEntry[] = [
      {
        label: "Live",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: directRepo(directWithSobr),
      },
    ];
    const rows = getSizingComparisonRows(entries);

    expect(
      rows.find((row) => row.label === "Total Required Storage")?.values,
    ).toEqual(["6.0 TB"]);
    expect(
      rows.find((row) => row.label === "Primary — Performance")?.values,
    ).toEqual(["2.0 TB"]);
    expect(
      rows.find((row) => row.label === "Primary — Capacity")?.values,
    ).toEqual(["4.0 TB"]);
    expect(rows.some((row) => row.label === "Primary — Archive")).toBe(false);
    expect(rows.some((row) => row.label.startsWith("Secondary"))).toBe(false);
  });

  it("includes both Primary and Secondary rows for a copy-mode entry, with N/A for a direct-mode entry in the same comparison", () => {
    const copyConfig: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
    };
    const primary: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 4,
          ram: 8,
          volumes: [{ diskGB: 3072, diskPurpose: 2 }],
        },
      },
      proxyCompute: {
        compute: {
          cores: 4,
          ram: 8,
          networkThroughput: { inboundMBps: 20, outboundMBps: 10 },
        },
      },
    };
    const secondary: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 2,
          ram: 4,
          volumes: [{ diskGB: 1024, diskPurpose: 3 }],
        },
      },
      proxyCompute: {
        compute: {
          cores: 2,
          ram: 4,
          networkThroughput: { inboundMBps: 8, outboundMBps: 4 },
        },
      },
    };

    const entries: CompareEntry[] = [
      {
        label: "Direct entry",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: directRepo(directWithSobr),
      },
      {
        label: "Copy entry",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
        data: { mode: "copy", primary, secondary },
      },
    ];
    const rows = getSizingComparisonRows(entries);

    const secondaryPerf = rows.find(
      (row) => row.label === "Secondary — Performance",
    );
    expect(secondaryPerf?.values).toEqual([null, "1.0 TB"]);

    const primaryPerf = rows.find(
      (row) => row.label === "Primary — Performance",
    );
    expect(primaryPerf?.values).toEqual(["2.0 TB", "3.0 TB"]);
  });

  it("includes Proxy Compute (Cores/RAM) and Network Bandwidth rows per role", () => {
    const entries: CompareEntry[] = [
      {
        label: "Live",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: directRepo(directWithSobr),
      },
    ];
    const rows = getSizingComparisonRows(entries);

    expect(rows.find((row) => row.label === "Primary — Cores")?.values).toEqual(
      ["8"],
    );
    expect(rows.find((row) => row.label === "Primary — RAM")?.values).toEqual([
      "32 GB",
    ]);
    expect(
      rows.find((row) => row.label.startsWith("Primary — Nightly Incremental"))
        ?.values,
    ).toEqual(["400.0 Mbps"]);
    expect(
      rows.find((row) =>
        row.label.startsWith("Primary — Initial Full / Restore"),
      )?.values,
    ).toEqual(["485.5 Mbps"]);
  });
});

describe("getWorkloadDataComparisonRows", () => {
  it("renders one row per WorkloadDataValues field, all applicable (no N/A)", () => {
    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "20",
      gfsWeekly: "2",
    };
    const entries: CompareEntry[] = [
      {
        label: "Live",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
      {
        label: "Snapshot 1",
        workloadData: edited,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
    ];
    const rows = getWorkloadDataComparisonRows(entries);

    expect(
      rows.find((row) => row.label === "Source Size (TB)")?.values,
    ).toEqual(["10", "20"]);
    expect(rows.find((row) => row.label === "GFS Weekly")?.values).toEqual([
      "4",
      "2",
    ]);
    expect(
      rows.every((row) => row.values.every((value) => value !== null)),
    ).toBe(true);
  });

  it("renders Cap GFS to Forecast Horizon as On/Off", () => {
    const capped: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      capGfsToForecastHorizon: false,
    };
    const entries: CompareEntry[] = [
      {
        label: "A",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
      {
        label: "B",
        workloadData: capped,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
    ];
    const rows = getWorkloadDataComparisonRows(entries);
    expect(
      rows.find((row) => row.label === "Cap GFS to Forecast Horizon")?.values,
    ).toEqual(["On", "Off"]);
  });
});

describe("getRepositoryConfigComparisonRows", () => {
  it("always shows Backup Path", () => {
    const copyConfig: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
    };
    const entries: CompareEntry[] = [
      {
        label: "Direct",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
      {
        label: "Copy",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
        data: null,
      },
    ];
    const rows = getRepositoryConfigComparisonRows(entries);
    expect(rows.find((row) => row.label === "Backup Path")?.values).toEqual([
      "Direct",
      "Copy",
    ]);
  });

  it("shows Primary — Repository Type from targetRepository in direct mode, and from primary.repoType in copy mode", () => {
    const copyConfig: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
    };
    const entries: CompareEntry[] = [
      {
        label: "Direct",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
      {
        label: "Copy",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
        data: null,
      },
    ];
    const rows = getRepositoryConfigComparisonRows(entries);
    // DEFAULT targetRepository is "vault-azure"; DEFAULT primary.repoType is "hardened-repository".
    expect(
      rows.find((row) => row.label === "Primary — Repository Type")?.values,
    ).toEqual(["Vault Azure", "Hardened Repository"]);
  });

  it("omits Primary — Capacity Tier for entries where it isn't enabled, and shows it for entries where it is", () => {
    const withCapacity: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        capacityTier: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier,
          enabled: true,
          type: "aws-s3",
          moveDays: "45",
        },
      },
    };
    const entries: CompareEntry[] = [
      {
        label: "No capacity",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
      {
        label: "With capacity",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: withCapacity,
        data: null,
      },
    ];
    const rows = getRepositoryConfigComparisonRows(entries);
    const capacityRow = rows.find(
      (row) => row.label === "Primary — Capacity Tier",
    );
    expect(capacityRow?.values[0]).toBeNull();
    expect(capacityRow?.values[1]).toContain("AWS S3");
    expect(capacityRow?.values[1]).toContain("45");
  });

  it("names Copy Policy and Move Policy independently in Primary — Capacity Tier, since both can be enabled together", () => {
    // DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier ships with BOTH
    // copyPolicy and movePolicy true — this is the default, not a hand-picked
    // edge case, and a naive copyPolicy?"Copy":movePolicy?"Move":"—" ternary
    // would silently render just "Copy" here, hiding that Move also applies.
    const bothPolicies: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        capacityTier: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier,
          enabled: true,
        },
      },
    };
    const moveOnly: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        capacityTier: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier,
          enabled: true,
          copyPolicy: false,
          movePolicy: true,
        },
      },
    };
    const copyOnly: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        capacityTier: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier,
          enabled: true,
          copyPolicy: true,
          movePolicy: false,
        },
      },
    };
    const neither: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        capacityTier: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier,
          enabled: true,
          copyPolicy: false,
          movePolicy: false,
        },
      },
    };

    const entries: CompareEntry[] = [
      {
        label: "Both",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: bothPolicies,
        data: null,
      },
      {
        label: "Move only",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: moveOnly,
        data: null,
      },
      {
        label: "Copy only",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyOnly,
        data: null,
      },
      {
        label: "Neither",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: neither,
        data: null,
      },
    ];
    const rows = getRepositoryConfigComparisonRows(entries);
    const capacityRow = rows.find(
      (row) => row.label === "Primary — Capacity Tier",
    );

    expect(capacityRow?.values[0]).toContain("Copy + Move");
    expect(capacityRow?.values[1]).toContain("Move");
    expect(capacityRow?.values[1]).not.toContain("Copy");
    expect(capacityRow?.values[2]).toContain("Copy");
    expect(capacityRow?.values[2]).not.toContain("Move");
    expect(capacityRow?.values[3]).toContain("—");
  });

  it("shows Secondary rows only for copy-mode entries", () => {
    const copyConfig: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
    };
    const entries: CompareEntry[] = [
      {
        label: "Direct",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
      {
        label: "Copy",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
        data: null,
      },
    ];
    const rows = getRepositoryConfigComparisonRows(entries);
    const secondaryType = rows.find(
      (row) => row.label === "Secondary — Repository Type",
    );
    expect(secondaryType?.values[0]).toBeNull();
    expect(secondaryType?.values[1]).toBe("Vault Azure"); // DEFAULT targetRepository, reused for Secondary in copy mode
  });

  it("omits every Secondary row entirely for a direct-mode-only comparison", () => {
    // Mirrors Task 3's equivalent assertion for the sizing table — the same
    // "omit for direct-only" filter logic exists here too and needs its own
    // coverage, not just an assertion that one Secondary row's *value* is
    // null for one entry.
    const entries: CompareEntry[] = [
      {
        label: "Direct A",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        data: null,
      },
      {
        label: "Direct B",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES,
          targetRepositoryImmutableDays: "45",
        },
        data: null,
      },
    ];
    const rows = getRepositoryConfigComparisonRows(entries);
    expect(rows.some((row) => row.label.startsWith("Secondary"))).toBe(false);
  });

  it("shows Primary — Retention Override only when primary.retention.customizeRetention is true", () => {
    const copyConfig: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
      primary: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.primary,
        retention: {
          customizeRetention: true,
          retentionDays: "45",
          gfsWeekly: "1",
          gfsMonthly: "2",
          gfsYearly: "0",
        },
      },
    };
    const entries: CompareEntry[] = [
      {
        label: "No override",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES,
          backupPath: "copy",
        },
        data: null,
      },
      {
        label: "Override",
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
        data: null,
      },
    ];
    const rows = getRepositoryConfigComparisonRows(entries);
    const retentionRow = rows.find(
      (row) => row.label === "Primary — Retention Override",
    );
    expect(retentionRow?.values[0]).toBeNull();
    expect(retentionRow?.values[1]).toBe("45d + 1w / 2m / 0y");
  });
});
