# Vault Minimum Retention Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flag any Vault-typed repository/tier in Simple Mode's Backup Repository Configuration where configured retention and move-day thresholds imply data would be evicted before Veeam Data Cloud Vault's 30-day minimum retention floor.

**Architecture:** A new pure module (`vault-retention.ts`) computes per-restore-point-class lifetimes and a tier's residency (entry day, exit day) against a fixed 30-day constant. `validate-repository-config.ts` gains a second `workloadData` parameter and calls into this module at four sites (turnkey target, Primary Repository, SOBR Performance Tier, SOBR Capacity Tier), each gated on that location's repo type being in the `vault` category. New error fields render as inline messages in `sobr-builder.tsx` and `backup-repository-card.tsx`, matching the existing `archiveFeedUnsupported` pattern.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-06-vault-minimum-retention-design.md` — read it in full before starting; this plan implements it exactly. ADRs 0013/0014/0015 and the `CONTEXT.md` entries (Driving Cadence, Vault Minimum Retention) that this spec calls for are **already written and committed** — no documentation task is needed in this plan.

---

### Task 1: Add `VAULT_MINIMUM_RETENTION_DAYS` constant and new error fields

**Files:**

- Modify: `src/types/simple-mode.ts`

- [ ] **Step 1: Add the constant**

In `src/types/simple-mode.ts`, find this block:

```ts
// Object-storage-only immutability batching window (Block Generation).
// Block/File types are absent — they enforce immutability natively, no
// Block Generation concept applies.
export const BLOCK_GENERATION_DAYS: Partial<Record<RepoType, number>> = {
  "vault-azure": 10,
  "vault-aws": 10,
  "azure-blob": 10,
  "s3-compatible": 10,
  "aws-s3": 30,
  "google-cloud": 30,
};
```

Add immediately after it:

```ts
// Veeam Data Cloud Vault's minimum retention floor (ADR-0013) — a fixed
// constant, independent of a tier's own configurable `immutableDays` field.
export const VAULT_MINIMUM_RETENTION_DAYS = 30;
```

- [ ] **Step 2: Add the new error fields**

Find:

```ts
export interface RepositoryConfigErrors {
  targetRepositoryImmutableDays?: string;
  primary?: {
    immutableDays?: string;
    retention?: RetentionOverrideErrors;
  };
  sobr?: {
    performanceImmutableDays?: string;
    capacityTier?: { moveDays?: string; immutableDays?: string };
    archiveTier?: {
      moveDays?: string;
      immutableDays?: string;
      archiveFeedUnsupported?: string;
    };
  };
  secondaryRetention?: RetentionOverrideErrors;
}
```

Replace with:

```ts
export interface RepositoryConfigErrors {
  targetRepositoryImmutableDays?: string;
  targetRepositoryVaultRetention?: string;
  primary?: {
    immutableDays?: string;
    retention?: RetentionOverrideErrors;
    vaultRetention?: string;
  };
  sobr?: {
    performanceImmutableDays?: string;
    performanceVaultRetention?: string;
    capacityTier?: {
      moveDays?: string;
      immutableDays?: string;
      vaultRetention?: string;
    };
    archiveTier?: {
      moveDays?: string;
      immutableDays?: string;
      archiveFeedUnsupported?: string;
    };
  };
  secondaryRetention?: RetentionOverrideErrors;
}
```

- [ ] **Step 3: Verify the project still builds**

Run: `npm run build`
Expected: succeeds with no TypeScript errors (this change is additive-only; nothing consumes the new fields yet).

- [ ] **Step 4: Commit**

```bash
git add src/types/simple-mode.ts
git commit -m "feat: add Vault minimum retention constant and error fields"
```

---

### Task 2: Build the `vault-retention.ts` module

**Files:**

- Create: `src/lib/simple-mode/vault-retention.ts`
- Test: `src/lib/simple-mode/vault-retention.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/simple-mode/vault-retention.test.ts`:

```ts
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
      { class: "weekly", lifetimeDays: 36 },
    ];
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/simple-mode/vault-retention.test.ts`
Expected: FAIL — `Cannot find module './vault-retention'` (the module doesn't exist yet).

- [ ] **Step 3: Implement the module**

Create `src/lib/simple-mode/vault-retention.ts`:

```ts
import {
  VAULT_MINIMUM_RETENTION_DAYS,
  type RetentionOverride,
  type WorkloadDataValues,
} from "@/types/simple-mode";

export interface EffectiveRetention {
  retentionDays: number;
  gfsWeekly: number;
  gfsMonthly: number;
  gfsYearly: number;
}

export type PointClass = "daily" | "weekly" | "monthly" | "yearly";

export interface ClassLifetime {
  class: PointClass;
  lifetimeDays: number;
}

export interface VaultResidencyViolation {
  class: PointClass;
  residencyDays: number;
}

/**
 * Resolves which retention/GFS values actually govern a pipeline: the
 * override's own fields when it's customized, otherwise workloadData
 * directly.
 */
export function resolveEffectiveRetention(
  workloadData: WorkloadDataValues,
  override?: RetentionOverride,
): EffectiveRetention {
  if (override?.customizeRetention) {
    return {
      retentionDays: Number(override.retentionDays),
      gfsWeekly: Number(override.gfsWeekly),
      gfsMonthly: Number(override.gfsMonthly),
      gfsYearly: Number(override.gfsYearly),
    };
  }
  return {
    retentionDays: Number(workloadData.shortTermRetentionDays),
    gfsWeekly: Number(workloadData.gfsWeekly),
    gfsMonthly: Number(workloadData.gfsMonthly),
    gfsYearly: Number(workloadData.gfsYearly),
  };
}

// The shortest active GFS interval — shared across every class as the
// chain-completion reference (ADR-0014). Veeam attaches Monthly/Yearly
// flags to whichever full is already being created on this cadence, rather
// than spawning an independently-paced chain per class.
function drivingCadenceDays(retention: EffectiveRetention): number | null {
  if (retention.gfsWeekly > 0) return 7;
  if (retention.gfsMonthly > 0) return 30;
  if (retention.gfsYearly > 0) return 365;
  return null;
}

