# Simple Mode: Backup Repository Configuration Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Backup Repository Configuration card ("Vault Configuration" in the UI) beneath the existing Workload Data card in Simple Mode — Backup Path toggle, turnkey Vault Azure/AWS/SOBR Builder target selection, a three-tier SOBR Builder, and symmetric retention inheritance for Backup Copy's two independent pipelines.

**Architecture:** A single canonical `RepoType` enum (with per-context allowed subsets) backs three repo-type pickers (Primary, Performance Tier, Capacity Tier) via one shared `RepoTypePicker` component. A shared `RetentionOverrideBlock` handles the "customize retention, otherwise mirror Workload Data" pattern for both Primary and Secondary. `SobrBuilder` composes the three SOBR tier rows. `BackupRepositoryCard` orchestrates all of the above and owns nothing but layout and wiring. Validation is one pure function, `validateRepositoryConfig`, following the exact pattern `validateWorkloadData` already established.

**Tech Stack:** React 19 + TypeScript (strict), Tailwind v4 (`@theme inline` tokens in `src/index.css`), shadcn/ui (`new-york` style) component conventions, Radix primitives via the unified `radix-ui` package, Vitest + React Testing Library + `@testing-library/user-event`.

**Spec:** `docs/superpowers/specs/2026-07-05-simple-mode-backup-repository-design.md`
**Related ADRs:** `docs/adr/0001-delegate-sizing-to-veeam-calculator-api.md`, `docs/adr/0004-workload-form-fields-are-strings-not-numbers.md`, `docs/adr/0005-test-controlled-inputs-with-a-stateful-harness.md`, `docs/adr/0006-field-labels-use-label-bold-not-body-sm.md`

---

## File Structure

```
src/
├── types/
│   └── simple-mode.ts                         # modify — add RepoType, RetentionOverride, RepositoryConfigValues, etc.
├── lib/simple-mode/
│   ├── validate-repository-config.ts          # create
│   └── validate-repository-config.test.ts     # create
├── components/
│   ├── ui/
│   │   ├── checkbox.tsx                       # create
│   │   └── radio-group.tsx                    # create
│   └── simple-mode/
│       ├── repo-type-picker.tsx                # create
│       ├── repo-type-picker.test.tsx           # create
│       ├── retention-override-block.tsx        # create
│       ├── retention-override-block.test.tsx   # create
│       ├── sobr-builder.tsx                    # create
│       ├── sobr-builder.test.tsx               # create
│       ├── backup-repository-card.tsx          # create
│       ├── backup-repository-card.test.tsx     # create
│       ├── simple-mode-page.tsx                # modify — add RepositoryConfigValues state
│       └── simple-mode-page.test.tsx           # modify — assert Vault Configuration renders
```

Each task below is independently committable and leaves the test suite green.

**Note on visible label text vs. accessible names:** The mockup shows the same visible text ("Immutable for (Days)", "Retention (Days)", "GFS Weekly", etc.) in up to five places on this card simultaneously (Primary, turnkey target, Performance Tier, Capacity Tier, Archive Tier). To keep those fields independently queryable — in tests and for screen readers — every such input carries a visible `<Label>` with the generic mockup text, plus a distinct `aria-label` (e.g. `"Primary immutability period (days)"`, `"Capacity Tier immutability period (days)"`). `aria-label` wins for accessible-name computation, so `getByLabelText` and screen readers disambiguate correctly while sighted users still see the plain mockup wording.

---

### Task 1: Data model — extend `src/types/simple-mode.ts`

**Files:**

- Modify: `src/types/simple-mode.ts`

- [ ] **Step 1: Add the new types, lookup tables, and defaults**

Append to the end of `src/types/simple-mode.ts` (the existing `WorkloadDataValues` content stays unchanged above this):

```ts
export type RepoType =
  | "vault-azure"
  | "vault-aws"
  | "refs-xfs"
  | "linux-hardened"
  | "nas"
  | "s3-compatible"
  | "aws-s3"
  | "azure-blob";

export type RepoCategory = "vault" | "on-prem" | "cloud-object";

export const REPO_TYPE_CATEGORY: Record<RepoType, RepoCategory> = {
  "vault-azure": "vault",
  "vault-aws": "vault",
  "refs-xfs": "on-prem",
  "linux-hardened": "on-prem",
  nas: "on-prem",
  "s3-compatible": "cloud-object",
  "aws-s3": "cloud-object",
  "azure-blob": "cloud-object",
};

export const REPO_TYPE_LABEL: Record<RepoType, string> = {
  "vault-azure": "Vault Azure",
  "vault-aws": "Vault AWS",
  "refs-xfs": "ReFS/XFS",
  "linux-hardened": "Linux Hardened",
  nas: "NAS",
  "s3-compatible": "S3 Compatible",
  "aws-s3": "AWS S3",
  "azure-blob": "Azure Blob",
};

export const REPO_CATEGORY_LABEL: Record<RepoCategory, string> = {
  vault: "Vault",
  "on-prem": "On-Prem",
  "cloud-object": "Cloud Object Storage",
};

// Vault types, Linux Hardened, and every cloud-object type support immutability.
// Plain ReFS/XFS and NAS don't.
export const REPO_TYPES_REQUIRING_IMMUTABILITY = new Set<RepoType>([
  "vault-azure",
  "vault-aws",
  "linux-hardened",
  "s3-compatible",
  "aws-s3",
  "azure-blob",
]);

export function repoTypeRequiresImmutability(type: RepoType): boolean {
  return REPO_TYPES_REQUIRING_IMMUTABILITY.has(type);
}

// Primary and Performance Tier allow the full set: Vault-to-Vault copy jobs
// and Direct-to-Object primary architectures are both real scenarios.
export const ALL_REPO_TYPES: RepoType[] = [
  "vault-azure",
  "vault-aws",
  "refs-xfs",
  "linux-hardened",
  "nas",
  "s3-compatible",
  "aws-s3",
  "azure-blob",
];
export const PRIMARY_REPO_TYPES: RepoType[] = ALL_REPO_TYPES;
export const PERFORMANCE_TIER_TYPES: RepoType[] = ALL_REPO_TYPES;
// No on-prem, no NAS — the brief never lists NAS as a valid Capacity Tier target.
export const CAPACITY_TIER_TYPES: RepoType[] = [
  "vault-azure",
  "vault-aws",
  "s3-compatible",
  "aws-s3",
  "azure-blob",
];

export interface RetentionOverride {
  customizeRetention: boolean;
  retentionDays: string;
  gfsWeekly: string;
  gfsMonthly: string;
  gfsYearly: string;
}

export type RetentionOverrideErrors = Partial<
  Record<Exclude<keyof RetentionOverride, "customizeRetention">, string>
>;

export interface PrimaryRepositoryConfig {
  repoType: RepoType;
  immutableDays: string;
  retention: RetentionOverride;
}

export interface CapacityTierConfig {
  enabled: boolean;
  type: RepoType;
  copyPolicy: boolean;
  movePolicy: boolean;
  moveDays: string;
  immutableDays: string;
}

export interface ArchiveTierConfig {
  enabled: boolean;
  moveDays: string;
  immutableDays: string;
  standaloneFullBackups: boolean;
}

export interface SobrConfig {
  performanceType: RepoType;
  performanceImmutableDays: string;
  capacityTier: CapacityTierConfig;
  archiveTier: ArchiveTierConfig;
}

export type TargetRepository = "vault-azure" | "vault-aws" | "sobr";

export interface RepositoryConfigValues {
  backupPath: "direct" | "copy";
  targetRepository: TargetRepository;
  targetRepositoryImmutableDays: string;
  sobr: SobrConfig;
  primary: PrimaryRepositoryConfig;
  secondaryRetention: RetentionOverride;
}

export interface RepositoryConfigErrors {
  targetRepositoryImmutableDays?: string;
  primary?: {
    immutableDays?: string;
    retention?: RetentionOverrideErrors;
  };
  sobr?: {
    performanceImmutableDays?: string;
    capacityTier?: { moveDays?: string; immutableDays?: string };
    archiveTier?: { moveDays?: string; immutableDays?: string };
  };
  secondaryRetention?: RetentionOverrideErrors;
}

export const DEFAULT_RETENTION_OVERRIDE: RetentionOverride = {
  customizeRetention: false,
  retentionDays: "30",
  gfsWeekly: "4",
  gfsMonthly: "12",
  gfsYearly: "3",
};

export const DEFAULT_REPOSITORY_CONFIG_VALUES: RepositoryConfigValues = {
  backupPath: "direct",
  targetRepository: "sobr",
  targetRepositoryImmutableDays: "30",
  sobr: {
    performanceType: "refs-xfs",
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
      enabled: false,
      moveDays: "90",
      immutableDays: "365",
      standaloneFullBackups: false,
    },
  },
  primary: {
    repoType: "refs-xfs",
    immutableDays: "30",
    retention: { ...DEFAULT_RETENTION_OVERRIDE },
  },
  secondaryRetention: { ...DEFAULT_RETENTION_OVERRIDE },
};
```

