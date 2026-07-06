import { describe, expect, it } from "vitest";
import {
  computeClassLifetimes,
  findVaultResidencyViolation,
  resolveEffectiveRetention,
  type ClassLifetime,
} from "./vault-retention";
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RetentionOverride,
} from "@/types/simple-mode";

describe("resolveEffectiveRetention", () => {
  it("uses workloadData directly when no override is given", () => {
    expect(resolveEffectiveRetention(DEFAULT_WORKLOAD_DATA_VALUES)).toEqual({
      retentionDays: 30,
      gfsWeekly: 4,
      gfsMonthly: 12,
      gfsYearly: 3,
    });
  });

  it("uses workloadData when override.customizeRetention is false", () => {
    const override: RetentionOverride = {
      customizeRetention: false,
      retentionDays: "7",
      gfsWeekly: "0",
      gfsMonthly: "0",
      gfsYearly: "0",
    };
    expect(
      resolveEffectiveRetention(DEFAULT_WORKLOAD_DATA_VALUES, override),
    ).toEqual({
      retentionDays: 30,
      gfsWeekly: 4,
      gfsMonthly: 12,
      gfsYearly: 3,
    });
  });

  it("uses the override's own values when customizeRetention is true", () => {
    const override: RetentionOverride = {
      customizeRetention: true,
      retentionDays: "7",
      gfsWeekly: "1",
      gfsMonthly: "0",
      gfsYearly: "0",
    };
    expect(
      resolveEffectiveRetention(DEFAULT_WORKLOAD_DATA_VALUES, override),
    ).toEqual({
      retentionDays: 7,
      gfsWeekly: 1,
      gfsMonthly: 0,
      gfsYearly: 0,
    });
  });
});

describe("computeClassLifetimes", () => {
  it("always includes daily, using retentionDays flat", () => {
    const lifetimes = computeClassLifetimes({
      retentionDays: 30,
      gfsWeekly: 0,
      gfsMonthly: 0,
      gfsYearly: 0,
    });
    expect(lifetimes).toEqual([{ class: "daily", lifetimeDays: 30 }]);
  });

  it("computes weekly lifetime as max(count x 7, chain floor) — the 36-day case", () => {
    const lifetimes = computeClassLifetimes({
      retentionDays: 30,
      gfsWeekly: 4,
      gfsMonthly: 0,
      gfsYearly: 0,
    });
    expect(lifetimes).toContainEqual({ class: "weekly", lifetimeDays: 36 });
  });

  it("computes the app-defaults case with all four classes", () => {
    const lifetimes = computeClassLifetimes({
      retentionDays: 30,
      gfsWeekly: 4,
      gfsMonthly: 12,
      gfsYearly: 3,
    });
    expect(lifetimes).toEqual([
      { class: "daily", lifetimeDays: 30 },
      { class: "weekly", lifetimeDays: 36 },
      { class: "monthly", lifetimeDays: 360 },
      { class: "yearly", lifetimeDays: 1095 },
    ]);
  });

  it("omits a GFS class when its count is 0", () => {
    const lifetimes = computeClassLifetimes({
      retentionDays: 30,
      gfsWeekly: 0,
      gfsMonthly: 12,
      gfsYearly: 0,
    });
    expect(lifetimes.map((l) => l.class)).toEqual(["daily", "monthly"]);
  });

  it("uses the shortest active GFS interval as the driving cadence for every class", () => {
    // weekly is active (cadence 7), so monthly's chain floor uses 7, not 30:
    // max(1 x 30, (7-1)+40) = max(30, 46) = 46
    const lifetimes = computeClassLifetimes({
      retentionDays: 40,
      gfsWeekly: 4,
      gfsMonthly: 1,
      gfsYearly: 0,
    });
    expect(lifetimes.find((l) => l.class === "monthly")).toEqual({
      class: "monthly",
      lifetimeDays: 46,
    });
  });

  it("uses monthly cadence (30) as the chain floor when monthly is the only active GFS class", () => {
    // chain floor = (30-1)+30 = 59, dominates over N*30=30
    const lifetimes = computeClassLifetimes({
      retentionDays: 30,
      gfsWeekly: 0,
      gfsMonthly: 1,
      gfsYearly: 0,
    });
    expect(lifetimes.find((l) => l.class === "monthly")).toEqual({
      class: "monthly",
      lifetimeDays: 59,
    });
  });

  it("uses yearly cadence (365) as the chain floor when yearly is the only active GFS class", () => {
    // chain floor = (365-1)+100 = 464, dominates over N*365=365
    const lifetimes = computeClassLifetimes({
      retentionDays: 100,
      gfsWeekly: 0,
      gfsMonthly: 0,
      gfsYearly: 1,
    });
    expect(lifetimes.find((l) => l.class === "yearly")).toEqual({
      class: "yearly",
      lifetimeDays: 464,
    });
  });
});