export function computeClassLifetimes(
  retention: EffectiveRetention,
): ClassLifetime[] {
  const lifetimes: ClassLifetime[] = [
    { class: "daily", lifetimeDays: retention.retentionDays },
  ];

  const cadence = drivingCadenceDays(retention);
  if (cadence === null) return lifetimes;

  const chainFloor = cadence - 1 + retention.retentionDays;

  if (retention.gfsWeekly > 0) {
    lifetimes.push({
      class: "weekly",
      lifetimeDays: Math.max(retention.gfsWeekly * 7, chainFloor),
    });
  }
  if (retention.gfsMonthly > 0) {
    lifetimes.push({
      class: "monthly",
      lifetimeDays: Math.max(retention.gfsMonthly * 30, chainFloor),
    });
  }
  if (retention.gfsYearly > 0) {
    lifetimes.push({
      class: "yearly",
      lifetimeDays: Math.max(retention.gfsYearly * 365, chainFloor),
    });
  }

  return lifetimes;
}

/**
 * Finds the most severe Vault minimum-retention violation among a tier's
 * reachable classes. `entryDays` is when data arrives at the tier;
 * `exitFor` computes when a given class leaves it (the caller supplies
 * this — it differs by tier position and Archive Tier/Capacity Tier
 * policy, none of which this function knows about).
 */
