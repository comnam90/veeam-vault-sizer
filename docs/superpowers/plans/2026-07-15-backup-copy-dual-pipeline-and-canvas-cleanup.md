# Backup Copy Dual-Pipeline Sizing + Canvas Tier Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock Backup Copy sizing (ADR-0007) with a BFF fan-out that sizes a Primary and a Secondary pipeline independently and renders them in a split canvas, and stop rendering `0.0 TB` storage tiers.

**Architecture:** One browser request hits the edge function `functions/api/vault-sizer.ts`, which branches on `backupPath`. Direct mode makes one upstream call and returns `{ mode: "direct", data }`; Copy mode builds two `VmAgentInputs`, calls upstream twice under a strict `Promise.all`, and returns `{ mode: "copy", primary, secondary }` (fail-whole). The React client stays thin (one `fetch`); `ProjectedSizingCard` renders a flat layout for direct and a stacked master-header-plus-two-sites layout for copy. A shared `storage-tiers` helper owns tier filtering (`> 0`) and summation.

**Tech Stack:** Vite + React + TypeScript, Tailwind v4, Vitest, Cloudflare Pages Functions (edge). Upstream sizing API: `https://calculator.veeam.com/vse/api/VmAgent`.

**Spec:** `docs/superpowers/specs/2026-07-15-backup-copy-dual-pipeline-and-canvas-cleanup-design.md` (decisions D1–D10).

**Branch:** Work continues on `frontend-integration-sizing-canvas` (already a feature branch — no new branch needed).

---

## File Structure

