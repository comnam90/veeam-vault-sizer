import { describe, expect, it } from "vitest";
import {
  buildPhantomCapacityInputs,
  computeCorrectedThreshold,
  detectsArchiveTierWithoutCapacity,
  hasLeakedNonGfsPoints,
  isArchiveComplete,
} from "./resolve-archive-tier-workaround";
import type {
  CVmAgentReturnObject,
  VmAgentInputs,
} from "@/types/vault-sizer-api";

const baseInputs: VmAgentInputs = {
  sourceTB: 10,
  changeRate: 3,
  reduction: 50,
  days: 30,
  archiveTierEnabled: true,
  archiveTierDays: 90,
  immutablePerfDays: 30,
  moveCapacityTierEnabled: false,
  copyCapacityTierEnabled: false,
};

function makeResponse(
  volumes: { diskGB: number; diskPurpose: number }[],
  restorePoints: CVmAgentReturnObject["restorePoints"],
): CVmAgentReturnObject {
  return {
    totalStorageTB: 0,
    workspaceGB: 0,
    performanceTierImmutabilityTaxGB: 0,
    capacityTierImmutabilityTaxGB: 0,
    repoCompute: { compute: { cores: 2, ram: 8, volumes } },
    restorePoints,
  };
}

describe("detectsArchiveTierWithoutCapacity", () => {
  it("is true when archiveTierEnabled is true and neither capacity policy is on", () => {
    expect(detectsArchiveTierWithoutCapacity(baseInputs)).toBe(true);
  });

  it("is false when moveCapacityTierEnabled is true", () => {
    expect(
      detectsArchiveTierWithoutCapacity({
        ...baseInputs,
        moveCapacityTierEnabled: true,
      }),
    ).toBe(false);
  });

  it("is false when copyCapacityTierEnabled is true", () => {
    expect(
      detectsArchiveTierWithoutCapacity({
        ...baseInputs,
        copyCapacityTierEnabled: true,
      }),
    ).toBe(false);
  });

  it("is false when archiveTierEnabled is false", () => {
    expect(
      detectsArchiveTierWithoutCapacity({
        ...baseInputs,
        archiveTierEnabled: false,
      }),
    ).toBe(false);
  });
});

describe("buildPhantomCapacityInputs", () => {
  it("floors capacityTierDays at max(archiveTierDays, immutablePerfDays) and zeroes archiveTierDays", () => {
    const result = buildPhantomCapacityInputs(baseInputs);
    expect(result.moveCapacityTierEnabled).toBe(true);
    expect(result.copyCapacityTierEnabled).toBe(false);
    expect(result.capacityTierDays).toBe(90);
    expect(result.archiveTierDays).toBe(0);
  });

  it("uses the immutablePerfDays floor when it exceeds archiveTierDays", () => {
    const result = buildPhantomCapacityInputs({
      ...baseInputs,
      archiveTierDays: 20,
      immutablePerfDays: 30,
    });
    expect(result.capacityTierDays).toBe(30);
  });

  it("preserves every other field, including archiveTierStandalone", () => {
    const result = buildPhantomCapacityInputs({
      ...baseInputs,
      archiveTierStandalone: true,
    });
    expect(result.archiveTierStandalone).toBe(true);
    expect(result.sourceTB).toBe(10);
  });
});

describe("hasLeakedNonGfsPoints", () => {
  it("is true when the ghost Capacity Tier volume (diskPurpose 13) is non-zero", () => {
    const response = makeResponse(
      [
        { diskGB: 14387.2, diskPurpose: 2 },
        { diskGB: 14080, diskPurpose: 4 },
        { diskGB: 9180.16, diskPurpose: 13 },
      ],
      [],
    );
    expect(hasLeakedNonGfsPoints(response)).toBe(true);
  });

  it("is false when the ghost Capacity Tier volume is zero", () => {
    const response = makeResponse(
      [
        { diskGB: 18780.16, diskPurpose: 2 },
        { diskGB: 13235.2, diskPurpose: 4 },
        { diskGB: 0, diskPurpose: 13 },
      ],
      [],
    );
    expect(hasLeakedNonGfsPoints(response)).toBe(false);
  });

  it("is false when there is no Capacity Tier volume entry at all", () => {
    const response = makeResponse([{ diskGB: 18780.16, diskPurpose: 2 }], []);
    expect(hasLeakedNonGfsPoints(response)).toBe(false);
  });
});