These match `docs/superpowers/specs/2026-07-05-simple-mode-backup-repository-design.md`'s Data Model and Defaults sections exactly. `PRIMARY_REPO_TYPES`/`PERFORMANCE_TIER_TYPES` share `ALL_REPO_TYPES` by reference rather than duplicating the array, per that spec's consolidation.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/types/simple-mode.ts
git commit -m "feat: add RepositoryConfigValues types and defaults for Simple Mode"
```

---

### Task 2: `validateRepositoryConfig`

**Files:**

- Create: `src/lib/simple-mode/validate-repository-config.ts`
- Test: `src/lib/simple-mode/validate-repository-config.test.ts`

The rules are fully specified in the design spec's Validation Matrix, so — matching how `validate-workload-data.ts` was built — the complete test suite is written first, confirmed red, then the complete implementation is written in one pass.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { validateRepositoryConfig } from "./validate-repository-config";
import type { RepositoryConfigValues } from "@/types/simple-mode";

// A fully valid, fully-enabled configuration: Backup Copy mode, SOBR target,
// Capacity Tier and Archive Tier both enabled, every retention override on.
// This exercises every validated field at once for the "no errors" baseline;
// individual tests below flip one field/trigger at a time.
const validSobrValues: RepositoryConfigValues = {
  backupPath: "copy",
  targetRepository: "sobr",
  targetRepositoryImmutableDays: "30",
  sobr: {
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
      retentionDays: "7",
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
    expect(validateRepositoryConfig(validSobrValues)).toEqual({});
  });

  describe("targetRepositoryImmutableDays", () => {
    const turnkeyValues: RepositoryConfigValues = {
      ...validSobrValues,
      targetRepository: "vault-azure",
    };

    it("is not validated when targetRepository is 'sobr'", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          targetRepositoryImmutableDays: "",
        }).targetRepositoryImmutableDays,
      ).toBeUndefined();
    });

    it("requires a value for a turnkey Vault choice", () => {
      expect(
        validateRepositoryConfig({
          ...turnkeyValues,
          targetRepositoryImmutableDays: "",
        }).targetRepositoryImmutableDays,
      ).toBe("Required");
    });

    it("rejects 0", () => {
      expect(
        validateRepositoryConfig({
          ...turnkeyValues,
          targetRepositoryImmutableDays: "0",
        }).targetRepositoryImmutableDays,
      ).toBe("Must be 1 or greater");
    });

    it("accepts a valid value", () => {
      expect(
        validateRepositoryConfig(turnkeyValues).targetRepositoryImmutableDays,
      ).toBeUndefined();
    });
  });

  describe("primary (Backup Copy mode)", () => {
    it("clears all primary errors when backupPath is 'direct'", () => {
      expect(
        validateRepositoryConfig({
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
        }).primary,
      ).toBeUndefined();
    });

    it("requires immutableDays when repoType requires immutability", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          primary: { ...validSobrValues.primary, immutableDays: "" },
        }).primary?.immutableDays,
      ).toBe("Required");
    });

    it("does not require immutableDays when repoType does not require it", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          primary: {
            ...validSobrValues.primary,
            repoType: "refs-xfs",
            immutableDays: "",
          },
        }).primary,
      ).toBeUndefined();
    });

    it("requires retentionDays when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          primary: {
            ...validSobrValues.primary,
            retention: {
              ...validSobrValues.primary.retention,
              retentionDays: "0",
            },
          },
        }).primary?.retention?.retentionDays,
      ).toBe("Must be 1 or greater");
    });

    it("does not validate retention fields when customizeRetention is off", () => {
      expect(
        validateRepositoryConfig({
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
        }).primary,
      ).toBeUndefined();
    });

    it("rejects a negative GFS value when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          primary: {
            ...validSobrValues.primary,
            retention: {
              ...validSobrValues.primary.retention,
              gfsWeekly: "-1",
            },
          },
        }).primary?.retention?.gfsWeekly,
      ).toBe("Must be 0 or greater");
    });
  });

  describe("secondaryRetention (Backup Copy mode)", () => {
    it("is not validated when backupPath is 'direct'", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          backupPath: "direct",
          secondaryRetention: {
            ...validSobrValues.secondaryRetention,
            retentionDays: "",
          },
        }).secondaryRetention,
      ).toBeUndefined();
    });

    it("requires retentionDays when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          secondaryRetention: {
            ...validSobrValues.secondaryRetention,
            retentionDays: "0",
          },
        }).secondaryRetention?.retentionDays,
      ).toBe("Must be 1 or greater");
    });

    it("rejects a negative GFS value when customizeRetention is on", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          secondaryRetention: {
            ...validSobrValues.secondaryRetention,
            gfsMonthly: "-1",
          },
        }).secondaryRetention?.gfsMonthly,
      ).toBe("Must be 0 or greater");
    });
  });

  describe("sobr.performanceImmutableDays", () => {
    it("is not validated when targetRepository is not 'sobr'", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          targetRepository: "vault-azure",
          sobr: { ...validSobrValues.sobr, performanceImmutableDays: "" },
        }).sobr,
      ).toBeUndefined();
    });

    it("requires a value when performanceType requires immutability", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: { ...validSobrValues.sobr, performanceImmutableDays: "" },
        }).sobr?.performanceImmutableDays,
      ).toBe("Required");
    });

    it("does not require a value when performanceType does not require it", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            performanceType: "nas",
            performanceImmutableDays: "",
          },
        }).sobr,
      ).toBeUndefined();
    });
  });

  describe("sobr.capacityTier", () => {
    it("clears all errors when disabled", () => {
      expect(
        validateRepositoryConfig({
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
        }).sobr?.capacityTier,
      ).toBeUndefined();
    });

    it("requires moveDays to be an integer >= 1 when movePolicy is on", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            capacityTier: {
              ...validSobrValues.sobr.capacityTier,
              moveDays: "0",
            },
          },
        }).sobr?.capacityTier?.moveDays,
      ).toBe("Must be 1 or greater");
    });

    it("does not require moveDays when movePolicy is off", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            capacityTier: {
              ...validSobrValues.sobr.capacityTier,
              movePolicy: false,
              moveDays: "",
            },
          },
        }).sobr?.capacityTier?.moveDays,
      ).toBeUndefined();
    });

    it("requires immutableDays unconditionally on type, whenever enabled", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            capacityTier: {
              ...validSobrValues.sobr.capacityTier,
              immutableDays: "",
            },
          },
        }).sobr?.capacityTier?.immutableDays,
      ).toBe("Required");
    });

    it("allows both copyPolicy and movePolicy unchecked (explicitly permissive)", () => {
      expect(
        validateRepositoryConfig({
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
        }).sobr?.capacityTier,
      ).toBeUndefined();
    });
  });

  describe("sobr.archiveTier", () => {
    it("clears all errors when disabled", () => {
      expect(
        validateRepositoryConfig({
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
        }).sobr?.archiveTier,
      ).toBeUndefined();
    });

    it("is independent of capacityTier being disabled", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            capacityTier: {
              ...validSobrValues.sobr.capacityTier,
              enabled: false,
            },
          },
        }).sobr?.archiveTier,
      ).toBeUndefined();
    });

    it("requires moveDays to be an integer >= 1", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            archiveTier: { ...validSobrValues.sobr.archiveTier, moveDays: "0" },
          },
        }).sobr?.archiveTier?.moveDays,
      ).toBe("Must be 1 or greater");
    });

    it("requires moveDays greater than capacityTier.moveDays when capacity-move is active", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            archiveTier: {
              ...validSobrValues.sobr.archiveTier,
              moveDays: "14",
            },
          },
        }).sobr?.archiveTier?.moveDays,
      ).toBe("Must be greater than 14");
    });

    it("does not compare against capacityTier.moveDays when movePolicy is off", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            capacityTier: {
              ...validSobrValues.sobr.capacityTier,
              movePolicy: false,
            },
            archiveTier: { ...validSobrValues.sobr.archiveTier, moveDays: "1" },
          },
        }).sobr?.archiveTier?.moveDays,
      ).toBeUndefined();
    });

    it("does not compare against capacityTier.moveDays when capacityTier is disabled", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            capacityTier: {
              ...validSobrValues.sobr.capacityTier,
              enabled: false,
            },
            archiveTier: { ...validSobrValues.sobr.archiveTier, moveDays: "1" },
          },
        }).sobr?.archiveTier?.moveDays,
      ).toBeUndefined();
    });

    it("requires immutableDays", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            archiveTier: {
              ...validSobrValues.sobr.archiveTier,
              immutableDays: "",
            },
          },
        }).sobr?.archiveTier?.immutableDays,
      ).toBe("Required");
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/simple-mode/validate-repository-config.test.ts`
Expected: FAIL — `Cannot find module './validate-repository-config'`.