| File                                                   | Responsibility                                          | Change                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/simple-mode/build-vm-agent-request.ts`        | Map form state → `VmAgentInputs`                        | Decompose into base/standalone/SOBR helpers; add `buildCopyVmAgentRequests` |
| `src/lib/simple-mode/storage-tiers.ts`                 | Pure tier-row + total math (single source)              | **New**                                                                     |
| `src/components/simple-mode/storage-breakdown.tsx`     | Render one site's tier bars                             | Consume `storage-tiers`; `> 0` filter                                       |
| `src/types/simple-mode.ts`                             | Shared types                                            | `SizerBffResponse` → discriminated union; add `SizerResult`                 |
| `functions/api/vault-sizer.ts`                         | BFF gateway                                             | Tag direct response; add copy fan-out                                       |
| `src/lib/api/vault-sizer-client.ts`                    | Browser → BFF call                                      | Return `SizerResult`                                                        |
| `src/hooks/use-calculated-sizing.ts`                   | Debounced sizing state                                  | `data` state → `SizerResult \| null`                                        |
| `src/components/simple-mode/site-sizing-section.tsx`   | One site's full section (storage + compute + bandwidth) | **New**                                                                     |
| `src/components/simple-mode/projected-sizing-card.tsx` | Right-hand canvas wrapper                               | Branch flat (direct) vs split (copy)                                        |

**Commands:** single file → `npx vitest run <path>`; full suite → `npm run test:run`; typecheck+build → `npm run build`; lint → `npm run lint`.

**Every commit ends with the trailer** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Commit subjects follow conventional-commit format (`feat:`/`refactor:`/`test:`) and body lines stay ≤100 chars (a commit-msg hook enforces this).

---

## Task 1: Decompose the request builder and add the Copy builder

**Files:**

- Modify: `src/lib/simple-mode/build-vm-agent-request.ts` (full rewrite below)
- Test: `src/lib/simple-mode/build-vm-agent-request.test.ts` (append new tests)

Direct-mode output must stay byte-identical (existing tests are the regression guard). The new `buildCopyVmAgentRequests` sizes the Primary as a standalone repo of any type and the Secondary via the same target/SOBR dispatch as direct, each with its own resolved retention (D1). `buildVmAgentRequest` keeps throwing for copy — it is the direct-only entry point; the worker uses `buildCopyVmAgentRequests` for copy.

- [ ] **Step 1: Write failing tests for `buildCopyVmAgentRequests`**

Append inside the existing `describe("buildVmAgentRequest", ...)` block's closing — i.e. add a new sibling `describe` at the end of `src/lib/simple-mode/build-vm-agent-request.test.ts` (after the final `});` on line 282), and add `buildCopyVmAgentRequests` to the import on line 2:

```ts
import {
  buildCopyVmAgentRequests,
  buildVmAgentRequest,
} from "./build-vm-agent-request";
```

```ts
describe("buildCopyVmAgentRequests", () => {
  const copyBase: RepositoryConfigValues = {
    ...DEFAULT_REPOSITORY_CONFIG_VALUES,
    backupPath: "copy",
  };

  it("sizes a block/file Primary (Hardened Repository) as non-object storage with Fast Clone", () => {
    const { primary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      copyBase,
    );

    expect(primary.objectStorage).toBe(false);
    expect(primary.storageType).toBe(null);
    expect(primary.immutablePerf).toBe(true); // Hardened Repository requires immutability
    expect(primary.immutablePerfDays).toBe(30); // DEFAULT primary.immutableDays
    expect(primary.blockCloning).toBe(true); // XFS-backed
    expect(primary.blockGenerationDays).toBe(0); // no object batching window
    expect(primary.days).toBe(30); // DEFAULT shortTermRetentionDays
  });

  it("sizes a Vault Primary as immutable object storage with a block-generation window", () => {
    const values: RepositoryConfigValues = {
      ...copyBase,
      primary: {
        ...copyBase.primary,
        repoType: "vault-azure",
        immutableDays: "40",
      },
    };

    const { primary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      values,
    );

    expect(primary.objectStorage).toBe(true);
    expect(primary.storageType).toBe("object");
    expect(primary.immutablePerf).toBe(true);
    expect(primary.immutablePerfDays).toBe(40);
    expect(primary.blockGenerationDays).toBe(10); // vault-azure
    expect(primary.blockCloning).toBe(false);
  });

  it("sizes the Secondary Vault target as immutable object storage, like the direct path", () => {
    const { secondary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      copyBase,
    );

    // DEFAULT targetRepository is vault-azure, targetRepositoryImmutableDays "30".
    expect(secondary.objectStorage).toBe(true);
    expect(secondary.immutablePerf).toBe(true);
    expect(secondary.immutablePerfDays).toBe(30);
    expect(secondary.blockGenerationDays).toBe(10);
  });

  it("sizes a Secondary SOBR via the same dispatch as the direct SOBR path", () => {
    const values: RepositoryConfigValues = {
      ...copyBase,
      targetRepository: "sobr",
    };

    const { secondary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      values,
    );

    // DEFAULT sobr.performanceType is vault-azure (immutable object), Capacity off.
    expect(secondary.objectStorage).toBe(true);
    expect(secondary.immutablePerf).toBe(true);
    expect(secondary.blockGenerationDays).toBe(10);
    expect(secondary.archiveTierEnabled).toBe(false);
  });

  it("resolves each side's retention independently from its own override", () => {
    const values: RepositoryConfigValues = {
      ...copyBase,
      primary: {
        ...copyBase.primary,
        retention: {
          customizeRetention: true,
          retentionDays: "45",
          gfsWeekly: "0",
          gfsMonthly: "0",
          gfsYearly: "0",
        },
      },
      secondaryRetention: {
        customizeRetention: true,
        retentionDays: "60",
        gfsWeekly: "0",
        gfsMonthly: "0",
        gfsYearly: "0",
      },
    };

    const { primary, secondary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      values,
    );

    expect(primary.days).toBe(45);
    expect(secondary.days).toBe(60);
  });

  it("caps each side's GFS to the Forecast Horizon independently", () => {
    const workload: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      gfsYearly: "5",
      projectLengthYears: "1",
      capGfsToForecastHorizon: true,
    };

    const { primary, secondary } = buildCopyVmAgentRequests(workload, copyBase);

    // Both sides default to workloadData GFS; 5 yearly points capped to 1yr horizon.
    expect(primary.yearlies).toBe(1);
    expect(secondary.yearlies).toBe(1);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/lib/simple-mode/build-vm-agent-request.test.ts`
Expected: FAIL — `buildCopyVmAgentRequests` is not exported / not a function.

- [ ] **Step 3: Rewrite `build-vm-agent-request.ts` with the decomposition**

Replace the entire contents of `src/lib/simple-mode/build-vm-agent-request.ts` with:

```ts
import {
  BLOCK_GENERATION_DAYS,
  REPO_TYPE_CATEGORY,
  repoTypeRequiresImmutability,
  repoTypeSupportsBlockCloning,
  type RepositoryConfigValues,
  type RepoType,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { VmAgentInputs } from "@/types/vault-sizer-api";
import { BACKUP_WINDOW_HOURS } from "./backup-windows";
import { capGfsToForecastHorizon } from "./cap-gfs-to-forecast-horizon";
import {
  resolveEffectiveRetention,
  type EffectiveRetention,
} from "./vault-retention";

// Workload-level fields come from workloadData (shared across both pipelines);
// retention days + GFS come from the per-pipeline EffectiveRetention. GFS is
// capped to the Forecast Horizon here, gated by the workload-level toggle.
function buildBaseInputs(
  workloadData: WorkloadDataValues,
  retention: EffectiveRetention,
): VmAgentInputs {
  const rawGfs = {
    weeklies: retention.gfsWeekly,
    monthlies: retention.gfsMonthly,
    yearlies: retention.gfsYearly,
  };
  const gfs = workloadData.capGfsToForecastHorizon
    ? capGfsToForecastHorizon(rawGfs, Number(workloadData.projectLengthYears))
    : rawGfs;

  return {
    productVersion: 0,
    calculatorMode: 0,
    hyperVisor: 0,
    backupType: 0,
    copiesEnabled: false,

    sourceTB: Number(workloadData.sourceSizeTB),
    changeRate: Number(workloadData.dailyChangeRatePercent),
    reduction: Number(workloadData.dataReductionPercent),
    growthRatePercent: Number(workloadData.yearlyGrowthPercent),
    growthFactor: Number(workloadData.yearlyGrowthPercent),
    growthRateScopeYears: Number(workloadData.projectLengthYears),
    projectLength: Number(workloadData.projectLengthYears),
    days: retention.retentionDays,
    weeklies: gfs.weeklies,
    monthlies: gfs.monthlies,
    yearlies: gfs.yearlies,

    largeBlock: false,
    backupWindowHours: BACKUP_WINDOW_HOURS,
    showPoints: true,

    moveCapacityTierEnabled: false,
    copyCapacityTierEnabled: false,
    capacityTierDays: 0,
    immutableCap: false,
    immutableCapDays: 0,

    archiveTierEnabled: false,
    archiveTierDays: 0,
    archiveTierStandalone: false,

    blockGenerationDays: 0,
  };
}

// One standalone repository of any RepoType — the direct Vault target and the
// Copy-mode Primary both use this. Block/file types are non-object with Fast
// Clone; vault/object types are immutable object storage with a block-generation
// window.
function buildStandaloneRepoInputs(
  base: VmAgentInputs,
  repoType: RepoType,
  immutableDays: string,
): VmAgentInputs {
  const isObjectStorage = REPO_TYPE_CATEGORY[repoType] !== "block-file";
  const immutable = repoTypeRequiresImmutability(repoType);

  return {
    ...base,
    objectStorage: isObjectStorage,
    storageType: isObjectStorage ? "object" : null,
    immutablePerf: immutable,
    immutablePerfDays: immutable ? Number(immutableDays) : 0,
    blockCloning: repoTypeSupportsBlockCloning(repoType),
    blockGenerationDays: immutable ? (BLOCK_GENERATION_DAYS[repoType] ?? 0) : 0,
  };
}

// A full SOBR: Performance Tier type logic, plus optional Capacity and Archive
// tiers. Capacity Tier's type wins Block Generation over Performance Tier's.
function buildSobrInputs(
  base: VmAgentInputs,
  sobr: RepositoryConfigValues["sobr"],
): VmAgentInputs {
  const { capacityTier, archiveTier } = sobr;
  const performanceIsObjectStorage =
    REPO_TYPE_CATEGORY[sobr.performanceType] !== "block-file";
  const performanceImmutable = repoTypeRequiresImmutability(
    sobr.performanceType,
  );

  const result: VmAgentInputs = {
    ...base,
    objectStorage: performanceIsObjectStorage,
    storageType: performanceIsObjectStorage ? "object" : null,
    immutablePerf: performanceImmutable,
    immutablePerfDays: performanceImmutable
      ? Number(sobr.performanceImmutableDays)
      : 0,
    blockCloning: repoTypeSupportsBlockCloning(sobr.performanceType),
  };

  if (capacityTier.enabled) {
    result.copyCapacityTierEnabled = capacityTier.copyPolicy;
    result.moveCapacityTierEnabled = capacityTier.movePolicy;
    result.capacityTierDays = Number(capacityTier.moveDays);
    result.immutableCap = true;
    result.immutableCapDays = Number(capacityTier.immutableDays);
  }

  if (archiveTier.enabled) {
    result.archiveTierEnabled = true;
    result.archiveTierDays = Number(archiveTier.moveDays);
    result.archiveTierStandalone = archiveTier.standaloneFullBackups;
  }

  if (capacityTier.enabled) {
    result.blockGenerationDays = BLOCK_GENERATION_DAYS[capacityTier.type] ?? 0;
  } else if (performanceImmutable) {
    result.blockGenerationDays =
      BLOCK_GENERATION_DAYS[sobr.performanceType] ?? 0;
  }

  return result;
}

// Direct mode only. Backup Copy needs two requests — use
// buildCopyVmAgentRequests (ADR-0007).
export function buildVmAgentRequest(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): VmAgentInputs {
  if (repositoryConfig.backupPath === "copy") {
    throw new Error(
      "buildVmAgentRequest handles Direct mode only; Backup Copy needs two " +
        "requests via buildCopyVmAgentRequests (ADR-0007).",
    );
  }

  const base = buildBaseInputs(
    workloadData,
    resolveEffectiveRetention(workloadData),
  );

  if (repositoryConfig.targetRepository !== "sobr") {
    return buildStandaloneRepoInputs(
      base,
      repositoryConfig.targetRepository,
      repositoryConfig.targetRepositoryImmutableDays,
    );
  }

  return buildSobrInputs(base, repositoryConfig.sobr);
}

// Backup Copy mode: two independent VmAgentInputs (ADR-0007). Primary is a
// standalone repo of any type with its own retention; Secondary uses the same
// target/SOBR dispatch as direct, with its own retention.
export function buildCopyVmAgentRequests(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): { primary: VmAgentInputs; secondary: VmAgentInputs } {
  const primaryConfig = repositoryConfig.primary;
  const primaryBase = buildBaseInputs(
    workloadData,
    resolveEffectiveRetention(workloadData, primaryConfig.retention),
  );
  const primary = buildStandaloneRepoInputs(
    primaryBase,
    primaryConfig.repoType,
    primaryConfig.immutableDays,
  );

  const secondaryBase = buildBaseInputs(
    workloadData,
    resolveEffectiveRetention(
      workloadData,
      repositoryConfig.secondaryRetention,
    ),
  );
  const secondary =
    repositoryConfig.targetRepository !== "sobr"
      ? buildStandaloneRepoInputs(
          secondaryBase,
          repositoryConfig.targetRepository,
          repositoryConfig.targetRepositoryImmutableDays,
        )
      : buildSobrInputs(secondaryBase, repositoryConfig.sobr);

  return { primary, secondary };
}
```

- [ ] **Step 4: Run the full builder test file to verify all pass**

Run: `npx vitest run src/lib/simple-mode/build-vm-agent-request.test.ts`
Expected: PASS — the existing direct-mode tests (regression guard for byte-identical output) and the new `buildCopyVmAgentRequests` tests all pass. The existing `throws for Backup Copy, naming ADR-0007` test still passes (the new message still contains "ADR-0007").

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/build-vm-agent-request.ts src/lib/simple-mode/build-vm-agent-request.test.ts
git commit -m "refactor: decompose request builder and add buildCopyVmAgentRequests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Shared tier-summation helper

**Files:**

- Create: `src/lib/simple-mode/storage-tiers.ts`
- Test: `src/lib/simple-mode/storage-tiers.test.ts`

Extract the tier-row and summation math (currently inline in `StorageBreakdown`) into pure functions so the per-site total and the copy master-header total use one definition. The filter becomes `> 0` (D9) — the real upstream returns unconfigured tiers at `0 GB`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/simple-mode/storage-tiers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/simple-mode/storage-tiers.test.ts`
Expected: FAIL — cannot resolve `./storage-tiers`.

- [ ] **Step 3: Create `src/lib/simple-mode/storage-tiers.ts`**

```ts
import type { CVmAgentReturnObject, Volume } from "@/types/vault-sizer-api";

export interface TierStorageRow {
  key: "performance" | "capacity" | "archive";
  label: string;
  diskGB: number;
  colorClassName: string;
}

// diskPurpose codes: 2 = RepoLocal, 3 = RepoObject (both Performance Tier);
// 13 = Capacity Tier; 4 = Archive Tier. See vault-sizer-api.ts.
const TIERS = [
  {
    key: "performance",
    label: "Performance",
    diskPurposes: [2, 3],
    colorClassName: "bg-tier-performance",
  },
  {
    key: "capacity",
    label: "Capacity",
    diskPurposes: [13],
    colorClassName: "bg-tier-capacity",
  },
  {
    key: "archive",
    label: "Archive",
    diskPurposes: [4],
    colorClassName: "bg-tier-archive",
  },
] as const;

function findTierDiskGB(
  volumes: Volume[],
  diskPurposes: readonly number[],
): number {
  return (
    volumes.find((volume) => diskPurposes.includes(volume.diskPurpose))
      ?.diskGB ?? 0
  );
}

export function getTierStorageRows(
  data: CVmAgentReturnObject | null,
): TierStorageRow[] {
  const volumes = data?.repoCompute?.compute?.volumes ?? [];
  return TIERS.map((tier) => ({
    key: tier.key,
    label: tier.label,
    colorClassName: tier.colorClassName,
    diskGB: findTierDiskGB(volumes, tier.diskPurposes),
  })).filter((tier) => tier.diskGB > 0);
}

export function getTotalStorageGB(data: CVmAgentReturnObject | null): number {
  return getTierStorageRows(data).reduce((sum, tier) => sum + tier.diskGB, 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/simple-mode/storage-tiers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/storage-tiers.ts src/lib/simple-mode/storage-tiers.test.ts
git commit -m "feat: add storage-tiers helper with > 0 tier filter and summation" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `StorageBreakdown` consumes the helper and hides zero tiers

**Files:**

- Modify: `src/components/simple-mode/storage-breakdown.tsx` (full rewrite below)
- Test: `src/components/simple-mode/storage-breakdown.test.tsx` (append one test)

- [ ] **Step 1: Write the failing test**

Append this `it` block inside the existing `describe("StorageBreakdown", ...)` in `src/components/simple-mode/storage-breakdown.test.tsx` (before its closing `});` on line 100):

```ts
  it("hides tiers whose volume is present but zero, keeping only non-zero tiers", () => {
    const data = makeData([
      { diskGB: 2048, diskPurpose: 3 },
      { diskGB: 0, diskPurpose: 13 },
      { diskGB: 0, diskPurpose: 4 },
    ]);
    render(<StorageBreakdown data={data} />);

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
    // Grand total equals just the Performance tier (2.0 TB), both read the same.
    expect(screen.getAllByText("2.0 TB")).toHaveLength(2);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/simple-mode/storage-breakdown.test.tsx`
Expected: FAIL — the current `!== undefined` filter keeps the two `0 GB` tiers, so "Capacity"/"Archive" are found and the assertions fail.

- [ ] **Step 3: Rewrite `storage-breakdown.tsx` to use the helper**

Replace the entire contents of `src/components/simple-mode/storage-breakdown.tsx` with:

```tsx
import { Progress } from "@/components/ui/progress";
import {
  getTierStorageRows,
  getTotalStorageGB,
} from "@/lib/simple-mode/storage-tiers";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

interface StorageBreakdownProps {
  data: CVmAgentReturnObject | null;
}

export function StorageBreakdown({ data }: StorageBreakdownProps) {
  const tierRows = getTierStorageRows(data);
  const totalTB = getTotalStorageGB(data) / 1024;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Total Required Storage
        </p>
        <p className="font-mono text-3xl font-semibold">
          {data === null ? "—" : `${totalTB.toFixed(1)} TB`}
        </p>
      </div>
      {data !== null && tierRows.length > 0 ? (
        <div className="flex flex-col gap-3">
          {tierRows.map((tier) => {
            const tierTB = tier.diskGB / 1024;
            const percent = totalTB > 0 ? (tierTB / totalTB) * 100 : 0;
            return (
              <div key={tier.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{tier.label}</span>
                  <span className="font-mono">{tierTB.toFixed(1)} TB</span>
                </div>
                <Progress
                  value={percent}
                  indicatorClassName={tier.colorClassName}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run the full test file to verify all pass**

Run: `npx vitest run src/components/simple-mode/storage-breakdown.test.tsx`
Expected: PASS — existing tests (unchanged rendering) plus the new zero-tier test.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/storage-breakdown.tsx src/components/simple-mode/storage-breakdown.test.tsx
git commit -m "refactor: StorageBreakdown consumes storage-tiers, hides zero tiers" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migrate the response contract to a discriminated union (direct mode)

**Files:**

- Modify: `src/types/simple-mode.ts` (types)
- Modify: `functions/api/vault-sizer.ts` (tag direct response)
- Modify: `src/lib/api/vault-sizer-client.ts` (full rewrite below)
- Modify: `src/hooks/use-calculated-sizing.ts` (state type)
- Modify: `src/components/simple-mode/projected-sizing-card.tsx` (unwrap direct)
- Tests: `functions/api/vault-sizer.test.ts`, `src/lib/api/vault-sizer-client.test.ts`, `src/hooks/use-calculated-sizing.test.ts`, `src/components/simple-mode/projected-sizing-card.test.tsx`

`SizerBffResponse` is imported by both the worker and the client, so changing it cascades through client → hook → card. They all migrate here. Copy mode still returns 400 (the worker still calls `buildVmAgentRequest`, which throws for copy) — the copy fan-out arrives in Task 5. This task is done when `npm run build` typechecks and every test passes.

- [ ] **Step 1: Update the response types**

In `src/types/simple-mode.ts`, replace the existing `SizerBffResponse` type (lines 294–296) with:

```ts
export type SizerBffResponse =
  | { success: true; mode: "direct"; data: CVmAgentReturnObject }
  | {
      success: true;
      mode: "copy";
      primary: CVmAgentReturnObject;
      secondary: CVmAgentReturnObject;
    }
  | { success: false; error: string };

export type SizerResult =
  | { mode: "direct"; data: CVmAgentReturnObject }
  | {
      mode: "copy";
      primary: CVmAgentReturnObject;
      secondary: CVmAgentReturnObject;
    };
```

- [ ] **Step 2: Tag the worker's direct response**

In `functions/api/vault-sizer.ts`, change the success return (line 78) from:

```ts
return jsonResponse({ success: true, data }, 200);
```

to:

```ts
return jsonResponse({ success: true, mode: "direct", data }, 200);
```

- [ ] **Step 3: Rewrite the client to return `SizerResult`**

Replace the entire contents of `src/lib/api/vault-sizer-client.ts` with:

```ts
import type {
  RepositoryConfigValues,
  SizerBffResponse,
  SizerResult,
  WorkloadDataValues,
} from "@/types/simple-mode";

const API_URL = "/api/vault-sizer";

export async function callVaultSizerApi(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
  signal?: AbortSignal,
): Promise<SizerResult> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workloadData, repositoryConfig }),
    signal,
  });

  const body: SizerBffResponse = await response.json();

  if (!body.success) {
    throw new Error(body.error);
  }

  if (body.mode === "direct") {
    return { mode: "direct", data: body.data };
  }

  return { mode: "copy", primary: body.primary, secondary: body.secondary };
}
```

- [ ] **Step 4: Widen the hook's `data` state type**

In `src/hooks/use-calculated-sizing.ts`:

Change the import block (lines 5–9) from:

```ts
import type {
  RepositoryConfigValues,
  WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";
```

to:

```ts
import type {
  RepositoryConfigValues,
  SizerResult,
  WorkloadDataValues,
} from "@/types/simple-mode";
```

Change the state interface (line 14) from:

```ts
data: CVmAgentReturnObject | null;
```

to:

```ts
data: SizerResult | null;
```

- [ ] **Step 5: Unwrap direct-mode data in the card**

In `src/components/simple-mode/projected-sizing-card.tsx`, after the `initialFullRestore` declaration (line 32), add:

```ts
const directData = data?.mode === "direct" ? data.data : null;
```

Then update the three usages:

- `<StorageBreakdown data={data} />` → `<StorageBreakdown data={directData} />`
- `<InfrastructureTelemetry compute={data?.proxyCompute?.compute} />` → `<InfrastructureTelemetry compute={directData?.proxyCompute?.compute} />`
- `nightlyIncremental={data?.proxyCompute?.compute?.networkThroughput}` → `nightlyIncremental={directData?.proxyCompute?.compute?.networkThroughput}`

- [ ] **Step 6: Update the four affected test files to the new shapes**

`functions/api/vault-sizer.test.ts` — the direct success assertion (lines 44–45):

```ts
expect(response.status).toBe(200);
expect(body).toEqual({
  success: true,
  mode: "direct",
  data: { totalStorageTB: 18.4 },
});
```

`src/lib/api/vault-sizer-client.test.ts` — two edits:

- Replace both occurrences of `{ success: true, data: mockData }` with `{ success: true, mode: "direct", data: mockData }` (lines 27, 69).
- Change the assertion on line 45 from `expect(result).toEqual(mockData);` to `expect(result).toEqual({ mode: "direct", data: mockData });`.

`src/hooks/use-calculated-sizing.test.ts` — apply these replacements across the file:

- Replace every `{ success: true, data: mockData }` with `{ success: true, mode: "direct", data: mockData }`.
- Replace `{ success: true, data: newerData }` with `{ success: true, mode: "direct", data: newerData }`.
- Replace `{ success: true, data: olderData }` with `{ success: true, mode: "direct", data: olderData }`.
- Replace every `.toEqual(mockData)` with `.toEqual({ mode: "direct", data: mockData })`.
- Replace every `.toEqual(newerData)` with `.toEqual({ mode: "direct", data: newerData })`.

`src/components/simple-mode/projected-sizing-card.test.tsx`:

- Replace every `{ success: true, data: mockData }` with `{ success: true, mode: "direct", data: mockData }`.

- [ ] **Step 7: Run the affected tests and the typecheck build**

Run: `npx vitest run functions/api/vault-sizer.test.ts src/lib/api/vault-sizer-client.test.ts src/hooks/use-calculated-sizing.test.ts src/components/simple-mode/projected-sizing-card.test.tsx`
Expected: PASS (copy still returns 400 via the retained throw; the existing "rejects Backup Copy" worker test still passes).

Run: `npm run build`
Expected: PASS — `tsc -b` typechecks the whole project with the new union (no dangling references to the old `{ success, data }` shape).

- [ ] **Step 8: Commit**

```bash
git add src/types/simple-mode.ts functions/api/vault-sizer.ts src/lib/api/vault-sizer-client.ts src/hooks/use-calculated-sizing.ts src/components/simple-mode/projected-sizing-card.tsx functions/api/vault-sizer.test.ts src/lib/api/vault-sizer-client.test.ts src/hooks/use-calculated-sizing.test.ts src/components/simple-mode/projected-sizing-card.test.tsx
git commit -m "refactor: migrate sizer response to a mode-tagged discriminated union" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Copy-mode fan-out in the edge worker

**Files:**

- Modify: `functions/api/vault-sizer.ts` (full rewrite below)
- Test: `functions/api/vault-sizer.test.ts` (replace the copy-reject test with fan-out tests)

The worker branches on `backupPath`: copy builds two inputs, calls upstream twice under a strict `Promise.all`, parses each body defensively, fails whole with a side-labeled error, and aggregates two `CVmAgentReturnObject`s (D3, D4).

- [ ] **Step 1: Replace the copy-reject test with copy fan-out tests**

In `functions/api/vault-sizer.test.ts`, delete the entire `it("rejects Backup Copy requests before calling upstream", ...)` test (lines 147–165) and add these tests in its place (still inside the `describe` block). Also add the `copyConfig` helper near the top of the file, after the `postRequest` function:

```ts
const copyConfig: RepositoryConfigValues = {
  ...DEFAULT_REPOSITORY_CONFIG_VALUES,
  backupPath: "copy",
};
```

```ts
it("fans a copy request out into two upstream calls and aggregates both", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, data: { totalStorageTB: 24 } }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, data: { totalStorageTB: 18.4 } }),
        { status: 200 },
      ),
    );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: copyConfig,
    }),
  );
  const body = await response.json();

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(response.status).toBe(200);
  expect(body).toEqual({
    success: true,
    mode: "copy",
    primary: { totalStorageTB: 24 },
    secondary: { totalStorageTB: 18.4 },
  });
});

it("fails whole with a Primary-labeled error when the Primary sizing fails", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, messages: ["primary boom"] }),
        { status: 400 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, data: { totalStorageTB: 18.4 } }),
        { status: 200 },
      ),
    );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: copyConfig,
    }),
  );
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.success).toBe(false);
  expect(body.error).toContain("Primary (on-premises) sizing failed");
  expect(body.error).toContain("primary boom");
});