describe("findVaultResidencyViolation", () => {
  const flatExit = (lifetime: ClassLifetime) => lifetime.lifetimeDays;

  it("returns undefined when every class's residency is >= 30", () => {
    const lifetimes: ClassLifetime[] = [
      { class: "daily", lifetimeDays: 30 },
      { class: "weekly", lifetimeDays: 36 },
    ];
    expect(findVaultResidencyViolation(lifetimes, 0, flatExit)).toBeUndefined();
  });

  it("treats exactly 30 days residency as passing, not violating", () => {
    const lifetimes: ClassLifetime[] = [{ class: "daily", lifetimeDays: 30 }];
    expect(findVaultResidencyViolation(lifetimes, 0, flatExit)).toBeUndefined();
  });

  it("flags a class whose residency is below 30 days", () => {
    const lifetimes: ClassLifetime[] = [{ class: "daily", lifetimeDays: 30 }];
    expect(findVaultResidencyViolation(lifetimes, 14, flatExit)).toEqual({
      class: "daily",
      residencyDays: 16,
    });
  });

  it("skips a class that never reaches the tier (lifetime <= entry)", () => {
    const lifetimes: ClassLifetime[] = [
      { class: "daily", lifetimeDays: 10 },
      { class: "weekly", lifetimeDays: 50 },
    ];
    expect(
      findVaultResidencyViolation(lifetimes, 14, flatExit),
    ).toBeUndefined();
  });

  it("treats lifetime exactly equal to entry as never reaching the tier (not a zero-residency violation)", () => {
    const lifetimes: ClassLifetime[] = [{ class: "daily", lifetimeDays: 14 }];
    expect(
      findVaultResidencyViolation(lifetimes, 14, flatExit),
    ).toBeUndefined();
  });

  it("returns the smallest-residency (most severe) violation when multiple classes violate", () => {
    const lifetimes: ClassLifetime[] = [
      { class: "daily", lifetimeDays: 30 },
      { class: "weekly", lifetimeDays: 36 },
    ];
    // entry 14: daily residency 16, weekly residency 22 -- daily is more severe
    expect(findVaultResidencyViolation(lifetimes, 14, flatExit)).toEqual({
      class: "daily",
      residencyDays: 16,
    });
  });

  it("uses a per-class exit function, e.g. capped by an archive move threshold", () => {
    const lifetimes: ClassLifetime[] = [
      { class: "daily", lifetimeDays: 40 },
      { class: "weekly", lifetimeDays: 46 },
    ];
    const exitFor = (lifetime: ClassLifetime) =>
      lifetime.class === "daily"
        ? lifetime.lifetimeDays
        : Math.min(20, lifetime.lifetimeDays);
    // entry 5: daily residency 35 (fine); weekly exit min(20,46)=20, residency 15 (violates)
    expect(findVaultResidencyViolation(lifetimes, 5, exitFor)).toEqual({
      class: "weekly",
      residencyDays: 15,
    });
  });
});
