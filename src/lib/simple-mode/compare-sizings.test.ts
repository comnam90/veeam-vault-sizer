import { describe, expect, it } from "vitest";
import {
  getSizingComparisonRows,
  getTotalRequiredStorageTB,
  type CompareEntry,
} from "./compare-sizings";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
  type SizerResult,
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