export function findVaultResidencyViolation(
  lifetimes: ClassLifetime[],
  entryDays: number,
  exitFor: (lifetime: ClassLifetime) => number,
): VaultResidencyViolation | undefined {
  let binding: VaultResidencyViolation | undefined;

  for (const lifetime of lifetimes) {
    if (lifetime.lifetimeDays <= entryDays) continue;

    const residencyDays = exitFor(lifetime) - entryDays;
    if (residencyDays >= VAULT_MINIMUM_RETENTION_DAYS) continue;

    if (!binding || residencyDays < binding.residencyDays) {
      binding = { class: lifetime.class, residencyDays };
    }
  }

  return binding;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/simple-mode/vault-retention.test.ts`
Expected: PASS — all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/vault-retention.ts src/lib/simple-mode/vault-retention.test.ts
git commit -m "feat: add vault-retention module for GFS lifetime and residency math"
```

---

### Task 3: Thread `workloadData` through `validate-repository-config.test.ts` (mechanical prep)

This task makes no behavioral change — it only updates the existing test file to compile against the new `validateRepositoryConfig(values, workloadData)` signature ahead of Task 5, and fixes two fixture values that would otherwise trip the new Vault check once it exists. Every existing assertion keeps its current expected result.

**Files:**

- Modify: `src/lib/simple-mode/validate-repository-config.test.ts`

- [ ] **Step 1: Replace the whole file**

The two behavioral fixture changes are: `sobr.performanceType` changes from `"vault-azure"` to `"hardened-repository"` (still requires immutability, so existing immutability-related tests are unaffected, but it's no longer Vault-typed so it won't trip the Task 5 check), and `primary.retention.retentionDays` changes from `"7"` to `"30"` (Primary's repo type, `vault-aws`, is Vault-typed with `customizeRetention: true`, so its retention must clear the new 30-day floor). Every `validateRepositoryConfig(...)` call gains `DEFAULT_WORKLOAD_DATA_VALUES` as a second argument.

Replace the entire content of `src/lib/simple-mode/validate-repository-config.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { validateRepositoryConfig } from "./validate-repository-config";
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
} from "@/types/simple-mode";

// A fully valid, fully-enabled configuration: Backup Copy mode, SOBR target,
// Capacity Tier and Archive Tier both enabled, every retention override on.
// This exercises every validated field at once for the "no errors" baseline;
// individual tests below flip one field/trigger at a time.
//
// Performance Tier is Hardened Repository (not a Vault type) and Primary's
// retention is 30 days — both deliberate choices so this fixture also
// passes the Vault minimum-retention check added in a later task, not just
// the pre-existing field-level checks.
const validSobrValues: RepositoryConfigValues = {
  backupPath: "copy",
  targetRepository: "sobr",
  targetRepositoryImmutableDays: "30",
  sobr: {
    performanceType: "hardened-repository",
    performanceImmutableDays: "30",
    capacityTier: {
      enabled: true,
      type: "s3-compatible",
      copyPolicy: false,
      movePolicy: true,
      moveDays: "14",
      immutableDays: "30",
    },
    archiveTier: {
      enabled: true,
      moveDays: "90",
      immutableDays: "365",
      standaloneFullBackups: false,
    },
  },
  primary: {
    repoType: "vault-aws",
    immutableDays: "30",
    retention: {
      customizeRetention: true,
      retentionDays: "30",
      gfsWeekly: "0",
      gfsMonthly: "0",
      gfsYearly: "0",
    },
  },
  secondaryRetention: {
    customizeRetention: true,
    retentionDays: "30",
    gfsWeekly: "4",
    gfsMonthly: "12",
    gfsYearly: "3",
  },
};

describe("validateRepositoryConfig", () => {
  it("returns no errors for a fully valid, fully-enabled configuration", () => {
    expect(
      validateRepositoryConfig(validSobrValues, DEFAULT_WORKLOAD_DATA_VALUES),
    ).toEqual({});
  });

  describe("targetRepositoryImmutableDays", () => {
    const turnkeyValues: RepositoryConfigValues = {
      ...validSobrValues,
      targetRepository: "vault-azure",
    };

    it("is not validated when targetRepository is 'sobr'", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            targetRepositoryImmutableDays: "",
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).targetRepositoryImmutableDays,
      ).toBeUndefined();
    });

    it("requires a value for a turnkey Vault choice", () => {
      expect(
        validateRepositoryConfig(
          {
            ...turnkeyValues,
            targetRepositoryImmutableDays: "",
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).targetRepositoryImmutableDays,
      ).toBe("Required");
    });

    it("rejects 0", () => {
      expect(
        validateRepositoryConfig(
          {
            ...turnkeyValues,
            targetRepositoryImmutableDays: "0",
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).targetRepositoryImmutableDays,
      ).toBe("Must be 1 or greater");
    });

    it("accepts a valid value", () => {
      expect(
        validateRepositoryConfig(turnkeyValues, DEFAULT_WORKLOAD_DATA_VALUES)
          .targetRepositoryImmutableDays,
      ).toBeUndefined();
    });
  });

  describe("primary (Backup Copy mode)", () => {
    it("clears all primary errors when backupPath is 'direct'", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            backupPath: "direct",
            primary: {
              ...validSobrValues.primary,
              immutableDays: "",
              retention: {
                ...validSobrValues.primary.retention,
                retentionDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary,
      ).toBeUndefined();
    });

    it("requires immutableDays when repoType requires immutability", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: { ...validSobrValues.primary, immutableDays: "" },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary?.immutableDays,
      ).toBe("Required");
    });

    it("does not require immutableDays when repoType does not require it", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: {
              ...validSobrValues.primary,
              repoType: "refs-xfs",
              immutableDays: "",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary,
      ).toBeUndefined();
    });

    it("requires retentionDays when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: {
              ...validSobrValues.primary,
              retention: {
                ...validSobrValues.primary.retention,
                retentionDays: "0",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary?.retention?.retentionDays,
      ).toBe("Must be 1 or greater");
    });

    it("does not validate retention fields when customizeRetention is off", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: {
              ...validSobrValues.primary,
              retention: {
                customizeRetention: false,
                retentionDays: "",
                gfsWeekly: "",
                gfsMonthly: "",
                gfsYearly: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary,
      ).toBeUndefined();
    });

    it("rejects a negative GFS value when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            primary: {
              ...validSobrValues.primary,
              retention: {
                ...validSobrValues.primary.retention,
                gfsWeekly: "-1",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary?.retention?.gfsWeekly,
      ).toBe("Must be 0 or greater");
    });
  });

  describe("secondaryRetention (Backup Copy mode)", () => {
    it("is not validated when backupPath is 'direct'", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            backupPath: "direct",
            secondaryRetention: {
              ...validSobrValues.secondaryRetention,
              retentionDays: "",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).secondaryRetention,
      ).toBeUndefined();
    });

    it("requires retentionDays when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            secondaryRetention: {
              ...validSobrValues.secondaryRetention,
              retentionDays: "0",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).secondaryRetention?.retentionDays,
      ).toBe("Must be 1 or greater");
    });

    it("rejects a negative GFS value when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            secondaryRetention: {
              ...validSobrValues.secondaryRetention,
              gfsMonthly: "-1",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).secondaryRetention?.gfsMonthly,
      ).toBe("Must be 0 or greater");
    });
  });

  describe("sobr.performanceImmutableDays", () => {
    it("is not validated when targetRepository is not 'sobr'", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            targetRepository: "vault-azure",
            sobr: { ...validSobrValues.sobr, performanceImmutableDays: "" },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr,
      ).toBeUndefined();
    });

    it("requires a value when performanceType requires immutability", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: { ...validSobrValues.sobr, performanceImmutableDays: "" },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.performanceImmutableDays,
      ).toBe("Required");
    });

    it("does not require a value when performanceType does not require it", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              performanceType: "nas",
              performanceImmutableDays: "",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr,
      ).toBeUndefined();
    });
  });

  describe("sobr.capacityTier", () => {
    it("clears all errors when disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                enabled: false,
                moveDays: "",
                immutableDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier,
      ).toBeUndefined();
    });

    it("requires moveDays to be an integer >= 1 when movePolicy is on", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                moveDays: "0",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier?.moveDays,
      ).toBe("Must be 1 or greater");
    });

    it("does not require moveDays when movePolicy is off", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                movePolicy: false,
                moveDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier?.moveDays,
      ).toBeUndefined();
    });

    it("requires immutableDays unconditionally on type, whenever enabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                immutableDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier?.immutableDays,
      ).toBe("Required");
    });

    it("allows both copyPolicy and movePolicy unchecked (explicitly permissive)", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                copyPolicy: false,
                movePolicy: false,
                moveDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.capacityTier,
      ).toBeUndefined();
    });
  });

  describe("sobr.archiveTier", () => {
    it("clears all errors when disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                enabled: false,
                moveDays: "",
                immutableDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier,
      ).toBeUndefined();
    });

    it("is independent of capacityTier being disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                enabled: false,
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier,
      ).toBeUndefined();
    });

    it("requires moveDays to be an integer >= 1", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                moveDays: "0",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.moveDays,
      ).toBe("Must be 1 or greater");
    });

    it("requires moveDays greater than capacityTier.moveDays when capacity-move is active", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                moveDays: "14",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.moveDays,
      ).toBe("Must be greater than 14");
    });

    it("does not compare against capacityTier.moveDays when movePolicy is off", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                movePolicy: false,
              },
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                moveDays: "1",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.moveDays,
      ).toBeUndefined();
    });

    it("does not compare against capacityTier.moveDays when capacityTier is disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                enabled: false,
              },
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                moveDays: "1",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.moveDays,
      ).toBeUndefined();
    });

    it("requires immutableDays", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              archiveTier: {
                ...validSobrValues.sobr.archiveTier,
                immutableDays: "",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.immutableDays,
      ).toBe("Required");
    });

    it("requires the Performance Tier type to support feeding Archive Tier when Capacity Tier is disabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              performanceType: "google-cloud",
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                enabled: false,
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.archiveFeedUnsupported,
      ).toBe(
        "Google Cloud doesn't support sending data directly to Archive Tier without a Capacity Tier in between. Add a Capacity Tier (with a non-Google-Cloud type), or change the Performance Tier repository type.",
      );
    });

    it("ignores Performance Tier's type once Capacity Tier is the tier feeding Archive Tier", () => {
      // Performance is Google Cloud, but Capacity Tier (s3-compatible, from
      // validSobrValues) is enabled and sits between Performance and Archive,
      // so Performance's type is irrelevant here. This is not "Google Cloud
      // is always fine once Capacity Tier exists" — it passes only because
      // the *Capacity Tier's* type supports feeding Archive Tier.
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              performanceType: "google-cloud",
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.archiveFeedUnsupported,
      ).toBeUndefined();
    });

    it("requires the Capacity Tier type to support feeding Archive Tier when Capacity Tier is enabled", () => {
      expect(
        validateRepositoryConfig(
          {
            ...validSobrValues,
            sobr: {
              ...validSobrValues.sobr,
              capacityTier: {
                ...validSobrValues.sobr.capacityTier,
                type: "google-cloud",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).sobr?.archiveTier?.archiveFeedUnsupported,
      ).toBe(
        "Google Cloud Capacity Tier can't send data to Archive Tier. Change the Capacity Tier repository type.",
      );
    });
  });
});
```

- [ ] **Step 2: Run the full test file to confirm nothing broke**

Run: `npx vitest run src/lib/simple-mode/validate-repository-config.test.ts`
Expected: FAIL to compile/run — `validateRepositoryConfig` is still declared with one parameter in `validate-repository-config.ts`, so passing two arguments is a TypeScript error. This is expected at this point in the plan; proceed to Task 4, which adds new tests (still against the old signature's behavior of ignoring the second argument would be wrong to rely on — Task 5 changes the signature). Do not modify `validate-repository-config.ts` in this task.

- [ ] **Step 3: Commit**

```bash
git add src/lib/simple-mode/validate-repository-config.test.ts
git commit -m "test: thread workloadData through validate-repository-config tests"
```

---

### Task 4: Add failing tests for the four Vault minimum-retention checks

**Files:**

- Modify: `src/lib/simple-mode/validate-repository-config.test.ts`

- [ ] **Step 1: Add the new describe block**

Add the following as a new top-level `describe` block, as a sibling of `describe("validateRepositoryConfig", ...)` (i.e. after its closing `});`, at the end of the file). First, add `WorkloadDataValues` to the type-only import at the top of the file:

Find:

```ts
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
} from "@/types/simple-mode";
```

Replace with:

```ts
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";
```

Then append this block at the end of the file (after the closing `});` of `describe("validateRepositoryConfig", ...)`):

```ts
describe("Vault minimum retention", () => {
  it("app defaults produce no vault-retention violation", () => {
    const errors = validateRepositoryConfig(
      DEFAULT_REPOSITORY_CONFIG_VALUES,
      DEFAULT_WORKLOAD_DATA_VALUES,
    );
    expect(errors.targetRepositoryVaultRetention).toBeUndefined();
    expect(errors.sobr?.performanceVaultRetention).toBeUndefined();
    expect(errors.sobr?.capacityTier?.vaultRetention).toBeUndefined();
  });

  describe("turnkey target", () => {
    const values: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "direct",
      targetRepository: "vault-azure",
      targetRepositoryImmutableDays: "30",
    };
    const lowRetentionWorkloadData: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      shortTermRetentionDays: "10",
      gfsWeekly: "0",
      gfsMonthly: "0",
      gfsYearly: "0",
    };

    it("flags a Vault turnkey target whose retention is under 30 days", () => {
      expect(
        validateRepositoryConfig(values, lowRetentionWorkloadData)
          .targetRepositoryVaultRetention,
      ).toBe(
        "Daily backups would only remain on this Vault Azure repository for 10 days before being removed — Veeam Data Cloud Vault requires backups to remain for at least 30 days. Increase retention (or the relevant GFS count) to at least 30 days, or choose a non-Vault repository type.",
      );
    });

    it("does not fire when retention is exactly 30 days", () => {
      expect(
        validateRepositoryConfig(values, {
          ...lowRetentionWorkloadData,
          shortTermRetentionDays: "30",
        }).targetRepositoryVaultRetention,
      ).toBeUndefined();
    });
  });

  describe("Primary Repository (Backup Copy mode)", () => {
    const baseValues: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
      primary: {
        repoType: "vault-aws",
        immutableDays: "30",
        retention: {
          customizeRetention: true,
          retentionDays: "10",
          gfsWeekly: "0",
          gfsMonthly: "0",
          gfsYearly: "0",
        },
      },
    };

    it("flags a Vault Primary Repository whose retention is under 30 days", () => {
      expect(
        validateRepositoryConfig(baseValues, DEFAULT_WORKLOAD_DATA_VALUES)
          .primary?.vaultRetention,
      ).toBe(
        "Daily backups would only remain on this Vault Primary Repository for 10 days before being removed — Veeam Data Cloud Vault requires backups to remain for at least 30 days. Increase retention (or the relevant GFS count) to at least 30 days, or choose a non-Vault repository type.",
      );
    });

    it("does not fire when retention is exactly 30 days", () => {
      expect(
        validateRepositoryConfig(
          {
            ...baseValues,
            primary: {
              ...baseValues.primary,
              retention: {
                ...baseValues.primary.retention,
                retentionDays: "30",
              },
            },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary?.vaultRetention,
      ).toBeUndefined();
    });

    it("does not fire for a non-Vault Primary type regardless of retention", () => {
      expect(
        validateRepositoryConfig(
          {
            ...baseValues,
            primary: { ...baseValues.primary, repoType: "refs-xfs" },
          },
          DEFAULT_WORKLOAD_DATA_VALUES,
        ).primary?.vaultRetention,
      ).toBeUndefined();
    });

    it("skips the check when the override's own retention fields are already invalid", () => {
      const errors = validateRepositoryConfig(
        {
          ...baseValues,
          primary: {
            ...baseValues.primary,
            retention: {
              ...baseValues.primary.retention,
              retentionDays: "0",
            },
          },
        },
        DEFAULT_WORKLOAD_DATA_VALUES,
      );
      expect(errors.primary?.retention?.retentionDays).toBe(
        "Must be 1 or greater",
      );
      expect(errors.primary?.vaultRetention).toBeUndefined();
    });
  });

  describe("SOBR Performance Tier", () => {
    const values: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "direct",
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        performanceType: "vault-azure",
        performanceImmutableDays: "30",
        capacityTier: {
          enabled: true,
          type: "s3-compatible",
          copyPolicy: false,
          movePolicy: true,
          moveDays: "14",
          immutableDays: "30",
        },
      },
    };
    const workloadData: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      shortTermRetentionDays: "30",
      gfsWeekly: "4",
      gfsMonthly: "0",
      gfsYearly: "0",
    };

    it("flags a Vault Performance Tier moved off to Capacity before 30 days", () => {
      expect(
        validateRepositoryConfig(values, workloadData).sobr
          ?.performanceVaultRetention,
      ).toBe(
        'Daily backups would only remain on this Vault Performance Tier for 14 days before being removed — Veeam Data Cloud Vault requires backups to remain for at least 30 days. Increase the move threshold to at least 30 days, enable "Copy backups as soon as they are created" on Capacity Tier, or choose a non-Vault Performance Tier type.',
      );
    });

    it("does not fire for a non-Vault Performance Tier type", () => {
      expect(
        validateRepositoryConfig(
          {
            ...values,
            sobr: { ...values.sobr, performanceType: "refs-xfs" },
          },
          workloadData,
        ).sobr?.performanceVaultRetention,
      ).toBeUndefined();
    });

    it("does not fire when Capacity Tier's move threshold is at least 30 days", () => {
      expect(
        validateRepositoryConfig(
          {
            ...values,
            sobr: {
              ...values.sobr,
              capacityTier: { ...values.sobr.capacityTier, moveDays: "30" },
            },
          },
          workloadData,
        ).sobr?.performanceVaultRetention,
      ).toBeUndefined();
    });
  });

  describe("SOBR Capacity Tier", () => {
    const values: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "direct",
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        performanceType: "refs-xfs",
        capacityTier: {
          enabled: true,
          type: "vault-azure",
          copyPolicy: false,
          movePolicy: true,
          moveDays: "14",
          immutableDays: "30",
        },
      },
    };
    const workloadData: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      shortTermRetentionDays: "30",
      gfsWeekly: "4",
      gfsMonthly: "0",
      gfsYearly: "0",
    };

    it("flags a Vault Capacity Tier emptied by natural retention before 30 days (no Archive Tier)", () => {
      expect(
        validateRepositoryConfig(values, workloadData).sobr?.capacityTier
          ?.vaultRetention,
      ).toBe(
        'Daily backups would only remain on this Vault Capacity Tier for 16 days before being removed — Veeam Data Cloud Vault requires backups to remain for at least 30 days. Increase the move threshold, increase retention, enable "Copy backups as soon as they are created," or choose a non-Vault Capacity Tier type.',
      );
    });

    it("does not fire when Copy is enabled (data lands on Capacity from day 0)", () => {
      expect(
        validateRepositoryConfig(
          {
            ...values,
            sobr: {
              ...values.sobr,
              capacityTier: { ...values.sobr.capacityTier, copyPolicy: true },
            },
          },
          workloadData,
        ).sobr?.capacityTier?.vaultRetention,
      ).toBeUndefined();
    });

    it("flags a Vault Capacity Tier whose Archive Tier move-out happens too early", () => {
      const archiveValues: RepositoryConfigValues = {
        ...values,
        sobr: {
          ...values.sobr,
          capacityTier: {
            ...values.sobr.capacityTier,
            moveDays: "5",
          },
          archiveTier: {
            enabled: true,
            moveDays: "20",
            immutableDays: "365",
            standaloneFullBackups: false,
          },
        },
      };
      expect(
        validateRepositoryConfig(archiveValues, {
          ...workloadData,
          shortTermRetentionDays: "40",
        }).sobr?.capacityTier?.vaultRetention,
      ).toBe(
        'Weekly GFS points would only remain on this Vault Capacity Tier for 15 days before being removed — Veeam Data Cloud Vault requires backups to remain for at least 30 days. Increase the move threshold, increase retention, enable "Copy backups as soon as they are created," or choose a non-Vault Capacity Tier type.',
      );
    });

    it("does not fire for an inert Capacity Tier (copyPolicy and movePolicy both off), regardless of retention", () => {
      expect(
        validateRepositoryConfig(
          {
            ...values,
            sobr: {
              ...values.sobr,
              capacityTier: {
                ...values.sobr.capacityTier,
                copyPolicy: false,
                movePolicy: false,
                moveDays: "",
              },
            },
          },
          { ...workloadData, shortTermRetentionDays: "1" },
        ).sobr?.capacityTier?.vaultRetention,
      ).toBeUndefined();
    });

    it("does not fire for a non-Vault Capacity Tier type", () => {
      expect(
        validateRepositoryConfig(
          {
            ...values,
            sobr: {
              ...values.sobr,
              capacityTier: {
                ...values.sobr.capacityTier,
                type: "s3-compatible",
              },
            },
          },
          { ...workloadData, shortTermRetentionDays: "1" },
        ).sobr?.capacityTier?.vaultRetention,
      ).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/lib/simple-mode/validate-repository-config.test.ts`
Expected: FAIL — every test inside the new `describe("Vault minimum retention", ...)` block fails (the new error fields are always `undefined` because `validate-repository-config.ts` doesn't compute them yet, and the function still only accepts one parameter, which is now a TypeScript compile error across the whole file). All tests inside the original `describe("validateRepositoryConfig", ...)` block also currently fail to compile for the same reason — this is expected; Task 5 fixes the signature and implements the checks, making everything pass together.

- [ ] **Step 3: Commit**

```bash
git add src/lib/simple-mode/validate-repository-config.test.ts
git commit -m "test: add failing tests for Vault minimum retention checks"
```

---

### Task 5: Implement the four Vault minimum-retention checks

**Files:**

- Modify: `src/lib/simple-mode/validate-repository-config.ts`

- [ ] **Step 1: Replace the whole file**

Replace the entire content of `src/lib/simple-mode/validate-repository-config.ts` with:

```ts
import type {
  RepositoryConfigErrors,
  RepositoryConfigValues,
  RetentionOverride,
  RetentionOverrideErrors,
  WorkloadDataValues,
} from "@/types/simple-mode";
import {
  REPO_TYPE_CATEGORY,
  REPO_TYPE_LABEL,
  repoTypeCanFeedArchiveTier,
  repoTypeRequiresImmutability,
  VAULT_MINIMUM_RETENTION_DAYS,
} from "@/types/simple-mode";
import {
  computeClassLifetimes,
  findVaultResidencyViolation,
  resolveEffectiveRetention,
  type ClassLifetime,
  type EffectiveRetention,
  type PointClass,
  type VaultResidencyViolation,
} from "./vault-retention";
import { validateWorkloadData } from "./validate-workload-data";

interface NumberRules {
  integer?: boolean;
  min?: number;
}

function requireNumber(raw: string, rules: NumberRules): string | undefined {
  if (raw.trim() === "") {
    return "Required";
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return "Must be a number";
  }

  if (rules.integer && !Number.isInteger(value)) {
    return "Must be a whole number";
  }

  if (rules.min !== undefined && value < rules.min) {
    return `Must be ${rules.min} or greater`;
  }

  return undefined;
}

function validateRetentionOverride(
  override: RetentionOverride,
): RetentionOverrideErrors | undefined {
  if (!override.customizeRetention) return undefined;

  const errors: RetentionOverrideErrors = {};

  const retentionDaysError = requireNumber(override.retentionDays, {
    integer: true,
    min: 1,
  });
  if (retentionDaysError) errors.retentionDays = retentionDaysError;

  for (const key of ["gfsWeekly", "gfsMonthly", "gfsYearly"] as const) {
    const error = requireNumber(override[key], { integer: true, min: 0 });
    if (error) errors[key] = error;
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}

const POINT_CLASS_LABEL: Record<PointClass, string> = {
  daily: "Daily backups",
  weekly: "Weekly GFS points",
  monthly: "Monthly GFS points",
  yearly: "Yearly GFS points",
};

function formatVaultRetentionMessage(
  violation: VaultResidencyViolation,
  locationLabel: string,
  suggestion: string,
): string {
  return (
    `${POINT_CLASS_LABEL[violation.class]} would only remain on this ${locationLabel} ` +
    `for ${violation.residencyDays} days before being removed — Veeam Data Cloud Vault ` +
    `requires backups to remain for at least ${VAULT_MINIMUM_RETENTION_DAYS} days. ${suggestion}`
  );
}

// Resolves the retention that governs a pipeline, or undefined if the
// inputs it would depend on already have a validation error of their own
// (an empty/invalid field parses to a misleading number rather than NaN,
// e.g. Number("") === 0 — so this is an explicit skip, not a NaN check).
function effectiveRetentionOrSkip(
  workloadData: WorkloadDataValues,
  workloadRetentionValid: boolean,
  override: RetentionOverride | undefined,
): EffectiveRetention | undefined {
  if (override?.customizeRetention) {
    if (validateRetentionOverride(override)) return undefined;
    return resolveEffectiveRetention(workloadData, override);
  }
  return workloadRetentionValid
    ? resolveEffectiveRetention(workloadData, override)
    : undefined;
}

const FLAT_EXIT = (lifetime: ClassLifetime) => lifetime.lifetimeDays;

export function validateRepositoryConfig(
  values: RepositoryConfigValues,
  workloadData: WorkloadDataValues,
): RepositoryConfigErrors {
  const errors: RepositoryConfigErrors = {};

  const workloadDataErrors = validateWorkloadData(workloadData);
  const workloadRetentionValid =
    !workloadDataErrors.shortTermRetentionDays &&
    !workloadDataErrors.gfsWeekly &&
    !workloadDataErrors.gfsMonthly &&
    !workloadDataErrors.gfsYearly;

  // The retention governing the SOBR/turnkey target: secondaryRetention in
  // Backup Copy mode, workloadData directly in Direct mode. Shared by the
  // turnkey, Performance Tier, and Capacity Tier checks below.
  const targetRetention = effectiveRetentionOrSkip(
    workloadData,
    workloadRetentionValid,
    values.backupPath === "copy" ? values.secondaryRetention : undefined,
  );

  if (values.targetRepository !== "sobr") {
    const error = requireNumber(values.targetRepositoryImmutableDays, {
      integer: true,
      min: 1,
    });
    if (error) errors.targetRepositoryImmutableDays = error;

    if (targetRetention) {
      const violation = findVaultResidencyViolation(
        computeClassLifetimes(targetRetention),
        0,
        FLAT_EXIT,
      );
      if (violation) {
        errors.targetRepositoryVaultRetention = formatVaultRetentionMessage(
          violation,
          `${REPO_TYPE_LABEL[values.targetRepository]} repository`,
          `Increase retention (or the relevant GFS count) to at least ${VAULT_MINIMUM_RETENTION_DAYS} days, or choose a non-Vault repository type.`,
        );
      }
    }
  }

  if (values.backupPath === "copy") {
    const primaryErrors: NonNullable<RepositoryConfigErrors["primary"]> = {};

    if (repoTypeRequiresImmutability(values.primary.repoType)) {
      const error = requireNumber(values.primary.immutableDays, {
        integer: true,
        min: 1,
      });
      if (error) primaryErrors.immutableDays = error;
    }

    const retentionErrors = validateRetentionOverride(values.primary.retention);
    if (retentionErrors) primaryErrors.retention = retentionErrors;

    if (REPO_TYPE_CATEGORY[values.primary.repoType] === "vault") {
      const primaryRetention = effectiveRetentionOrSkip(
        workloadData,
        workloadRetentionValid,
        values.primary.retention,
      );
      if (primaryRetention) {
        const violation = findVaultResidencyViolation(
          computeClassLifetimes(primaryRetention),
          0,
          FLAT_EXIT,
        );
        if (violation) {
          primaryErrors.vaultRetention = formatVaultRetentionMessage(
            violation,
            "Vault Primary Repository",
            `Increase retention (or the relevant GFS count) to at least ${VAULT_MINIMUM_RETENTION_DAYS} days, or choose a non-Vault repository type.`,
          );
        }
      }
    }

    if (Object.keys(primaryErrors).length > 0) errors.primary = primaryErrors;

    const secondaryRetentionErrors = validateRetentionOverride(
      values.secondaryRetention,
    );
    if (secondaryRetentionErrors) {
      errors.secondaryRetention = secondaryRetentionErrors;
    }
  }

  if (values.targetRepository === "sobr") {
    const sobrErrors: NonNullable<RepositoryConfigErrors["sobr"]> = {};
    const { capacityTier, archiveTier } = values.sobr;

    if (repoTypeRequiresImmutability(values.sobr.performanceType)) {
      const error = requireNumber(values.sobr.performanceImmutableDays, {
        integer: true,
        min: 1,
      });
      if (error) sobrErrors.performanceImmutableDays = error;
    }

    if (
      REPO_TYPE_CATEGORY[values.sobr.performanceType] === "vault" &&
      targetRetention
    ) {
      const performanceUsesCapacityExit =
        capacityTier.enabled && capacityTier.movePolicy;
      const performanceUsesArchiveExit =
        !capacityTier.enabled && archiveTier.enabled;

      const capacityMoveDaysValid =
        !performanceUsesCapacityExit ||
        requireNumber(capacityTier.moveDays, { integer: true, min: 1 }) ===
          undefined;
      const archiveMoveDaysValid =
        !performanceUsesArchiveExit ||
        requireNumber(archiveTier.moveDays, { integer: true, min: 1 }) ===
          undefined;

      if (capacityMoveDaysValid && archiveMoveDaysValid) {
        const performanceExit = (lifetime: ClassLifetime): number => {
          if (performanceUsesCapacityExit) {
            return Math.min(
              Number(capacityTier.moveDays),
              lifetime.lifetimeDays,
            );
          }
          if (performanceUsesArchiveExit && lifetime.class !== "daily") {
            return Math.min(
              Number(archiveTier.moveDays),
              lifetime.lifetimeDays,
            );
          }
          return lifetime.lifetimeDays;
        };

        const violation = findVaultResidencyViolation(
          computeClassLifetimes(targetRetention),
          0,
          performanceExit,
        );
        if (violation) {
          sobrErrors.performanceVaultRetention = formatVaultRetentionMessage(
            violation,
            "Vault Performance Tier",
            `Increase the move threshold to at least ${VAULT_MINIMUM_RETENTION_DAYS} days, enable "Copy backups as soon as they are created" on Capacity Tier, or choose a non-Vault Performance Tier type.`,
          );
        }
      }
    }

    if (capacityTier.enabled) {
      const capacityErrors: {
        moveDays?: string;
        immutableDays?: string;
        vaultRetention?: string;
      } = {};

      if (capacityTier.movePolicy) {
        const error = requireNumber(capacityTier.moveDays, {
          integer: true,
          min: 1,
        });
        if (error) capacityErrors.moveDays = error;
      }

      const immutableError = requireNumber(capacityTier.immutableDays, {
        integer: true,
        min: 1,
      });
      if (immutableError) capacityErrors.immutableDays = immutableError;

      if (
        REPO_TYPE_CATEGORY[capacityTier.type] === "vault" &&
        targetRetention &&
        !capacityErrors.moveDays
      ) {
        const entryDays = capacityTier.copyPolicy
          ? 0
          : capacityTier.movePolicy
            ? Number(capacityTier.moveDays)
            : undefined;

        const archiveMoveDaysValid =
          !archiveTier.enabled ||
          requireNumber(archiveTier.moveDays, { integer: true, min: 1 }) ===
            undefined;

        if (entryDays !== undefined && archiveMoveDaysValid) {
          const capacityExit = (lifetime: ClassLifetime): number => {
            if (lifetime.class === "daily") return lifetime.lifetimeDays;
            return archiveTier.enabled
              ? Math.min(Number(archiveTier.moveDays), lifetime.lifetimeDays)
              : lifetime.lifetimeDays;
          };

          const violation = findVaultResidencyViolation(
            computeClassLifetimes(targetRetention),
            entryDays,
            capacityExit,
          );
          if (violation) {
            capacityErrors.vaultRetention = formatVaultRetentionMessage(
              violation,
              "Vault Capacity Tier",
              `Increase the move threshold, increase retention, enable "Copy backups as soon as they are created," or choose a non-Vault Capacity Tier type.`,
            );
          }
        }
      }

      if (Object.keys(capacityErrors).length > 0) {
        sobrErrors.capacityTier = capacityErrors;
      }
    }

    if (archiveTier.enabled) {
      const archiveErrors: {
        moveDays?: string;
        immutableDays?: string;
        archiveFeedUnsupported?: string;
      } = {};

      const moveDaysError = requireNumber(archiveTier.moveDays, {
        integer: true,
        min: 1,
      });
      if (moveDaysError) {
        archiveErrors.moveDays = moveDaysError;
      } else if (capacityTier.enabled && capacityTier.movePolicy) {
        const capacityMoveDays = Number(capacityTier.moveDays);
        if (
          Number.isFinite(capacityMoveDays) &&
          Number(archiveTier.moveDays) <= capacityMoveDays
        ) {
          archiveErrors.moveDays = `Must be greater than ${capacityTier.moveDays}`;
        }
      }

      const immutableError = requireNumber(archiveTier.immutableDays, {
        integer: true,
        min: 1,
      });
      if (immutableError) archiveErrors.immutableDays = immutableError;

      const archiveSourceType = capacityTier.enabled
        ? capacityTier.type
        : values.sobr.performanceType;

      if (!repoTypeCanFeedArchiveTier(archiveSourceType)) {
        const sourceLabel = REPO_TYPE_LABEL[archiveSourceType];
        archiveErrors.archiveFeedUnsupported = capacityTier.enabled
          ? `${sourceLabel} Capacity Tier can't send data to Archive Tier. ` +
            `Change the Capacity Tier repository type.`
          : `${sourceLabel} doesn't support sending data directly to Archive ` +
            `Tier without a Capacity Tier in between. Add a Capacity Tier ` +
            `(with a non-Google-Cloud type), or change the Performance Tier ` +
            `repository type.`;
      }

      if (Object.keys(archiveErrors).length > 0) {
        sobrErrors.archiveTier = archiveErrors;
      }
    }

    if (Object.keys(sobrErrors).length > 0) errors.sobr = sobrErrors;
  }

  return errors;
}
```

- [ ] **Step 2: Run the full test file to verify everything passes**

Run: `npx vitest run src/lib/simple-mode/validate-repository-config.test.ts`
Expected: PASS — every test in the file (both the original describe block and the new "Vault minimum retention" block) is green.

- [ ] **Step 3: Run the whole test suite to check for regressions elsewhere**

Run: `npx vitest run`
Expected: `backup-repository-card.test.tsx`, `simple-mode-page.test.tsx`, and `App.test.tsx` will fail at this point — all three render `BackupRepositoryCard` (directly or transitively via `SimpleModePage`/`App`), which still calls `validateRepositoryConfig(value)` with only one argument internally. Vite/Vitest doesn't type-check at runtime, so this doesn't fail to compile — instead `workloadData` is `undefined` inside `validateRepositoryConfig`, and `validateWorkloadData(undefined)` throws when it tries to read a property off it, crashing any test that renders that component tree. This is expected; Task 7 fixes the call site. If any _other_ file fails, stop and investigate before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/lib/simple-mode/validate-repository-config.ts
git commit -m "feat: implement Vault minimum retention checks in validateRepositoryConfig"
```