- [ ] **Step 3: Write the implementation**

```ts
import type {
  RepositoryConfigErrors,
  RepositoryConfigValues,
  RetentionOverride,
  RetentionOverrideErrors,
} from "@/types/simple-mode";
import { repoTypeRequiresImmutability } from "@/types/simple-mode";

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

export function validateRepositoryConfig(
  values: RepositoryConfigValues,
): RepositoryConfigErrors {
  const errors: RepositoryConfigErrors = {};

  if (values.targetRepository !== "sobr") {
    const error = requireNumber(values.targetRepositoryImmutableDays, {
      integer: true,
      min: 1,
    });
    if (error) errors.targetRepositoryImmutableDays = error;
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

    if (capacityTier.enabled) {
      const capacityErrors: { moveDays?: string; immutableDays?: string } = {};

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

      if (Object.keys(capacityErrors).length > 0) {
        sobrErrors.capacityTier = capacityErrors;
      }
    }

    if (archiveTier.enabled) {
      const archiveErrors: { moveDays?: string; immutableDays?: string } = {};

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

      if (Object.keys(archiveErrors).length > 0) {
        sobrErrors.archiveTier = archiveErrors;
      }
    }

    if (Object.keys(sobrErrors).length > 0) errors.sobr = sobrErrors;
  }

  return errors;
}
```

