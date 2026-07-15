import { describe, expect, it } from "vitest";
import { getTierStorageRows, getTotalStorageGB } from "./storage-tiers";
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
        { diskGB: 3, diskPurpose: 4 },
        { diskGB: 1, diskPurpose: 3 },
        { diskGB: 2, diskPurpose: 13 },
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