it("fails whole with a Secondary-labeled error when the Secondary sizing fails", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, data: { totalStorageTB: 24 } }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, messages: ["secondary boom"] }),
        { status: 400 },
      ),
    );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: copyConfig,
    }),
  );
  const body = await response.json();

  expect(response.status).toBe(400);
  expect(body.error).toContain("Secondary (offsite Vault) sizing failed");
  expect(body.error).toContain("secondary boom");
});

it("uses the generic fallback message when a failed side returns a non-JSON body", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response("<html>gateway error</html>", { status: 502 }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, data: { totalStorageTB: 18.4 } }),
        { status: 200 },
      ),
    );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: copyConfig,
    }),
  );
  const body = await response.json();

  expect(response.status).toBe(502);
  expect(body.error).toContain("Primary (on-premises) sizing failed");
  expect(body.error).toContain("Calculation engine rejected the request");
});

it("returns 502 when a copy upstream call rejects (network failure)", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, data: { totalStorageTB: 24 } }),
        { status: 200 },
      ),
    )
    .mockRejectedValueOnce(new Error("network error"));

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: copyConfig,
    }),
  );
  const body = await response.json();

  expect(response.status).toBe(502);
  expect(body).toEqual({
    success: false,
    error: "Upstream sizing API unreachable",
  });
});
```

- [ ] **Step 2: Run the test file to verify the new copy tests fail**

Run: `npx vitest run functions/api/vault-sizer.test.ts`
Expected: FAIL — copy mode still returns 400 (the worker still calls `buildVmAgentRequest`, which throws for copy). The new copy tests fail on their status/body assertions.

- [ ] **Step 3: Rewrite the worker with the copy fan-out**

Replace the entire contents of `functions/api/vault-sizer.ts` with:

```ts
import {
  buildCopyVmAgentRequests,
  buildVmAgentRequest,
} from "../../src/lib/simple-mode/build-vm-agent-request";
import type {
  SizerBffRequest,
  SizerBffResponse,
} from "../../src/types/simple-mode";
import type {
  CVmAgentReturnObject,
  ReturnMessage,
  ValidationProblemDetails,
  VmAgentInputs,
} from "../../src/types/vault-sizer-api";