This mirrors `validate-workload-data.ts`'s `requireNumber` helper (a fresh local copy — the two validators stay independent, matching this codebase's existing pattern of self-contained sibling modules rather than a shared cross-file helper). Every trigger and rule matches the design spec's Validation Matrix exactly, including the archive-vs-capacity guard only firing when capacity's own `moveDays` parses to a finite number.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/simple-mode/validate-repository-config.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/validate-repository-config.ts src/lib/simple-mode/validate-repository-config.test.ts
git commit -m "feat: add validateRepositoryConfig for Backup Repository Configuration"
```

---

### Task 3: `Checkbox` and `RadioGroup` UI primitives

**Files:**

- Create: `src/components/ui/checkbox.tsx`
- Create: `src/components/ui/radio-group.tsx`

No dedicated test files — matches this project's existing convention for `src/components/ui/*` primitives (`button.tsx`, `card.tsx`, `toggle.tsx`, `input.tsx`, `label.tsx` have no test files).

- [ ] **Step 1: Create the Checkbox primitive**

```tsx
import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "border-input size-4 shrink-0 rounded-sm border bg-transparent transition-colors outline-none",
        "focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        <Check className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
```

- [ ] **Step 2: Create the RadioGroup primitive**

```tsx
import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("flex items-center gap-6", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "border-input size-4 shrink-0 rounded-full border bg-transparent transition-colors outline-none",
        "focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-primary",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <span className="bg-primary size-2 rounded-full" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
```

Both use `@radix-ui/react-checkbox` and `@radix-ui/react-radio-group` via the unified `radix-ui` package already in `package.json` — no new dependency install needed, matching how `toggle-group.tsx` and `label.tsx` already consume it.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/checkbox.tsx src/components/ui/radio-group.tsx
git commit -m "feat: add Checkbox and RadioGroup UI primitives"
```

---

### Task 4: `RepoTypePicker`

**Files:**

- Create: `src/components/simple-mode/repo-type-picker.tsx`
- Test: `src/components/simple-mode/repo-type-picker.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RepoTypePicker } from "./repo-type-picker";
import {
  ALL_REPO_TYPES,
  CAPACITY_TIER_TYPES,
  type RepoType,
} from "@/types/simple-mode";

describe("RepoTypePicker", () => {
  it("renders only categories present in allowedTypes", () => {
    render(
      <RepoTypePicker
        value="s3-compatible"
        allowedTypes={CAPACITY_TIER_TYPES}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Vault" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cloud Object Storage" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "On-Prem" }),
    ).not.toBeInTheDocument();
  });

  it("defaults the active category to the one containing the current value", () => {
    render(
      <RepoTypePicker
        value="vault-aws"
        allowedTypes={ALL_REPO_TYPES}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Vault Azure" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ReFS/XFS" }),
    ).not.toBeInTheDocument();
  });

  it("clicking a category switches the visible type row", async () => {
    const user = userEvent.setup();
    render(
      <RepoTypePicker
        value="vault-azure"
        allowedTypes={ALL_REPO_TYPES}
        onChange={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Cloud Object Storage" }),
    );

    expect(
      screen.getByRole("button", { name: "S3 Compatible" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vault Azure" }),
    ).not.toBeInTheDocument();
  });

  it("calls onChange with the selected type", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <RepoTypePicker
        value="vault-azure"
        allowedTypes={ALL_REPO_TYPES}
        onChange={handleChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Vault AWS" }));

    expect(handleChange).toHaveBeenCalledWith("vault-aws");
  });

  it("re-syncs to the new category when the parent overwrites value across categories", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<RepoType>("refs-xfs");
      return (
        <>
          <RepoTypePicker
            value={value}
            allowedTypes={ALL_REPO_TYPES}
            onChange={setValue}
          />
          {/* Simulates a parent that reassigns `value` by some means other
              than this picker's own onChange — a reset button, a preset
              switch, etc. A controlled component must reflect its `value`
              prop regardless of how the parent changes it. */}
          <button type="button" onClick={() => setValue("s3-compatible")}>
            Simulate external overwrite
          </button>
        </>
      );
    }
    render(<Harness />);

    expect(
      screen.getByRole("button", { name: "ReFS/XFS" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Simulate external overwrite" }),
    );

    expect(
      screen.queryByRole("button", { name: "ReFS/XFS" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "S3 Compatible" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/simple-mode/repo-type-picker.test.tsx`
Expected: FAIL — `Cannot find module './repo-type-picker'`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  REPO_CATEGORY_LABEL,
  REPO_TYPE_CATEGORY,
  REPO_TYPE_LABEL,
  type RepoCategory,
  type RepoType,
} from "@/types/simple-mode";

interface RepoTypePickerProps {
  value: RepoType;
  allowedTypes: RepoType[];
  onChange: (value: RepoType) => void;
}

const CATEGORY_ORDER: RepoCategory[] = ["vault", "on-prem", "cloud-object"];

export function RepoTypePicker({
  value,
  allowedTypes,
  onChange,
}: RepoTypePickerProps) {
  const [activeCategory, setActiveCategory] = useState<RepoCategory>(
    REPO_TYPE_CATEGORY[value],
  );

  // A controlled component must reflect its `value` prop regardless of how
  // the parent changes it — not just via this picker's own onChange. Without
  // this, a parent that reassigns `value` to a type in a different category
  // by some other means (a reset, a preset switch) would leave the picker
  // showing the wrong category, and the real selection would appear to have
  // no highlighted button at all. This is the render-phase "adjusting state
  // when a prop changes" pattern React's own docs recommend for this case —
  // it avoids the extra-render flicker a useEffect-based sync would cause.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setActiveCategory(REPO_TYPE_CATEGORY[value]);
  }

  const categories = CATEGORY_ORDER.filter((category) =>
    allowedTypes.some((type) => REPO_TYPE_CATEGORY[type] === category),
  );

  const typesInActiveCategory = allowedTypes.filter(
    (type) => REPO_TYPE_CATEGORY[type] === activeCategory,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            aria-pressed={category === activeCategory}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              category === activeCategory
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-accent",
            )}
          >
            {REPO_CATEGORY_LABEL[category]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {typesInActiveCategory.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            aria-pressed={type === value}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              type === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-input bg-background hover:bg-accent",
            )}
          >
            {REPO_TYPE_LABEL[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
```

`activeCategory` is local UI state — it starts at whichever category contains the initial `value`, and a category-button click changes only what's displayed (no `onChange` call). A type-button click calls `onChange` with a concrete `RepoType`, which normally lands back in the same category the user was already browsing. The `lastValue` mirror exists for the other case: nothing in this plan currently reassigns `value` from outside the picker's own `onChange`, but as a reusable controlled component it still needs to honor its `value` prop if something someday does (a reset, a preset switch) — without the mirror, that would silently leave the picker showing the wrong category with no visible selection at all, even though the underlying value is fine.

Note this doesn't fully generalize to every field in this plan: `RetentionOverrideBlock`, `SobrBuilder`, and `BackupRepositoryCard` all read `value.*` directly on every render with no local mirrors of their own, so they already reflect external `value` changes correctly — `RepoTypePicker` is the only place in this plan that initializes local state from a prop, which is why it's the only place needing this pattern.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/simple-mode/repo-type-picker.test.tsx`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/repo-type-picker.tsx src/components/simple-mode/repo-type-picker.test.tsx
git commit -m "feat: add RepoTypePicker grouped toggle component"
```

---

### Task 5: `RetentionOverrideBlock`

**Files:**

- Create: `src/components/simple-mode/retention-override-block.tsx`
- Test: `src/components/simple-mode/retention-override-block.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RetentionOverrideBlock } from "./retention-override-block";
import {
  DEFAULT_RETENTION_OVERRIDE,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RetentionOverride,
} from "@/types/simple-mode";

describe("RetentionOverrideBlock", () => {
  it("shows the inherited display computed from workloadData when unchecked", () => {
    render(
      <RetentionOverrideBlock
        context="Primary"
        checkboxLabel="Customize retention"
        value={DEFAULT_RETENTION_OVERRIDE}
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/retaining 30 dailies \+ 4w \/ 12m \/ 3y/i),
    ).toBeInTheDocument();
  });

  it("reveals the retention grid, pre-seeded from workloadData, when checked", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<RetentionOverride>(
        DEFAULT_RETENTION_OVERRIDE,
      );
      return (
        <RetentionOverrideBlock
          context="Primary"
          checkboxLabel="Customize retention"
          value={value}
          workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByLabelText(/customize retention/i));

    expect(screen.getByLabelText(/primary retention \(days\)/i)).toHaveValue(
      "30",
    );
    expect(screen.getByLabelText(/primary gfs weekly/i)).toHaveValue("4");
  });

  it("unchecking hides the grid without clearing the underlying value", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<RetentionOverride>({
        customizeRetention: true,
        retentionDays: "45",
        gfsWeekly: "2",
        gfsMonthly: "6",
        gfsYearly: "1",
      });
      return (
        <RetentionOverrideBlock
          context="Primary"
          checkboxLabel="Customize retention"
          value={value}
          workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
          onChange={setValue}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByLabelText(/customize retention/i));

    expect(
      screen.queryByLabelText(/primary retention \(days\)/i),
    ).not.toBeInTheDocument();

    // Re-checking re-seeds from workloadData rather than restoring "45" —
    // the override always starts from whatever Workload Data currently is.
    await user.click(screen.getByLabelText(/customize retention/i));

    expect(screen.getByLabelText(/primary retention \(days\)/i)).toHaveValue(
      "30",
    );
  });

  it("shows a validation error on an individual field", () => {
    render(
      <RetentionOverrideBlock
        context="Secondary"
        checkboxLabel="Customize copy retention"
        value={{
          customizeRetention: true,
          retentionDays: "0",
          gfsWeekly: "4",
          gfsMonthly: "12",
          gfsYearly: "3",
        }}
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        errors={{ retentionDays: "Must be 1 or greater" }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText(/secondary retention \(days\)/i),
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Must be 1 or greater")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/simple-mode/retention-override-block.test.tsx`
Expected: FAIL — `Cannot find module './retention-override-block'`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  RetentionOverride,
  RetentionOverrideErrors,
  WorkloadDataValues,
} from "@/types/simple-mode";

interface RetentionOverrideBlockProps {
  context: string;
  checkboxLabel: string;
  value: RetentionOverride;
  workloadData: WorkloadDataValues;
  errors?: RetentionOverrideErrors;
  onChange: (value: RetentionOverride) => void;
}

export function RetentionOverrideBlock({
  context,
  checkboxLabel,
  value,
  workloadData,
  errors,
  onChange,
}: RetentionOverrideBlockProps) {
  const checkboxId = useId();
  const retentionDaysId = useId();
  const gfsWeeklyId = useId();
  const gfsMonthlyId = useId();
  const gfsYearlyId = useId();

  function handleCheckedChange(checked: boolean | "indeterminate") {
    if (checked === true) {
      onChange({
        customizeRetention: true,
        retentionDays: workloadData.shortTermRetentionDays,
        gfsWeekly: workloadData.gfsWeekly,
        gfsMonthly: workloadData.gfsMonthly,
        gfsYearly: workloadData.gfsYearly,
      });
    } else {
      onChange({ ...value, customizeRetention: false });
    }
  }

  function setField<K extends keyof RetentionOverride>(
    key: K,
    fieldValue: RetentionOverride[K],
  ) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={value.customizeRetention}
          onCheckedChange={handleCheckedChange}
        />
        <Label
          htmlFor={checkboxId}
          className="text-muted-foreground font-normal tracking-normal normal-case"
        >
          {checkboxLabel} (currently mirroring Workload Data)
        </Label>
      </div>

      {value.customizeRetention ? (
        <div className="grid grid-cols-4 gap-3 pl-6">
          <div className="flex flex-col gap-1">
            <Label htmlFor={retentionDaysId}>Retention (Days)</Label>
            <Input
              id={retentionDaysId}
              aria-label={`${context} retention (days)`}
              value={value.retentionDays}
              inputMode="numeric"
              onChange={(e) => setField("retentionDays", e.target.value)}
              aria-invalid={errors?.retentionDays ? true : undefined}
            />
            {errors?.retentionDays ? (
              <p className="text-destructive text-xs">{errors.retentionDays}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={gfsWeeklyId}>GFS Weekly</Label>
            <Input
              id={gfsWeeklyId}
              aria-label={`${context} GFS Weekly`}
              value={value.gfsWeekly}
              inputMode="numeric"
              onChange={(e) => setField("gfsWeekly", e.target.value)}
              aria-invalid={errors?.gfsWeekly ? true : undefined}
            />
            {errors?.gfsWeekly ? (
              <p className="text-destructive text-xs">{errors.gfsWeekly}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={gfsMonthlyId}>GFS Monthly</Label>
            <Input
              id={gfsMonthlyId}
              aria-label={`${context} GFS Monthly`}
              value={value.gfsMonthly}
              inputMode="numeric"
              onChange={(e) => setField("gfsMonthly", e.target.value)}
              aria-invalid={errors?.gfsMonthly ? true : undefined}
            />
            {errors?.gfsMonthly ? (
              <p className="text-destructive text-xs">{errors.gfsMonthly}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={gfsYearlyId}>GFS Yearly</Label>
            <Input
              id={gfsYearlyId}
              aria-label={`${context} GFS Yearly`}
              value={value.gfsYearly}
              inputMode="numeric"
              onChange={(e) => setField("gfsYearly", e.target.value)}
              aria-invalid={errors?.gfsYearly ? true : undefined}
            />
            {errors?.gfsYearly ? (
              <p className="text-destructive text-xs">{errors.gfsYearly}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground pl-6 text-sm">
          ↳ Retaining {workloadData.shortTermRetentionDays} Dailies +{" "}
          {workloadData.gfsWeekly}W / {workloadData.gfsMonthly}M /{" "}
          {workloadData.gfsYearly}Y
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/simple-mode/retention-override-block.test.tsx`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/retention-override-block.tsx src/components/simple-mode/retention-override-block.test.tsx
git commit -m "feat: add RetentionOverrideBlock with Workload Data inheritance"
```

---

### Task 6: `SobrBuilder`

**Files:**

- Create: `src/components/simple-mode/sobr-builder.tsx`
- Test: `src/components/simple-mode/sobr-builder.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SobrBuilder } from "./sobr-builder";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  type SobrConfig,
} from "@/types/simple-mode";

const defaultSobr = DEFAULT_REPOSITORY_CONFIG_VALUES.sobr;

describe("SobrBuilder", () => {
  it("hides the Performance Tier immutability field when the type does not require it", () => {
    render(<SobrBuilder value={defaultSobr} onChange={vi.fn()} />);

    expect(
      screen.queryByLabelText(/performance tier immutability period/i),
    ).not.toBeInTheDocument();
  });

  it("shows the Performance Tier immutability field when the type requires it", () => {
    render(
      <SobrBuilder
        value={{ ...defaultSobr, performanceType: "vault-azure" }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText(/performance tier immutability period/i),
    ).toBeInTheDocument();
  });

  it("always shows the Capacity Tier immutability field when enabled, regardless of type", () => {
    render(<SobrBuilder value={defaultSobr} onChange={vi.fn()} />);

    expect(
      screen.getByLabelText(/capacity tier immutability period/i),
    ).toBeInTheDocument();
  });

  it("allows adding Archive Tier while Capacity Tier is disabled", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<SobrConfig>({
        ...defaultSobr,
        capacityTier: { ...defaultSobr.capacityTier, enabled: false },
      });
      return <SobrBuilder value={value} onChange={setValue} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /add archive tier/i }));

    expect(
      screen.getByLabelText(/move gfs archives older than/i),
    ).toBeInTheDocument();
  });

  it("toggles Copy and Move policies independently", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<SobrBuilder value={defaultSobr} onChange={handleChange} />);

    await user.click(screen.getByLabelText(/copy backups immediately/i));

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        capacityTier: expect.objectContaining({
          copyPolicy: true,
          movePolicy: true,
        }),
      }),
    );
  });

  it("shows the standalone-full-backups checkbox once Archive Tier is added", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<SobrConfig>(defaultSobr);
      return <SobrBuilder value={value} onChange={setValue} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /add archive tier/i }));

    expect(
      screen.getByLabelText(/standalone full backups/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/simple-mode/sobr-builder.test.tsx`
Expected: FAIL — `Cannot find module './sobr-builder'`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RepoTypePicker } from "./repo-type-picker";
import {
  CAPACITY_TIER_TYPES,
  PERFORMANCE_TIER_TYPES,
  repoTypeRequiresImmutability,
  type RepositoryConfigErrors,
  type SobrConfig,
} from "@/types/simple-mode";

interface SobrBuilderProps {
  value: SobrConfig;
  errors?: RepositoryConfigErrors["sobr"];
  onChange: (value: SobrConfig) => void;
}

export function SobrBuilder({ value, errors, onChange }: SobrBuilderProps) {
  const performanceImmutableId = useId();
  const capacityEnabledId = useId();
  const copyPolicyId = useId();
  const movePolicyId = useId();
  const capacityMoveDaysId = useId();
  const capacityImmutableId = useId();
  const archiveMoveDaysId = useId();
  const archiveImmutableId = useId();
  const standaloneId = useId();

  const showPerformanceImmutability = repoTypeRequiresImmutability(
    value.performanceType,
  );

  function setCapacityTier(patch: Partial<SobrConfig["capacityTier"]>) {
    onChange({ ...value, capacityTier: { ...value.capacityTier, ...patch } });
  }

  function setArchiveTier(patch: Partial<SobrConfig["archiveTier"]>) {
    onChange({ ...value, archiveTier: { ...value.archiveTier, ...patch } });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-tier-performance flex flex-col gap-3 border-l-2 pl-4">
        <h3 className="text-tier-performance text-sm font-semibold">
          Performance Tier
        </h3>
        <RepoTypePicker
          value={value.performanceType}
          allowedTypes={PERFORMANCE_TIER_TYPES}
          onChange={(performanceType) =>
            onChange({ ...value, performanceType })
          }
        />
        {showPerformanceImmutability ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={performanceImmutableId}>Immutable for (Days)</Label>
            <Input
              id={performanceImmutableId}
              aria-label="Performance Tier immutability period (days)"
              value={value.performanceImmutableDays}
              inputMode="numeric"
              onChange={(e) =>
                onChange({
                  ...value,
                  performanceImmutableDays: e.target.value,
                })
              }
              aria-invalid={errors?.performanceImmutableDays ? true : undefined}
            />
            {errors?.performanceImmutableDays ? (
              <p className="text-destructive text-xs">
                {errors.performanceImmutableDays}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="border-tier-capacity flex flex-col gap-3 border-l-2 pl-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id={capacityEnabledId}
            checked={value.capacityTier.enabled}
            onCheckedChange={(checked) =>
              setCapacityTier({ enabled: checked === true })
            }
          />
          <Label
            htmlFor={capacityEnabledId}
            className="text-tier-capacity font-semibold tracking-normal normal-case"
          >
            Capacity Tier
          </Label>
        </div>

        {value.capacityTier.enabled ? (
          <>
            <RepoTypePicker
              value={value.capacityTier.type}
              allowedTypes={CAPACITY_TIER_TYPES}
              onChange={(type) => setCapacityTier({ type })}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id={copyPolicyId}
                checked={value.capacityTier.copyPolicy}
                onCheckedChange={(checked) =>
                  setCapacityTier({ copyPolicy: checked === true })
                }
              />
              <Label
                htmlFor={copyPolicyId}
                className="font-normal tracking-normal normal-case"
              >
                Copy backups immediately
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={movePolicyId}
                checked={value.capacityTier.movePolicy}
                onCheckedChange={(checked) =>
                  setCapacityTier({ movePolicy: checked === true })
                }
              />
              <Label
                htmlFor={movePolicyId}
                className="font-normal tracking-normal normal-case"
              >
                Move backups older than
              </Label>
              {value.capacityTier.movePolicy ? (
                <Input
                  id={capacityMoveDaysId}
                  aria-label="Move backups older than (days)"
                  value={value.capacityTier.moveDays}
                  inputMode="numeric"
                  onChange={(e) =>
                    setCapacityTier({ moveDays: e.target.value })
                  }
                  aria-invalid={
                    errors?.capacityTier?.moveDays ? true : undefined
                  }
                  className="w-20"
                />
              ) : null}
              <span className="text-muted-foreground text-sm">days</span>
            </div>
            {errors?.capacityTier?.moveDays ? (
              <p className="text-destructive text-xs">
                {errors.capacityTier.moveDays}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor={capacityImmutableId}>Immutable for (Days)</Label>
              <Input
                id={capacityImmutableId}
                aria-label="Capacity Tier immutability period (days)"
                value={value.capacityTier.immutableDays}
                inputMode="numeric"
                onChange={(e) =>
                  setCapacityTier({ immutableDays: e.target.value })
                }
                aria-invalid={
                  errors?.capacityTier?.immutableDays ? true : undefined
                }
              />
              {errors?.capacityTier?.immutableDays ? (
                <p className="text-destructive text-xs">
                  {errors.capacityTier.immutableDays}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="border-tier-archive flex flex-col gap-3 border-l-2 pl-4">
        <h3 className="text-tier-archive text-sm font-semibold">
          Archive Tier
        </h3>
        {!value.archiveTier.enabled ? (
          <button
            type="button"
            onClick={() => setArchiveTier({ enabled: true })}
            className="text-muted-foreground rounded-lg border border-dashed px-4 py-3 text-left text-sm"
          >
            + Add Archive Tier (Configure GFS Offloading)
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Label htmlFor={archiveMoveDaysId}>
                Move GFS archives older than
              </Label>
              <Input
                id={archiveMoveDaysId}
                aria-label="Move GFS archives older than (days)"
                value={value.archiveTier.moveDays}
                inputMode="numeric"
                onChange={(e) => setArchiveTier({ moveDays: e.target.value })}
                aria-invalid={errors?.archiveTier?.moveDays ? true : undefined}
                className="w-20"
              />
              <span className="text-muted-foreground text-sm">days</span>
              <button
                type="button"
                onClick={() => setArchiveTier({ enabled: false })}
                className="text-muted-foreground ml-auto text-xs underline"
              >
                Remove
              </button>
            </div>
            {errors?.archiveTier?.moveDays ? (
              <p className="text-destructive text-xs">
                {errors.archiveTier.moveDays}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor={archiveImmutableId}>Immutable for (Days)</Label>
              <Input
                id={archiveImmutableId}
                aria-label="Archive Tier immutability period (days)"
                value={value.archiveTier.immutableDays}
                inputMode="numeric"
                onChange={(e) =>
                  setArchiveTier({ immutableDays: e.target.value })
                }
                aria-invalid={
                  errors?.archiveTier?.immutableDays ? true : undefined
                }
              />
              {errors?.archiveTier?.immutableDays ? (
                <p className="text-destructive text-xs">
                  {errors.archiveTier.immutableDays}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={standaloneId}
                checked={value.archiveTier.standaloneFullBackups}
                onCheckedChange={(checked) =>
                  setArchiveTier({ standaloneFullBackups: checked === true })
                }
              />
              <Label
                htmlFor={standaloneId}
                className="font-normal tracking-normal normal-case"
              >
                Standalone full backups (no shared blocks)
              </Label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

Archive Tier's `+ Add` button is unconditional on Capacity Tier's state — clicking it only sets `archiveTier.enabled`, never touches `capacityTier`. Capacity Tier's immutability field has no type-based condition (unlike Performance Tier's), since every type in `CAPACITY_TIER_TYPES` requires immutability.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/simple-mode/sobr-builder.test.tsx`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/sobr-builder.tsx src/components/simple-mode/sobr-builder.test.tsx
git commit -m "feat: add SobrBuilder with independent tier policies"
```

---

### Task 7: `BackupRepositoryCard`

**Files:**

- Create: `src/components/simple-mode/backup-repository-card.tsx`
- Test: `src/components/simple-mode/backup-repository-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BackupRepositoryCard } from "./backup-repository-card";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
} from "@/types/simple-mode";

function Harness({ initial }: { initial: RepositoryConfigValues }) {
  const [value, setValue] = useState(initial);
  return (
    <BackupRepositoryCard
      value={value}
      workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
      onChange={setValue}
    />
  );
}

describe("BackupRepositoryCard", () => {
  it("renders the Vault Configuration title", () => {
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(screen.getByText("Vault Configuration")).toBeInTheDocument();
  });

  it("does not show the Primary Repository track in Direct mode", () => {
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(
      screen.queryByRole("heading", { name: /primary repository/i }),
    ).not.toBeInTheDocument();
  });

  it("stacks the Primary track above the Secondary block when switching to Backup Copy", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    await user.click(screen.getByLabelText(/backup copy to vault/i));

    expect(
      screen.getByRole("heading", { name: /primary repository/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /secondary vault\/cloud repository/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows the SOBR Design Block when SOBR Builder is selected (the default)", () => {
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(
      screen.getByRole("heading", {
        name: /scale-out backup repository \(sobr\) design/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows the target immutability field for a turnkey Vault choice and hides it for SOBR", async () => {
    const user = userEvent.setup();
    render(<Harness initial={DEFAULT_REPOSITORY_CONFIG_VALUES} />);

    expect(
      screen.queryByLabelText(/target repository immutability period/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Vault Azure" }));

    expect(
      screen.getByLabelText(/target repository immutability period/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "SOBR Builder" }));

    expect(
      screen.queryByLabelText(/target repository immutability period/i),
    ).not.toBeInTheDocument();
  });

  it("shows an inline error on the target immutability field", () => {
    render(
      <Harness
        initial={{
          ...DEFAULT_REPOSITORY_CONFIG_VALUES,
          targetRepository: "vault-azure",
          targetRepositoryImmutableDays: "0",
        }}
      />,
    );

    expect(
      screen.getByLabelText(/target repository immutability period/i),
    ).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Must be 1 or greater")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/simple-mode/backup-repository-card.test.tsx`
Expected: FAIL — `Cannot find module './backup-repository-card'`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useId, type ReactNode } from "react";
import { Cloud, Network } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { validateRepositoryConfig } from "@/lib/simple-mode/validate-repository-config";
import { RepoTypePicker } from "./repo-type-picker";
import { RetentionOverrideBlock } from "./retention-override-block";
import { SobrBuilder } from "./sobr-builder";
import {
  PRIMARY_REPO_TYPES,
  repoTypeRequiresImmutability,
  type RepositoryConfigValues,
  type TargetRepository,
  type WorkloadDataValues,
} from "@/types/simple-mode";

interface BackupRepositoryCardProps {
  value: RepositoryConfigValues;
  workloadData: WorkloadDataValues;
  onChange: (value: RepositoryConfigValues) => void;
}

interface TargetRepositoryCardProps {
  label: string;
  icon: ReactNode;
  selected: boolean;
  onSelect: () => void;
}

function TargetRepositoryCard({
  label,
  icon,
  selected,
  onSelect,
}: TargetRepositoryCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors",
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-input bg-background hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export function BackupRepositoryCard({
  value,
  workloadData,
  onChange,
}: BackupRepositoryCardProps) {
  const errors = validateRepositoryConfig(value);
  const backupPathGroupId = useId();
  const targetRepoGroupId = useId();
  const primaryImmutableId = useId();
  const targetImmutableId = useId();

  function setTargetRepository(targetRepository: TargetRepository) {
    onChange({ ...value, targetRepository });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Network aria-hidden="true" className="text-primary size-5" />
          Vault Configuration
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label id={backupPathGroupId}>Backup Path</Label>
          <RadioGroup
            aria-labelledby={backupPathGroupId}
            value={value.backupPath}
            onValueChange={(backupPath) =>
              onChange({
                ...value,
                backupPath: backupPath as RepositoryConfigValues["backupPath"],
              })
            }
          >
            <label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="direct" />
              Direct to Vault
            </label>
            <label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="copy" />
              Backup Copy to Vault
            </label>
          </RadioGroup>
        </div>

        {value.backupPath === "copy" ? (
          <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Primary Repository</h3>
            <RepoTypePicker
              value={value.primary.repoType}
              allowedTypes={PRIMARY_REPO_TYPES}
              onChange={(repoType) =>
                onChange({ ...value, primary: { ...value.primary, repoType } })
              }
            />
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
              checkboxLabel="Customize retention"
              value={value.primary.retention}
              workloadData={workloadData}
              errors={errors.primary?.retention}
              onChange={(retention) =>
                onChange({
                  ...value,
                  primary: { ...value.primary, retention },
                })
              }
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <Label id={targetRepoGroupId}>Select Target Repository</Label>
          <div
            role="group"
            aria-labelledby={targetRepoGroupId}
            className="grid grid-cols-3 gap-3"
          >
            <TargetRepositoryCard
              label="Vault Azure"
              icon={<Cloud aria-hidden="true" className="size-6" />}
              selected={value.targetRepository === "vault-azure"}
              onSelect={() => setTargetRepository("vault-azure")}
            />
            <TargetRepositoryCard
              label="Vault AWS"
              icon={<Cloud aria-hidden="true" className="size-6" />}
              selected={value.targetRepository === "vault-aws"}
              onSelect={() => setTargetRepository("vault-aws")}
            />
            <TargetRepositoryCard
              label="SOBR Builder"
              icon={<Network aria-hidden="true" className="size-6" />}
              selected={value.targetRepository === "sobr"}
              onSelect={() => setTargetRepository("sobr")}
            />
          </div>
        </div>

        {value.targetRepository !== "sobr" ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={targetImmutableId}>Immutable for (Days)</Label>
            <Input
              id={targetImmutableId}
              aria-label="Target repository immutability period (days)"
              value={value.targetRepositoryImmutableDays}
              inputMode="numeric"
              onChange={(e) =>
                onChange({
                  ...value,
                  targetRepositoryImmutableDays: e.target.value,
                })
              }
              aria-invalid={
                errors.targetRepositoryImmutableDays ? true : undefined
              }
            />
            {errors.targetRepositoryImmutableDays ? (
              <p className="text-destructive text-xs">
                {errors.targetRepositoryImmutableDays}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="border-border rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold">
              Scale-Out Backup Repository (SOBR) Design
            </h3>
            <SobrBuilder
              value={value.sobr}
              errors={errors.sobr}
              onChange={(sobr) => onChange({ ...value, sobr })}
            />
          </div>
        )}

        {value.backupPath === "copy" ? (
          <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">
              Secondary Vault/Cloud Repository
            </h3>
            <RetentionOverrideBlock
              context="Secondary"
              checkboxLabel="Customize copy retention"
              value={value.secondaryRetention}
              workloadData={workloadData}
              errors={errors.secondaryRetention}
              onChange={(secondaryRetention) =>
                onChange({ ...value, secondaryRetention })
              }
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

The visible `CardTitle` text is "Vault Configuration" — matching `screen.png`'s literal heading — even though this file and the design spec both refer to the concept as "Backup Repository Configuration."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/simple-mode/backup-repository-card.test.tsx`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/backup-repository-card.tsx src/components/simple-mode/backup-repository-card.test.tsx
git commit -m "feat: add BackupRepositoryCard orchestrating Vault Configuration"
```

---

### Task 8: Wire `BackupRepositoryCard` into `SimpleModePage`

**Files:**

- Modify: `src/components/simple-mode/simple-mode-page.tsx`
- Modify: `src/components/simple-mode/simple-mode-page.test.tsx`

- [ ] **Step 1: Update the failing test**

Replace the full contents of `src/components/simple-mode/simple-mode-page.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SimpleModePage } from "./simple-mode-page";

describe("SimpleModePage", () => {
  it("renders the Workload Data card, the Vault Configuration card, and a reserved sidebar region", () => {
    render(<SimpleModePage />);

    expect(screen.getByText("Workload Data")).toBeInTheDocument();
    expect(screen.getByText("Vault Configuration")).toBeInTheDocument();
    expect(
      screen.getByTestId("simple-mode-sidebar-placeholder"),
    ).toBeInTheDocument();
  });

  it("threads live workloadData from WorkloadDataCard into BackupRepositoryCard's retention inheritance", async () => {
    const user = userEvent.setup();
    render(<SimpleModePage />);

    await user.click(screen.getByLabelText(/backup copy to vault/i));

    // Both Primary and Secondary default to mirroring Workload Data.
    expect(
      screen.getAllByText(/retaining 30 dailies \+ 4w \/ 12m \/ 3y/i),
    ).toHaveLength(2);

    const retentionInput = screen.getByLabelText(
      /short-term retention \(days\)/i,
    );
    await user.clear(retentionInput);
    await user.type(retentionInput, "45");

    // Editing Workload Data must flow through the real `workloadData` prop
    // (not a stale default) into both inherited-retention summaries at once.
    expect(
      screen.getAllByText(/retaining 45 dailies \+ 4w \/ 12m \/ 3y/i),
    ).toHaveLength(2);
  });
});
```

No stateful harness needed here (ADR-0005) — `SimpleModePage` itself already owns `workloadData` via real `useState`, so `user.type()` drives genuine re-renders, not a bare mock.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/simple-mode/simple-mode-page.test.tsx`
Expected: FAIL — "Vault Configuration" is not yet rendered.

- [ ] **Step 3: Update the implementation**

Replace the full contents of `src/components/simple-mode/simple-mode-page.tsx`:

```tsx
import { useState } from "react";
import { WorkloadDataCard } from "./workload-data-card";
import { BackupRepositoryCard } from "./backup-repository-card";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";

export function SimpleModePage() {
  const [workloadData, setWorkloadData] = useState<WorkloadDataValues>(
    DEFAULT_WORKLOAD_DATA_VALUES,
  );
  const [repositoryConfig, setRepositoryConfig] =
    useState<RepositoryConfigValues>(DEFAULT_REPOSITORY_CONFIG_VALUES);

  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 p-6 lg:grid-cols-12">
      <div className="flex flex-col gap-6 lg:col-span-8">
        <WorkloadDataCard value={workloadData} onChange={setWorkloadData} />
        <BackupRepositoryCard
          value={repositoryConfig}
          workloadData={workloadData}
          onChange={setRepositoryConfig}
        />
      </div>
      <div className="lg:col-span-4">
        <div
          data-testid="simple-mode-sidebar-placeholder"
          className="border-border h-full min-h-40 rounded-lg border border-dashed"
        />
      </div>
    </div>
  );
}
```

`BackupRepositoryCard` reads `workloadData` (owned by this page, already fed to `WorkloadDataCard`) so its retention-inheritance display always reflects the live Workload Data values, not a stale copy.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/simple-mode/simple-mode-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/simple-mode-page.tsx src/components/simple-mode/simple-mode-page.test.tsx
git commit -m "feat: wire BackupRepositoryCard into SimpleModePage"
```

---

### Task 9: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test:run`
Expected: all tests pass, including every file touched in Tasks 1–8 and the pre-existing `App.test.tsx`/`workload-data-card.test.tsx`/`use-theme.test.ts` suites (unaffected by this work).

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit code 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Visual check against the approved mockup and design spec**

Run: `npm run dev`, open the printed local URL, and confirm:

- "Vault Configuration" renders directly beneath "Workload Data" in the left column.
- Default state matches `screen.png`: Direct to Vault selected, SOBR Builder selected, Performance Tier = ReFS/XFS (no immutability field), Capacity Tier enabled with S3 Compatible and "Move backups older than: 14 days", Archive Tier collapsed to its dashed empty state.
- Clicking "Backup Copy to Vault" stacks a "Primary Repository" track above the existing target-selection UI, and a "Secondary Vault/Cloud Repository" block appears beneath it.
- In the Primary track, switching the repo-type picker to "Vault Azure" reveals an "Immutable for (Days)" field; switching to "ReFS/XFS" hides it again.
- Clicking "Vault Azure" or "Vault AWS" as the top-level target hides the SOBR Design Block and reveals a single "Immutable for (Days)" field; clicking "SOBR Builder" reverses this.
- Within the SOBR Design Block, Performance Tier's picker shows Vault / On-Prem / Cloud Object Storage category buttons; Capacity Tier's picker shows only Vault / Cloud Object Storage.
- Unchecking "Enable Capacity Tier" — i.e. the Capacity Tier checkbox — hides its fields; clicking "+ Add Archive Tier" while Capacity Tier is unchecked still works and reveals Archive Tier's fields, including "Standalone full backups (no shared blocks)".
- The three tier rows render with distinguishable green (Performance) / blue (Capacity) / gray (Archive) left-border accents.
- Checking "Customize retention" under Primary (in Copy mode) reveals a 4-box grid pre-filled with Workload Data's current values (30 / 4 / 12 / 3 by default); unchecking it collapses back to the "currently mirroring Workload Data" summary line.
- Typing `0` into any immutability or move-days field shows a red border and an inline error message.
- Toggle the theme (light/dark/system) via the header and confirm the card, tier accents, and inputs all remain legible and correctly styled in both themes.
- Resize the browser below ~1024px and confirm the page still stacks into a single column.

No commit for this task — it's a verification gate. If any check fails, fix the underlying issue in the relevant earlier task's files and re-run the full suite before moving on (e.g. to a PR).