describe("computeCorrectedThreshold", () => {
  it("is one more than the maximum day among non-GFS restore points", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 1,
          backupCapacity: 0.1,
          isFull: true,
          isGFS: false,
          isImmutable: false,
        },
        {
          pointType: "capacityTier",
          day: 91,
          backupCapacity: 0.1,
          isFull: false,
          isGFS: false,
          isImmutable: false,
        },
        {
          pointType: "archiveTier",
          day: 154,
          backupCapacity: 0.8,
          isFull: true,
          isGFS: true,
          isImmutable: false,
        },
      ],
    );
    expect(computeCorrectedThreshold(response)).toBe(92);
  });
});

describe("isArchiveComplete", () => {
  it("is true when every isGFS:true day older than the threshold is tagged archiveTier", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 1,
          backupCapacity: 0.1,
          isFull: true,
          isGFS: false,
          isImmutable: false,
        },
        {
          pointType: "archiveTier",
          day: 154,
          backupCapacity: 0.8,
          isFull: true,
          isGFS: true,
          isImmutable: false,
        },
      ],
    );
    expect(isArchiveComplete(response, 90)).toBe(true);
  });

  it("is true for the Immutability Tax duplicate (day 63, tagged both performanceTier and archiveTier)", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "archiveTier",
          day: 63,
          backupCapacity: 0.82,
          isFull: true,
          isGFS: true,
          isImmutable: false,
          flags: "M2",
        },
        {
          pointType: "performanceTier",
          day: 63,
          backupCapacity: 5.5,
          isFull: true,
          isGFS: true,
          isImmutable: false,
          flags: "M2",
        },
      ],
    );
    expect(isArchiveComplete(response, 60)).toBe(true);
  });

  it("is false when a GFS day older than the threshold is missing an archiveTier tag entirely", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 1,
          backupCapacity: 0.1,
          isFull: true,
          isGFS: false,
          isImmutable: false,
        },
        {
          pointType: "performanceTier",
          day: 154,
          backupCapacity: 0.8,
          isFull: true,
          isGFS: true,
          isImmutable: false,
        },
      ],
    );
    expect(isArchiveComplete(response, 90)).toBe(false);
  });

  it("is true (vacuously) when there are no GFS points at all", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 1,
          backupCapacity: 0.1,
          isFull: true,
          isGFS: false,
          isImmutable: false,
        },
      ],
    );
    expect(isArchiveComplete(response, 90)).toBe(true);
  });

  it("is true when a GFS day hasn't aged past the threshold yet and correctly sits unarchived in Performance", () => {
    // Live-API repro (defaults: sourceTB 10, days 30, weeklies 4, monthlies
    // 12, yearlies 1, immutablePerfDays 30, archiveTierDays 90 -> phantom
    // capacityTierDays 90): the first distinct monthly GFS point (M2) lands
    // on day 63, 27 days short of the 90-day threshold. It correctly stays
    // performanceTier-only — not yet old enough to move — while every GFS
    // day past the threshold (M3 day 98 onward) is tagged archiveTier. The
    // old day-set-membership check flagged this as incomplete; it isn't.
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 35,
          backupCapacity: 0.1,
          isFull: true,
          isGFS: false,
          isImmutable: false,
          flags: "M1",
        },
        {
          pointType: "performanceTier",
          day: 63,
          backupCapacity: 5.5,
          isFull: true,
          isGFS: true,
          isImmutable: false,
          flags: "M2",
        },
        {
          pointType: "archiveTier",
          day: 98,
          backupCapacity: 0.82,
          isFull: true,
          isGFS: true,
          isImmutable: false,
          flags: "M3",
        },
      ],
    );
    expect(isArchiveComplete(response, 90)).toBe(true);
  });

  it("is false when a GFS day past the threshold is missing archiveTier, even though a younger GFS day correctly sits unarchived", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 63,
          backupCapacity: 5.5,
          isFull: true,
          isGFS: true,
          isImmutable: false,
          flags: "M2",
        },
        {
          // Should be archiveTier (98 > 90) but isn't — a genuine leak.
          pointType: "performanceTier",
          day: 98,
          backupCapacity: 0.82,
          isFull: true,
          isGFS: true,
          isImmutable: false,
          flags: "M3",
        },
      ],
    );
    expect(isArchiveComplete(response, 90)).toBe(false);
  });
});