---

### Task 6: Render the new messages in `sobr-builder.tsx`

**Files:**

- Modify: `src/components/simple-mode/sobr-builder.tsx`
- Modify: `src/components/simple-mode/sobr-builder.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these two tests to the end of the `describe("SobrBuilder", ...)` block in `src/components/simple-mode/sobr-builder.test.tsx` (immediately before the block's closing `});`):

```tsx
it("shows the performance vault-retention message when present in errors", () => {
  render(
    <SobrBuilder
      value={{ ...defaultSobr, performanceType: "vault-azure" }}
      errors={{
        performanceVaultRetention:
          'Daily backups would only remain on this Vault Performance Tier for 14 days before being removed — Veeam Data Cloud Vault requires backups to remain for at least 30 days. Increase the move threshold to at least 30 days, enable "Copy backups as soon as they are created" on Capacity Tier, or choose a non-Vault Performance Tier type.',
      }}
      onChange={vi.fn()}
    />,
  );

  expect(
    screen.getByText(/would only remain on this vault performance tier/i),
  ).toBeInTheDocument();
});

it("shows the capacity vault-retention message when present in errors", () => {
  render(
    <SobrBuilder
      value={{
        ...defaultSobr,
        capacityTier: {
          ...defaultSobr.capacityTier,
          enabled: true,
          type: "vault-azure",
        },
      }}
      errors={{
        capacityTier: {
          vaultRetention:
            'Daily backups would only remain on this Vault Capacity Tier for 16 days before being removed — Veeam Data Cloud Vault requires backups to remain for at least 30 days. Increase the move threshold, increase retention, enable "Copy backups as soon as they are created," or choose a non-Vault Capacity Tier type.',
        },
      }}
      onChange={vi.fn()}
    />,
  );

  expect(
    screen.getByText(/would only remain on this vault capacity tier/i),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/simple-mode/sobr-builder.test.tsx`
Expected: FAIL — both new tests fail with "Unable to find an element with the text" (the messages aren't rendered yet).

- [ ] **Step 3: Render the messages**

In `src/components/simple-mode/sobr-builder.tsx`, find the Performance Tier block:

```tsx
      <div className="border-tier-performance flex flex-col gap-2 border-l-2 pl-4">
        <h3 className="text-tier-performance text-sm font-semibold">
          Performance Tier
        </h3>
        <RepoTypePicker
```

Replace with:

```tsx
      <div className="border-tier-performance flex flex-col gap-2 border-l-2 pl-4">
        <h3 className="text-tier-performance text-sm font-semibold">
          Performance Tier
        </h3>
        {errors?.performanceVaultRetention ? (
          <p className="text-destructive text-xs">
            {errors.performanceVaultRetention}
          </p>
        ) : null}
        <RepoTypePicker
```

Then find the Capacity Tier's enabled-state header:

```tsx
            <div className="flex items-center justify-between">
              <h3 className="text-tier-capacity text-sm font-semibold">
                Capacity Tier
              </h3>
              <button
                type="button"
                onClick={() => setCapacityTier({ enabled: false })}
                className="text-muted-foreground text-xs underline"
              >
                Remove
              </button>
            </div>
            <RepoTypePicker
```

Replace with:

```tsx
            <div className="flex items-center justify-between">
              <h3 className="text-tier-capacity text-sm font-semibold">
                Capacity Tier
              </h3>
              <button
                type="button"
                onClick={() => setCapacityTier({ enabled: false })}
                className="text-muted-foreground text-xs underline"
              >
                Remove
              </button>
            </div>
            {errors?.capacityTier?.vaultRetention ? (
              <p className="text-destructive text-xs">
                {errors.capacityTier.vaultRetention}
              </p>
            ) : null}
            <RepoTypePicker
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/simple-mode/sobr-builder.test.tsx`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/sobr-builder.tsx src/components/simple-mode/sobr-builder.test.tsx
git commit -m "feat: render Vault minimum-retention messages in SobrBuilder"
```

---

### Task 7: Render the new messages in `backup-repository-card.tsx` and fix its `validateRepositoryConfig` call

**Files:**

- Modify: `src/components/simple-mode/backup-repository-card.tsx`
- Modify: `src/components/simple-mode/backup-repository-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Add this test to the end of the `describe("BackupRepositoryCard", ...)` block in `src/components/simple-mode/backup-repository-card.test.tsx` (immediately before the block's closing `});`):

```tsx
it("shows the target vault-retention message when the turnkey target's retention is under 30 days", () => {
  function LowRetentionHarness() {
    const [value, setValue] = useState<RepositoryConfigValues>({
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "vault-azure",
    });
    return (
      <BackupRepositoryCard
        value={value}
        workloadData={{
          ...DEFAULT_WORKLOAD_DATA_VALUES,
          shortTermRetentionDays: "10",
          gfsWeekly: "0",
          gfsMonthly: "0",
          gfsYearly: "0",
        }}
        onChange={setValue}
      />
    );
  }
  render(<LowRetentionHarness />);

  expect(
    screen.getByText(/would only remain on this vault azure repository/i),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/simple-mode/backup-repository-card.test.tsx`
Expected: FAIL — the whole file fails because `validateRepositoryConfig(value)` inside `backup-repository-card.tsx` is called with only one argument, a TypeScript error against the new two-parameter signature from Task 5.

- [ ] **Step 3: Fix the call site and render the messages**

In `src/components/simple-mode/backup-repository-card.tsx`, find:

```tsx
const errors = validateRepositoryConfig(value);
```

Replace with:

```tsx
const errors = validateRepositoryConfig(value, workloadData);
```

Then find the turnkey target's immutability error paragraph:

```tsx
          {errors.targetRepositoryImmutableDays ? (
            <p className="text-destructive text-xs">
              {errors.targetRepositoryImmutableDays}
            </p>
          ) : null}
        </div>
      ) : (
```

Replace with:

```tsx
          {errors.targetRepositoryImmutableDays ? (
            <p className="text-destructive text-xs">
              {errors.targetRepositoryImmutableDays}
            </p>
          ) : null}
          {errors.targetRepositoryVaultRetention ? (
            <p className="text-destructive text-xs">
              {errors.targetRepositoryVaultRetention}
            </p>
          ) : null}
        </div>
      ) : (
```

Then find the Primary Repository block's `RetentionOverrideBlock`:

```tsx
            {repoTypeRequiresImmutability(value.primary.repoType) ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={primaryImmutableId}>Immutable for (Days)</Label>
                <Input
                  id={primaryImmutableId}
                  aria-label="Primary immutability period (days)"
                  value={value.primary.immutableDays}
                  inputMode="numeric"
                  onChange={(e) =>
                    onChange({
                      ...value,
                      primary: {
                        ...value.primary,
                        immutableDays: e.target.value,
                      },
                    })
                  }
                  aria-invalid={
                    errors.primary?.immutableDays ? true : undefined
                  }
                  className="w-20"
                />
                {errors.primary?.immutableDays ? (
                  <p className="text-destructive text-xs">
                    {errors.primary.immutableDays}
                  </p>
                ) : null}
              </div>
            ) : null}
            <RetentionOverrideBlock
              context="Primary"
```

Replace with:

```tsx
            {repoTypeRequiresImmutability(value.primary.repoType) ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={primaryImmutableId}>Immutable for (Days)</Label>
                <Input
                  id={primaryImmutableId}
                  aria-label="Primary immutability period (days)"
                  value={value.primary.immutableDays}
                  inputMode="numeric"
                  onChange={(e) =>
                    onChange({
                      ...value,
                      primary: {
                        ...value.primary,
                        immutableDays: e.target.value,
                      },
                    })
                  }
                  aria-invalid={
                    errors.primary?.immutableDays ? true : undefined
                  }
                  className="w-20"
                />
                {errors.primary?.immutableDays ? (
                  <p className="text-destructive text-xs">
                    {errors.primary.immutableDays}
                  </p>
                ) : null}
              </div>
            ) : null}
            {errors.primary?.vaultRetention ? (
              <p className="text-destructive text-xs">
                {errors.primary.vaultRetention}
              </p>
            ) : null}
            <RetentionOverrideBlock
              context="Primary"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/simple-mode/backup-repository-card.test.tsx`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/backup-repository-card.tsx src/components/simple-mode/backup-repository-card.test.tsx
git commit -m "feat: render Vault minimum-retention messages in BackupRepositoryCard"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — every test file in the project, with no failures.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 4: Confirm nothing is left uncommitted**

Run: `git status`
Expected: working tree clean (everything was committed at the end of each task).

If any of these fail, fix the issue, re-run the failing command, and commit the fix with a message describing what was wrong (e.g. `fix: correct lint error in vault-retention.ts`) before considering the plan complete.