const VAULT_SIZER_API_URL = "https://calculator.veeam.com/vse/api/VmAgent";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: SizerBffResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function extractErrorMessage(body: unknown): string {
  const returnMessage = body as ReturnMessage | null;
  if (returnMessage?.messages && returnMessage.messages.length > 0) {
    return returnMessage.messages[0];
  }

  const validationProblem = body as ValidationProblemDetails | null;
  if (validationProblem?.errors) {
    return Object.values(validationProblem.errors).flat().join(", ");
  }

  return "Calculation engine rejected the request";
}

function upstreamFetch(inputs: VmAgentInputs): Promise<Response> {
  return fetch(VAULT_SIZER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });
}

// Never throws — a non-JSON error body still resolves so the caller surfaces a
// side-labeled message via extractErrorMessage's fallback, not a 502.
async function parseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context: {
  request: Request;
}): Promise<Response> {
  let bffRequest: SizerBffRequest;
  try {
    bffRequest = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  if (bffRequest.repositoryConfig.backupPath === "copy") {
    return handleCopy(bffRequest);
  }
  return handleDirect(bffRequest);
}

async function handleDirect(bffRequest: SizerBffRequest): Promise<Response> {
  let vmAgentInputs: VmAgentInputs;
  try {
    vmAgentInputs = buildVmAgentRequest(
      bffRequest.workloadData,
      bffRequest.repositoryConfig,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return jsonResponse({ success: false, error: message }, 400);
  }

  try {
    const upstream = await upstreamFetch(vmAgentInputs);
    const upstreamBody: unknown = await parseBody(upstream);

    if (upstream.ok) {
      const { data } = upstreamBody as { data: CVmAgentReturnObject };
      return jsonResponse({ success: true, mode: "direct", data }, 200);
    }

    return jsonResponse(
      { success: false, error: extractErrorMessage(upstreamBody) },
      upstream.status,
    );
  } catch {
    return jsonResponse(
      { success: false, error: "Upstream sizing API unreachable" },
      502,
    );
  }
}

async function handleCopy(bffRequest: SizerBffRequest): Promise<Response> {
  let inputs: { primary: VmAgentInputs; secondary: VmAgentInputs };
  try {
    inputs = buildCopyVmAgentRequests(
      bffRequest.workloadData,
      bffRequest.repositoryConfig,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return jsonResponse({ success: false, error: message }, 400);
  }

  try {
    const [primaryRes, secondaryRes] = await Promise.all([
      upstreamFetch(inputs.primary),
      upstreamFetch(inputs.secondary),
    ]);
    const [primaryBody, secondaryBody] = await Promise.all([
      parseBody(primaryRes),
      parseBody(secondaryRes),
    ]);

    if (!primaryRes.ok) {
      return jsonResponse(
        {
          success: false,
          error: `Primary (on-premises) sizing failed: ${extractErrorMessage(primaryBody)}`,
        },
        primaryRes.status,
      );
    }
    if (!secondaryRes.ok) {
      return jsonResponse(
        {
          success: false,
          error: `Secondary (offsite Vault) sizing failed: ${extractErrorMessage(secondaryBody)}`,
        },
        secondaryRes.status,
      );
    }

    return jsonResponse(
      {
        success: true,
        mode: "copy",
        primary: (primaryBody as { data: CVmAgentReturnObject }).data,
        secondary: (secondaryBody as { data: CVmAgentReturnObject }).data,
      },
      200,
    );
  } catch {
    return jsonResponse(
      { success: false, error: "Upstream sizing API unreachable" },
      502,
    );
  }
}
```

- [ ] **Step 4: Run the worker test file to verify all pass**

Run: `npx vitest run functions/api/vault-sizer.test.ts`
Expected: PASS — the direct-mode tests (unchanged) plus the five new copy tests.

- [ ] **Step 5: Commit**

```bash
git add functions/api/vault-sizer.ts functions/api/vault-sizer.test.ts
git commit -m "feat: fan Backup Copy requests out into two upstream sizing calls" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `SiteSizingSection` component

**Files:**

- Create: `src/components/simple-mode/site-sizing-section.tsx`
- Test: `src/components/simple-mode/site-sizing-section.test.tsx`

One site's full section: a header (title + repo-type badge), the storage breakdown, and the proxy compute + network tables — reusing the existing display components verbatim.

- [ ] **Step 1: Write the failing test**

Create `src/components/simple-mode/site-sizing-section.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SiteSizingSection } from "./site-sizing-section";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const siteData: CVmAgentReturnObject = {
  totalStorageTB: 0,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
  repoCompute: {
    compute: { cores: 4, ram: 16, volumes: [{ diskGB: 2048, diskPurpose: 3 }] },
  },
  proxyCompute: {
    compute: {
      cores: 8,
      ram: 32,
      networkThroughput: { inboundMBps: 100, outboundMBps: 50 },
    },
  },
};

describe("SiteSizingSection", () => {
  it("renders the title, badge, storage tier, proxy compute, and nightly bandwidth", () => {
    render(
      <SiteSizingSection
        title="Primary — On-Premises Landing Zone"
        badge="Hardened Repository"
        data={siteData}
        initialFullRestore={{ inboundMBps: 200, outboundMBps: 100 }}
      />,
    );

    expect(
      screen.getByText("Primary — On-Premises Landing Zone"),
    ).toBeInTheDocument();
    expect(screen.getByText("Hardened Repository")).toBeInTheDocument();
    expect(screen.getByText("Performance")).toBeInTheDocument();

    // Proxy compute reads proxyCompute (8 / 32 GB), not repoCompute (4 / 16).
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("32 GB")).toBeInTheDocument();

    // Nightly incremental row shows proxyCompute's outbound (50 MB/s × 8 = 400).
    const nightlyRow = screen
      .getByText("Nightly Incremental (8h)")
      .closest("tr");
    expect(nightlyRow).not.toBeNull();
    expect(within(nightlyRow!).getByText("400.0 Mbps")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/simple-mode/site-sizing-section.test.tsx`
Expected: FAIL — cannot resolve `./site-sizing-section`.

- [ ] **Step 3: Create `src/components/simple-mode/site-sizing-section.tsx`**

```tsx
import { StorageBreakdown } from "./storage-breakdown";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import { NetworkBandwidth } from "./network-bandwidth";
import type { CVmAgentReturnObject, Throughput } from "@/types/vault-sizer-api";

interface SiteSizingSectionProps {
  title: string;
  badge: string;
  data: CVmAgentReturnObject;
  initialFullRestore: Throughput | null;
}

export function SiteSizingSection({
  title,
  badge,
  data,
  initialFullRestore,
}: SiteSizingSectionProps) {
  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-muted-foreground ml-auto text-xs">{badge}</span>
      </div>
      <StorageBreakdown data={data} />
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Proxy Compute
        </p>
        <InfrastructureTelemetry compute={data.proxyCompute?.compute} />
        <NetworkBandwidth
          nightlyIncremental={data.proxyCompute?.compute?.networkThroughput}
          initialFullRestore={initialFullRestore}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/simple-mode/site-sizing-section.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/site-sizing-section.tsx src/components/simple-mode/site-sizing-section.test.tsx
git commit -m "feat: add SiteSizingSection for one pipeline's storage and compute" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `ProjectedSizingCard` split-canvas layout for copy mode

**Files:**

- Modify: `src/components/simple-mode/projected-sizing-card.tsx` (full rewrite below)
- Test: `src/components/simple-mode/projected-sizing-card.test.tsx` (append one test)

When `data.mode === "copy"`, render a master header (combined total = sum of both sites' tier storage, D6) above a `SiteSizingSection` for each site. Direct/null keeps the existing flat layout. Badges are derived from `repositoryConfig` (D8).

- [ ] **Step 1: Write the failing test**

Append this `it` block inside the `describe("ProjectedSizingCard", ...)` in `src/components/simple-mode/projected-sizing-card.test.tsx` (before its closing `});` on line 196). `CVmAgentReturnObject` is already imported at the top of the file:

```tsx
it("renders the split canvas with a combined total and both site sections in copy mode", async () => {
  const primaryData: CVmAgentReturnObject = {
    totalStorageTB: 0,
    workspaceGB: 0,
    performanceTierImmutabilityTaxGB: 0,
    capacityTierImmutabilityTaxGB: 0,
    repoCompute: {
      compute: {
        cores: 4,
        ram: 8,
        volumes: [{ diskGB: 24576, diskPurpose: 2 }],
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
  const secondaryData: CVmAgentReturnObject = {
    totalStorageTB: 0,
    workspaceGB: 0,
    performanceTierImmutabilityTaxGB: 0,
    capacityTierImmutabilityTaxGB: 0,
    repoCompute: {
      compute: {
        cores: 2,
        ram: 4,
        volumes: [{ diskGB: 18841, diskPurpose: 3 }],
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

  vi.mocked(fetch).mockResolvedValue(
    jsonResponse({
      success: true,
      mode: "copy",
      primary: primaryData,
      secondary: secondaryData,
    }),
  );

  render(
    <ProjectedSizingCard
      workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
      repositoryConfig={{
        ...DEFAULT_REPOSITORY_CONFIG_VALUES,
        backupPath: "copy",
      }}
      onChange={() => {}}
    />,
  );

  await vi.waitFor(() =>
    expect(screen.getByText("Combined Required Storage")).toBeInTheDocument(),
  );
  // 24576 GB + 18841 GB = 43417 GB => 42.4 TB combined.
  expect(screen.getByText("42.4 TB")).toBeInTheDocument();
  expect(
    screen.getByText("Primary — On-Premises Landing Zone"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Secondary — Offsite Cloud Vault"),
  ).toBeInTheDocument();
  // Default copy config: primary hardened-repository, secondary vault-azure.
  expect(screen.getByText("Hardened Repository")).toBeInTheDocument();
  expect(screen.getByText("Vault Azure")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/simple-mode/projected-sizing-card.test.tsx`
Expected: FAIL — copy mode has no split layout yet; "Combined Required Storage" is not found.

- [ ] **Step 3: Rewrite `projected-sizing-card.tsx` with the branch**

Replace the entire contents of `src/components/simple-mode/projected-sizing-card.tsx` with:

```tsx
import { LoaderCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
import { calculateInitialFullBandwidth } from "@/lib/simple-mode/calculate-initial-full-bandwidth";
import { getTotalStorageGB } from "@/lib/simple-mode/storage-tiers";
import { ForecastHorizonControl } from "./forecast-horizon-control";
import { StorageBreakdown } from "./storage-breakdown";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import { NetworkBandwidth } from "./network-bandwidth";
import { SiteSizingSection } from "./site-sizing-section";
import {
  REPO_TYPE_LABEL,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";

interface ProjectedSizingCardProps {
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
  onChange: (value: WorkloadDataValues) => void;
}

export function ProjectedSizingCard({
  workloadData,
  repositoryConfig,
  onChange,
}: ProjectedSizingCardProps) {
  const { data, isLoading, error } = useCalculatedSizing(
    workloadData,
    repositoryConfig,
  );
  const initialFullRestore = calculateInitialFullBandwidth(
    workloadData.sourceSizeTB,
    workloadData.dataReductionPercent,
  );

  const directData = data?.mode === "direct" ? data.data : null;
  const copyData = data?.mode === "copy" ? data : null;

  const secondaryBadge =
    repositoryConfig.targetRepository === "sobr"
      ? `SOBR · ${REPO_TYPE_LABEL[repositoryConfig.sobr.performanceType]}`
      : REPO_TYPE_LABEL[repositoryConfig.targetRepository];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-xl">
          <span className="flex items-center gap-2">
            <TrendingUp aria-hidden="true" className="text-primary size-5" />
            Projected Sizing
          </span>
          {isLoading ? (
            <LoaderCircle
              aria-label="Recalculating"
              className="text-muted-foreground size-4 animate-spin"
            />
          ) : null}
        </CardTitle>
        <ForecastHorizonControl value={workloadData} onChange={onChange} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <div
            role="alert"
            className="border-destructive text-destructive rounded-md border px-3 py-2 text-sm"
          >
            {error}
          </div>
        ) : null}

        {copyData ? (
          <>
            <div>
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Combined Required Storage
              </p>
              <p className="font-mono text-3xl font-semibold">
                {(
                  (getTotalStorageGB(copyData.primary) +
                    getTotalStorageGB(copyData.secondary)) /
                  1024
                ).toFixed(1)}{" "}
                TB
              </p>
              <p className="text-muted-foreground text-xs">
                On-Premises{" "}
                {(getTotalStorageGB(copyData.primary) / 1024).toFixed(1)} TB
                {" + "}
                Offsite Vault{" "}
                {(getTotalStorageGB(copyData.secondary) / 1024).toFixed(1)} TB
              </p>
            </div>
            <SiteSizingSection
              title="Primary — On-Premises Landing Zone"
              badge={REPO_TYPE_LABEL[repositoryConfig.primary.repoType]}
              data={copyData.primary}
              initialFullRestore={initialFullRestore}
            />
            <SiteSizingSection
              title="Secondary — Offsite Cloud Vault"
              badge={secondaryBadge}
              data={copyData.secondary}
              initialFullRestore={initialFullRestore}
            />
          </>
        ) : (
          <>
            <StorageBreakdown data={directData} />
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Proxy Compute
              </p>
              <InfrastructureTelemetry
                compute={directData?.proxyCompute?.compute}
              />
              <NetworkBandwidth
                nightlyIncremental={
                  directData?.proxyCompute?.compute?.networkThroughput
                }
                initialFullRestore={initialFullRestore}
              />
            </div>
          </>
        )}

        <div
          data-testid="projected-sizing-assumptions-placeholder"
          className="border-border h-16 rounded-lg border border-dashed"
        />
        <div
          data-testid="projected-sizing-actions-placeholder"
          className="border-border h-20 rounded-lg border border-dashed"
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the card test file to verify all pass**

Run: `npx vitest run src/components/simple-mode/projected-sizing-card.test.tsx`
Expected: PASS — the existing direct-mode tests plus the new copy split test.

- [ ] **Step 5: Full verification**

Run: `npm run test:run`
Expected: PASS — entire suite.

Run: `npm run build`
Expected: PASS — typecheck + build.

Run: `npm run lint`
Expected: PASS — no lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/simple-mode/projected-sizing-card.tsx src/components/simple-mode/projected-sizing-card.test.tsx
git commit -m "feat: split Projected Sizing canvas into master header plus two sites" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification

After Task 7, run the app (`npm run dev`, then open the proxied URL) and:

1. In **Direct to Vault** mode with a Vault Azure target, confirm the canvas shows only the Performance tier (no `0.0 TB` Capacity/Archive rows).
2. Switch to **Backup Copy to Vault**. Confirm the canvas splits into the master "Combined Required Storage" header plus Primary (On-Premises) and Secondary (Offsite Cloud Vault) sections, each with its own storage bars, Cores/RAM, and both bandwidth rows.
3. Set the Primary to a Hardened Repository and confirm its section shows only a Performance bar and the badge reads "Hardened Repository".
4. **Semantic eyeball (spec assumption):** confirm the Primary section's "Nightly Incremental" / "Initial Full / Restore" numbers read sensibly for an on-prem repo (outbound = repo-write rate). Note any oddity for follow-up; not a blocker.
5. Force a Secondary error (e.g. a Vault target with retention below the 30-day floor is blocked client-side; instead temporarily point the Secondary at a config the upstream rejects) and confirm the whole canvas shows one side-labeled error banner, not a partial estimate.
