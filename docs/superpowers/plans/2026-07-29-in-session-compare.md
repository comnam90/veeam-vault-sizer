# In-Session Ephemeral Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user hold up to 2 "snapshots" of the current sizing alongside the live one, and compare all three (Live + up to 2 snapshots) in a full-parity modal covering sizing figures, Workload Data inputs, and Repository Configuration — session-only, no persistence.

**Architecture:** `SimpleModePage` lifts `useCalculatedSizing` out of `ProjectedSizingCard` (so the page has direct access to the live `{workloadData, repositoryConfig, data}` triple) and owns a `Snapshot[]` list as component state. A new `SnapshotPanel` renders the saved list with checkboxes (capped at 2 selected) and opens a `CompareDialog`. All comparison-row logic (including the union/N/A handling across Direct vs. Copy mode and SOBR-tier applicability) lives in pure functions in `compare-sizings.ts`, kept separate from the rendering components so it's independently testable.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library, Tailwind v4, `radix-ui` (new `Dialog` primitive, following the existing `Tooltip`/`Checkbox` wrapper pattern).

**Spec:** `docs/superpowers/specs/2026-07-29-in-session-compare-design.md`

---

## File Structure

**Create:**

- `src/lib/simple-mode/format-throughput.ts` — shared non-null throughput formatter (extracted from `network-bandwidth.tsx`)
- `src/lib/simple-mode/format-throughput.test.ts`
- `src/lib/simple-mode/compare-sizings.ts` — pure row-computation functions for the compare table (`CompareEntry`, `ComparisonRow`, `getTotalRequiredStorageTB`, `getSizingComparisonRows`, `getWorkloadDataComparisonRows`, `getRepositoryConfigComparisonRows`)
- `src/lib/simple-mode/compare-sizings.test.ts`
- `src/components/ui/dialog.tsx` — Radix Dialog wrapper (no dedicated test file, matching this codebase's convention for thin `ui/` primitives — see `button.tsx`, `checkbox.tsx`, `tooltip.tsx`, none of which have test files; behavior is exercised through `compare-dialog.test.tsx`)
- `src/components/simple-mode/compare-dialog.tsx` — the modal: sizing table (always visible) + two collapsed-by-default `<details>` sections
- `src/components/simple-mode/compare-dialog.test.tsx`
- `src/components/simple-mode/snapshot-panel.tsx` — saved-sizings list, selection (capped at 2), rename, delete, "Compare selected" trigger
- `src/components/simple-mode/snapshot-panel.test.tsx`

**Modify:**

- `src/types/simple-mode.ts` — add `Snapshot` interface
- `src/components/simple-mode/network-bandwidth.tsx` — use the extracted `formatThroughputMbps`
- `src/components/simple-mode/projected-sizing-card.tsx` — accept `data`/`isLoading`/`error` as props instead of calling the hook; add "Snapshot current sizing" button in the `actions` placeholder
- `src/components/simple-mode/projected-sizing-card.test.tsx` — drop fetch/timer mocking in favor of passing `data`/`isLoading`/`error` directly; add button tests
- `src/components/simple-mode/simple-mode-page.tsx` — call `useCalculatedSizing`; own `snapshots` state; render `SnapshotPanel`
- `src/components/simple-mode/simple-mode-page.test.tsx` — update the fetch-stub comment; add snapshot-creation integration tests

---

## Task 1: Add the `Snapshot` type

**Files:**

- Modify: `src/types/simple-mode.ts`

- [ ] **Step 1: Add the interface**

Add after the `SizerResult` type (end of file):

```ts
export interface Snapshot {
  id: string;
  label: string;
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
  data: SizerResult;
}
```

This is a type-only addition with no runtime behavior, so there's no test for this step — it's exercised indirectly by every later task that constructs or consumes a `Snapshot`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no new errors (the type isn't referenced anywhere yet, so this just confirms the file still parses).

- [ ] **Step 3: Commit**

```bash
git add src/types/simple-mode.ts
git commit -m "feat: add Snapshot type for in-session compare"
```

---

## Task 2: Extract a shared `formatThroughputMbps` helper

**Files:**

- Create: `src/lib/simple-mode/format-throughput.ts`
- Create: `src/lib/simple-mode/format-throughput.test.ts`
- Modify: `src/components/simple-mode/network-bandwidth.tsx`

`network-bandwidth.tsx` currently has a private `formatThroughput` that null-checks and formats. `compare-sizings.ts` (Task 3) needs the same MB/s→Mbps math but with its own null-handling (a `null` value must propagate as "not applicable" for row-omission logic, not as the display string "—"). Splitting the non-null formatter out avoids duplicating the `× 8` conversion in two places.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/simple-mode/format-throughput.test.ts
import { describe, expect, it } from "vitest";
import { formatThroughputMbps } from "./format-throughput";

describe("formatThroughputMbps", () => {
  it("converts outbound MBps to Mbps, treating MB and Mb as equal magnitude", () => {
    expect(formatThroughputMbps({ inboundMBps: 100, outboundMBps: 50 })).toBe(
      "400.0 Mbps",
    );
  });

  it("rounds to one decimal place", () => {
    expect(formatThroughputMbps({ inboundMBps: 10, outboundMBps: 60.72 })).toBe(
      "485.8 Mbps",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/simple-mode/format-throughput.test.ts`
Expected: FAIL — `Cannot find module './format-throughput'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/simple-mode/format-throughput.ts
import type { Throughput } from "@/types/vault-sizer-api";

// Bytes → bits; treats MB and Mb as equal-magnitude (the networking-domain
// convention), not the strict ×8.388608 that the field's underlying
// MiB-based calculation would imply.
export function formatThroughputMbps(throughput: Throughput): string {
  return `${(throughput.outboundMBps * 8).toFixed(1)} Mbps`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/simple-mode/format-throughput.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Update `network-bandwidth.tsx` to use it**

Replace the local `formatThroughput` function in `src/components/simple-mode/network-bandwidth.tsx`:

```ts
import type { Throughput } from "@/types/vault-sizer-api";
import { formatThroughputMbps } from "@/lib/simple-mode/format-throughput";
import {
  BACKUP_WINDOW_HOURS,
  FULL_BACKUP_WINDOW_HOURS,
} from "@/lib/simple-mode/backup-windows";

function formatThroughput(throughput: Throughput | null | undefined): string {
  return throughput == null ? "—" : formatThroughputMbps(throughput);
}
```

(Delete the old inline implementation and its comment — the comment now lives on `formatThroughputMbps` itself.)

- [ ] **Step 6: Run the existing NetworkBandwidth tests to confirm no regression**

Run: `npx vitest run src/components/simple-mode/network-bandwidth.test.tsx`
Expected: PASS, same assertions as before (behavior unchanged)

- [ ] **Step 7: Commit**

```bash
git add src/lib/simple-mode/format-throughput.ts src/lib/simple-mode/format-throughput.test.ts src/components/simple-mode/network-bandwidth.tsx
git commit -m "refactor: extract formatThroughputMbps for reuse in compare"
```

---

## Task 3: `compare-sizings.ts` — sizing comparison rows

**Files:**

- Create: `src/lib/simple-mode/compare-sizings.ts`
- Create: `src/lib/simple-mode/compare-sizings.test.ts`

This task builds `getTotalRequiredStorageTB` and `getSizingComparisonRows` — the always-visible part of the compare modal (Total, Primary/Secondary tier breakdown, Proxy Compute, Network Bandwidth).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/simple-mode/compare-sizings.test.ts
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
} from "@/types/simple-mode";
import type {
  CVmAgentReturnObject,
  SizerResult,
} from "@/types/vault-sizer-api";
import type { SizerResult as SimpleModeSizerResult } from "@/types/simple-mode";

function directRepo(data: CVmAgentReturnObject): SimpleModeSizerResult {
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
```

Note: `SizerResult` is exported from `@/types/simple-mode`, not `@/types/vault-sizer-api` — the `import type { SizerResult } from "@/types/vault-sizer-api"` line above is unused and should be removed; the file only needs `SimpleModeSizerResult` aliased from `@/types/simple-mode`. Fix this before running (it would otherwise fail to compile since `vault-sizer-api.ts` has no `SizerResult` export).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/simple-mode/compare-sizings.test.ts`
Expected: FAIL — `Cannot find module './compare-sizings'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/simple-mode/compare-sizings.ts
import { calculateInitialFullBandwidth } from "./calculate-initial-full-bandwidth";
import { formatThroughputMbps } from "./format-throughput";
import { getTierStorageRows, getTotalStorageGB } from "./storage-tiers";
import type {
  RepositoryConfigValues,
  SizerResult,
  WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

export interface CompareEntry {
  label: string;
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
  data: SizerResult | null;
}

export interface ComparisonRow {
  label: string;
  values: (string | null)[];
}

function getPrimaryData(data: SizerResult | null): CVmAgentReturnObject | null {
  if (data === null) return null;
  return data.mode === "direct" ? data.data : data.primary;
}

function getSecondaryData(
  data: SizerResult | null,
): CVmAgentReturnObject | null {
  if (data === null || data.mode === "direct") return null;
  return data.secondary;
}

function formatTB(gb: number): string {
  return `${(gb / 1024).toFixed(1)} TB`;
}

export function getTotalRequiredStorageTB(
  data: SizerResult | null,
): number | null {
  if (data === null) return null;
  const primaryGB = getTotalStorageGB(getPrimaryData(data));
  const secondaryGB =
    data.mode === "copy" ? getTotalStorageGB(data.secondary) : 0;
  return (primaryGB + secondaryGB) / 1024;
}

const TIER_KEYS = ["performance", "capacity", "archive"] as const;
const TIER_ROW_LABELS: Record<(typeof TIER_KEYS)[number], string> = {
  performance: "Performance",
  capacity: "Capacity",
  archive: "Archive",
};

function getTierRowsForRole(
  roleLabel: "Primary" | "Secondary",
  entries: CompareEntry[],
  getRoleData: (entry: CompareEntry) => CVmAgentReturnObject | null,
): ComparisonRow[] {
  return TIER_KEYS.map((key) => ({
    label: `${roleLabel} — ${TIER_ROW_LABELS[key]}`,
    values: entries.map((entry) => {
      const tierRow = getTierStorageRows(getRoleData(entry)).find(
        (tier) => tier.key === key,
      );
      return tierRow ? formatTB(tierRow.diskGB) : null;
    }),
  })).filter((row) => row.values.some((value) => value !== null));
}

// Derived from workloadData alone — genuinely role-independent, not a bug.
// This means a copy-mode entry's Primary and Secondary "Initial Full /
// Restore" rows will show the identical figure twice; that matches
// projected-sizing-card.tsx's existing behavior today (it passes this same
// `initialFullRestore` value to both SiteSizingSections), which is what the
// spec's "reproduces every figure SiteSizingSection shows today" commits to.
// Don't "fix" this into two independently-computed numbers without a
// separate design decision — there's no per-role bandwidth split to derive it from.
function getEntryInitialFullRestore(entry: CompareEntry) {
  return calculateInitialFullBandwidth(
    entry.workloadData.sourceSizeTB,
    entry.workloadData.dataReductionPercent,
  );
}

function getComputeAndBandwidthRowsForRole(
  roleLabel: "Primary" | "Secondary",
  entries: CompareEntry[],
  getRoleData: (entry: CompareEntry) => CVmAgentReturnObject | null,
): ComparisonRow[] {
  const compute = entries.map(
    (entry) => getRoleData(entry)?.proxyCompute?.compute,
  );

  const rows: ComparisonRow[] = [
    {
      label: `${roleLabel} — Cores`,
      values: compute.map((c) => (c ? String(c.cores) : null)),
    },
    {
      label: `${roleLabel} — RAM`,
      values: compute.map((c) => (c ? `${c.ram} GB` : null)),
    },
    {
      label: `${roleLabel} — Nightly Incremental (8h)`,
      values: compute.map((c) =>
        c?.networkThroughput ? formatThroughputMbps(c.networkThroughput) : null,
      ),
    },
    {
      label: `${roleLabel} — Initial Full / Restore (24h)`,
      values: entries.map((entry, index) => {
        if (!compute[index]) return null;
        const throughput = getEntryInitialFullRestore(entry);
        return throughput ? formatThroughputMbps(throughput) : null;
      }),
    },
  ];

  return rows.filter((row) => row.values.some((value) => value !== null));
}

export function getSizingComparisonRows(
  entries: CompareEntry[],
): ComparisonRow[] {
  return [
    {
      label: "Total Required Storage",
      values: entries.map((entry) => {
        const totalTB = getTotalRequiredStorageTB(entry.data);
        return totalTB === null ? null : `${totalTB.toFixed(1)} TB`;
      }),
    },
    ...getTierRowsForRole("Primary", entries, (entry) =>
      getPrimaryData(entry.data),
    ),
    ...getComputeAndBandwidthRowsForRole("Primary", entries, (entry) =>
      getPrimaryData(entry.data),
    ),
    ...getTierRowsForRole("Secondary", entries, (entry) =>
      getSecondaryData(entry.data),
    ),
    ...getComputeAndBandwidthRowsForRole("Secondary", entries, (entry) =>
      getSecondaryData(entry.data),
    ),
  ];
}
```

Also fix the test file's stray import noted above: delete the line `import type { CVmAgentReturnObject, SizerResult } from "@/types/vault-sizer-api";` and change it to `import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";`, keeping `import type { SizerResult as SimpleModeSizerResult } from "@/types/simple-mode";` (rename to just `SizerResult` since there's no longer a clash) and update the `directRepo` helper's return type accordingly. The corrected top of the test file:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/simple-mode/compare-sizings.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/compare-sizings.ts src/lib/simple-mode/compare-sizings.test.ts
git commit -m "feat: add sizing comparison row computation"
```

---

## Task 4: `compare-sizings.ts` — Workload Data comparison rows

**Files:**

- Modify: `src/lib/simple-mode/compare-sizings.ts`
- Modify: `src/lib/simple-mode/compare-sizings.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `compare-sizings.test.ts`:

```ts
import { getWorkloadDataComparisonRows } from "./compare-sizings";
import type { WorkloadDataValues } from "@/types/simple-mode";

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
```

Merge both new imports (`getWorkloadDataComparisonRows` from `./compare-sizings`, `WorkloadDataValues` from `@/types/simple-mode`) into this test file's existing import statements from those same two modules (added in Task 3) rather than adding duplicate `import` lines.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/simple-mode/compare-sizings.test.ts`
Expected: FAIL — `getWorkloadDataComparisonRows is not exported`

- [ ] **Step 3: Write the implementation**

Append to `compare-sizings.ts`:

```ts
const WORKLOAD_DATA_FIELDS: {
  label: string;
  get: (w: WorkloadDataValues) => string;
}[] = [
  { label: "Source Size (TB)", get: (w) => w.sourceSizeTB },
  { label: "Daily Change Rate (%)", get: (w) => w.dailyChangeRatePercent },
  { label: "Data Reduction (%)", get: (w) => w.dataReductionPercent },
  { label: "Yearly Growth (%)", get: (w) => w.yearlyGrowthPercent },
  {
    label: "Short-Term Retention (Days)",
    get: (w) => w.shortTermRetentionDays,
  },
  { label: "GFS Weekly", get: (w) => w.gfsWeekly },
  { label: "GFS Monthly", get: (w) => w.gfsMonthly },
  { label: "GFS Yearly", get: (w) => w.gfsYearly },
  { label: "Forecast Horizon (Years)", get: (w) => w.projectLengthYears },
  {
    label: "Cap GFS to Forecast Horizon",
    get: (w) => (w.capGfsToForecastHorizon ? "On" : "Off"),
  },
];

export function getWorkloadDataComparisonRows(
  entries: CompareEntry[],
): ComparisonRow[] {
  return WORKLOAD_DATA_FIELDS.map(({ label, get }) => ({
    label,
    values: entries.map((entry) => get(entry.workloadData)),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/simple-mode/compare-sizings.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/compare-sizings.ts src/lib/simple-mode/compare-sizings.test.ts
git commit -m "feat: add Workload Data comparison rows"
```

---

## Task 5: `compare-sizings.ts` — Repository Configuration comparison rows

**Files:**

- Modify: `src/lib/simple-mode/compare-sizings.ts`
- Modify: `src/lib/simple-mode/compare-sizings.test.ts`

This is the deeply conditional section: Primary/Target fields depend on Direct vs. Copy and on whether the target is a SOBR; Capacity/Archive Tier fields depend on those tiers being enabled; retention override fields depend on `customizeRetention`.

- [ ] **Step 1: Write the failing tests**

Merge `getRepositoryConfigComparisonRows` into this test file's existing import from `./compare-sizings` (added in Task 3, extended in Task 4) rather than adding a duplicate `import` line, then append below it:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/simple-mode/compare-sizings.test.ts`
Expected: FAIL — `getRepositoryConfigComparisonRows is not exported`

- [ ] **Step 3: Write the implementation**

Merge `REPO_TYPE_LABEL`, `ArchiveTierConfig`, `CapacityTierConfig`, and `RetentionOverride` into the existing `@/types/simple-mode` import at the top of `compare-sizings.ts` (from Task 3) rather than adding a second import statement for the same module:

```ts
import {
  REPO_TYPE_LABEL,
  type ArchiveTierConfig,
  type CapacityTierConfig,
  type RepositoryConfigValues,
  type RetentionOverride,
  type SizerResult,
  type WorkloadDataValues,
} from "@/types/simple-mode";
```

Then append the rest to `compare-sizings.ts`:

```ts
function formatCapacityTierPolicy(tier: CapacityTierConfig): string {
  // copyPolicy and movePolicy are independent booleans (two separate
  // checkboxes in sobr-builder.tsx) — Veeam SOBR allows Copy and Move to
  // run together, and DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier
  // ships with both true. A policy?"Copy":policy?"Move":"—" ternary would
  // silently drop "Move" whenever both are set, which is the common case,
  // not an edge case — so all four combinations are named explicitly.
  if (tier.copyPolicy && tier.movePolicy) return "Copy + Move";
  if (tier.copyPolicy) return "Copy";
  if (tier.movePolicy) return "Move";
  return "—";
}

function formatCapacityTier(tier: CapacityTierConfig): string {
  const policy = formatCapacityTierPolicy(tier);
  return `${REPO_TYPE_LABEL[tier.type]}, ${policy}, move at ${tier.moveDays}d, immutable ${tier.immutableDays}d`;
}

function formatArchiveTier(tier: ArchiveTierConfig): string {
  const standalone = tier.standaloneFullBackups ? ", standalone fulls" : "";
  return `move at ${tier.moveDays}d, immutable ${tier.immutableDays}d${standalone}`;
}

function formatRetentionOverride(retention: RetentionOverride): string | null {
  if (!retention.customizeRetention) return null;
  return `${retention.retentionDays}d + ${retention.gfsWeekly}w / ${retention.gfsMonthly}m / ${retention.gfsYearly}y`;
}

function getPrimaryTargetConfigRows(entries: CompareEntry[]): ComparisonRow[] {
  const rows: ComparisonRow[] = [
    {
      label: "Primary — Repository Type",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        const repoType =
          repositoryConfig.backupPath === "copy"
            ? repositoryConfig.primary.repoType
            : repositoryConfig.targetRepository === "sobr"
              ? repositoryConfig.sobr.performanceType
              : repositoryConfig.targetRepository;
        return REPO_TYPE_LABEL[repoType];
      }),
    },
    {
      label: "Primary — Immutable (Days)",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        return repositoryConfig.backupPath === "copy"
          ? repositoryConfig.primary.immutableDays
          : repositoryConfig.targetRepository === "sobr"
            ? repositoryConfig.sobr.performanceImmutableDays
            : repositoryConfig.targetRepositoryImmutableDays;
      }),
    },
    {
      label: "Primary — Capacity Tier",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath === "copy") return null;
        if (repositoryConfig.targetRepository !== "sobr") return null;
        if (!repositoryConfig.sobr.capacityTier.enabled) return null;
        return formatCapacityTier(repositoryConfig.sobr.capacityTier);
      }),
    },
    {
      label: "Primary — Archive Tier",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath === "copy") return null;
        if (repositoryConfig.targetRepository !== "sobr") return null;
        if (!repositoryConfig.sobr.archiveTier.enabled) return null;
        return formatArchiveTier(repositoryConfig.sobr.archiveTier);
      }),
    },
    {
      label: "Primary — Retention Override",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        return formatRetentionOverride(repositoryConfig.primary.retention);
      }),
    },
  ];

  return rows.filter((row) => row.values.some((value) => value !== null));
}

function getSecondaryConfigRows(entries: CompareEntry[]): ComparisonRow[] {
  const rows: ComparisonRow[] = [
    {
      label: "Secondary — Repository Type",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        return REPO_TYPE_LABEL[
          repositoryConfig.targetRepository === "sobr"
            ? repositoryConfig.sobr.performanceType
            : repositoryConfig.targetRepository
        ];
      }),
    },
    {
      label: "Secondary — Immutable (Days)",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        return repositoryConfig.targetRepository === "sobr"
          ? repositoryConfig.sobr.performanceImmutableDays
          : repositoryConfig.targetRepositoryImmutableDays;
      }),
    },
    {
      label: "Secondary — Capacity Tier",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        if (repositoryConfig.targetRepository !== "sobr") return null;
        if (!repositoryConfig.sobr.capacityTier.enabled) return null;
        return formatCapacityTier(repositoryConfig.sobr.capacityTier);
      }),
    },
    {
      label: "Secondary — Archive Tier",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        if (repositoryConfig.targetRepository !== "sobr") return null;
        if (!repositoryConfig.sobr.archiveTier.enabled) return null;
        return formatArchiveTier(repositoryConfig.sobr.archiveTier);
      }),
    },
    {
      label: "Secondary — Retention Override",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        return formatRetentionOverride(repositoryConfig.secondaryRetention);
      }),
    },
  ];

  return rows.filter((row) => row.values.some((value) => value !== null));
}

export function getRepositoryConfigComparisonRows(
  entries: CompareEntry[],
): ComparisonRow[] {
  return [
    {
      label: "Backup Path",
      values: entries.map((entry) =>
        entry.repositoryConfig.backupPath === "copy" ? "Copy" : "Direct",
      ),
    },
    ...getPrimaryTargetConfigRows(entries),
    ...getSecondaryConfigRows(entries),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/simple-mode/compare-sizings.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/compare-sizings.ts src/lib/simple-mode/compare-sizings.test.ts
git commit -m "feat: add Repository Configuration comparison rows"
```

---

## Task 6: Lift `useCalculatedSizing` from `ProjectedSizingCard` to `SimpleModePage`

**Files:**

- Modify: `src/components/simple-mode/projected-sizing-card.tsx`
- Modify: `src/components/simple-mode/projected-sizing-card.test.tsx`
- Modify: `src/components/simple-mode/simple-mode-page.tsx`
- Modify: `src/components/simple-mode/simple-mode-page.test.tsx` (comment only)

`SimpleModePage` already owns `workloadData`/`repositoryConfig`; it needs the derived `data` too, so it can build snapshots and the Live comparison entry. This task only moves the hook call — no new feature behavior yet. Every existing assertion is preserved; only the test setup (no more fetch/timer mocking in the card's own test) changes. `use-calculated-sizing.test.ts` already covers "sets error on a non-abort rejection and leaves prior data intact" (the one behavior that stops being exercised by the card once it no longer owns the fetch), so no new hook test is needed.

- [ ] **Step 1: Update `ProjectedSizingCard` to accept props instead of calling the hook**

In `src/components/simple-mode/projected-sizing-card.tsx`, remove the `useCalculatedSizing` import and call, and change the props interface:

```ts
import { LoaderCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateInitialFullBandwidth } from "@/lib/simple-mode/calculate-initial-full-bandwidth";
import {
  getTargetTierLabels,
  getTotalStorageGB,
} from "@/lib/simple-mode/storage-tiers";
import { ForecastHorizonControl } from "./forecast-horizon-control";
import { SiteSizingSection } from "./site-sizing-section";
import {
  REPO_TYPE_LABEL,
  type RepositoryConfigValues,
  type SizerResult,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";
```

(Drop the `useCalculatedSizing` import and add `SizerResult` for the new prop type. **Keep** the `CVmAgentReturnObject` type-only import — `computeCopyModeTotals` still uses it for its `primary`/`secondary` parameter types, and that function is untouched by this task.)

Update the props interface and function signature:

```ts
interface ProjectedSizingCardProps {
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
  data: SizerResult | null;
  isLoading: boolean;
  error: string | null;
  onChange: (value: WorkloadDataValues) => void;
}

export function ProjectedSizingCard({
  workloadData,
  repositoryConfig,
  data,
  isLoading,
  error,
  onChange,
}: ProjectedSizingCardProps) {
  const initialFullRestore = calculateInitialFullBandwidth(
    workloadData.sourceSizeTB,
    workloadData.dataReductionPercent,
  );

  const directData = data?.mode === "direct" ? data.data : null;
  const copyData = data?.mode === "copy" ? data : null;
  const archiveTierNotice = data?.archiveTierNotice;

  // ...rest of the component body is unchanged
```

Everything after this point in the component (the `targetTierLabels`, `computeCopyModeTotals` usage, and the JSX) stays exactly as it is today — only the removed hook call and the props it fed from changes.

- [ ] **Step 2: Rewrite `projected-sizing-card.test.tsx`**

Replace the entire file:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ProjectedSizingCard } from "./projected-sizing-card";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const mockData: CVmAgentReturnObject = {
  totalStorageTB: 18.4,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
  repoCompute: {
    compute: {
      cores: 4,
      ram: 16,
      volumes: [{ diskGB: 18841, diskPurpose: 3 }],
    },
  },
  // Deliberately distinct from repoCompute's cores/ram above: proves
  // InfrastructureTelemetry reads proxyCompute (proxy sizing), not
  // repoCompute (repository storage volumes) — a swap between the two
  // is type-compatible and wouldn't otherwise be caught by these tests.
  proxyCompute: {
    compute: {
      cores: 8,
      ram: 32,
      networkThroughput: { inboundMBps: 100, outboundMBps: 50 },
    },
  },
};

describe("ProjectedSizingCard", () => {
  it("renders the assumptions placeholder and the Snapshot current sizing action", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByTestId("projected-sizing-assumptions-placeholder"),
    ).toBeInTheDocument();
  });

  it("shows a loading indicator while isLoading is true", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={null}
        isLoading={true}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("Recalculating")).toBeInTheDocument();
  });

  it("wires InfrastructureTelemetry to proxyCompute, not repoCompute", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("32 GB")).toBeInTheDocument();
  });

  it("labels the compute/network section as Proxy Compute, distinct from repo storage sizing above it", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Proxy Compute")).toBeInTheDocument();
  });

  it("wires NetworkBandwidth to proxyCompute's networkThroughput and the derived initial full/restore figure", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    const nightlyRow = screen
      .getByText("Nightly Incremental (8h)")
      .closest("tr");
    expect(nightlyRow).not.toBeNull();
    expect(within(nightlyRow!).getByText("400.0 Mbps")).toBeInTheDocument();

    const initialFullRow = screen
      .getByText("Initial Full / Restore (24h)")
      .closest("tr");
    expect(initialFullRow).not.toBeNull();
    expect(within(initialFullRow!).getByText("485.5 Mbps")).toBeInTheDocument();
  });

  it("shows the error banner and keeps last-good data visible beneath it", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error="Upstream sizing API unreachable"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Upstream sizing API unreachable",
    );
    expect(screen.getAllByText("18.4 TB").length).toBeGreaterThan(0);
  });

  it("renders the split canvas with a combined total and both site sections in copy mode", () => {
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

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={{
          ...DEFAULT_REPOSITORY_CONFIG_VALUES,
          backupPath: "copy",
        }}
        data={{ mode: "copy", primary: primaryData, secondary: secondaryData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Combined Required Storage")).toBeInTheDocument();
    expect(screen.getByText("42.4 TB")).toBeInTheDocument();
    expect(screen.getByText("Primary Repository")).toBeInTheDocument();
    expect(screen.getByText("Secondary Repository")).toBeInTheDocument();
    expect(
      screen.getByText("Performance — Hardened Repository"),
    ).toBeInTheDocument();
    expect(screen.getByText("Performance — Vault Azure")).toBeInTheDocument();
    expect(
      screen.getByText("Primary 24.0 TB + Secondary 18.4 TB"),
    ).toBeInTheDocument();
  });

  it("derives the copy-mode subline's secondary figure as a residual of the rounded headline (D14), not its own independent rounding", () => {
    const primaryData: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 4,
          ram: 8,
          volumes: [{ diskGB: 3113, diskPurpose: 2 }],
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
          volumes: [{ diskGB: 2089, diskPurpose: 3 }],
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

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={{
          ...DEFAULT_REPOSITORY_CONFIG_VALUES,
          backupPath: "copy",
        }}
        data={{ mode: "copy", primary: primaryData, secondary: secondaryData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("5.1 TB")).toBeInTheDocument();
    expect(
      screen.getByText("Primary 3.0 TB + Secondary 2.1 TB"),
    ).toBeInTheDocument();
  });

  it("titles the direct-mode section Primary Repository with its target's tier label", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByText("Performance — Vault Azure")).toBeInTheDocument();
    expect(screen.getByText("Primary Repository")).toBeInTheDocument();
  });

  it("renders the adjusted-threshold note when archiveTierNotice.status is adjusted", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{
          mode: "direct",
          data: mockData,
          archiveTierNotice: { status: "adjusted", effectiveThresholdDays: 30 },
        }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByText(/adjusted internally to 30 days/i),
    ).toBeInTheDocument();
  });

  it("renders the hard disclaimer when archiveTierNotice.status is failed", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{
          mode: "direct",
          data: mockData,
          archiveTierNotice: { status: "failed" },
        }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /couldn't be fully verified/i,
    );
  });

  it("renders no notice when archiveTierNotice is absent", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
      />,
    );

    expect(screen.getAllByText("18.4 TB").length).toBeGreaterThan(0);
    expect(screen.queryByText(/adjusted internally/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't be fully verified/i),
    ).not.toBeInTheDocument();
  });
});
```

Note: the original "renders both ghost placeholders" test asserted both `projected-sizing-assumptions-placeholder` and `projected-sizing-actions-placeholder`. This rewrite keeps only the assumptions-placeholder assertion under a renamed test, because Task 7 replaces the actions placeholder with the real "Snapshot current sizing" button — that placeholder is intentionally not re-asserted here since it's about to stop existing.

- [ ] **Step 3: Update `SimpleModePage` to own the hook call**

In `src/components/simple-mode/simple-mode-page.tsx`:

```tsx
import { useState } from "react";
import { WorkloadDataCard } from "./workload-data-card";
import { BackupRepositoryCard } from "./backup-repository-card";
import { ProjectedSizingCard } from "./projected-sizing-card";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
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
  const { data, isLoading, error } = useCalculatedSizing(
    workloadData,
    repositoryConfig,
  );

  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 p-6 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-8">
        <WorkloadDataCard value={workloadData} onChange={setWorkloadData} />
        <BackupRepositoryCard
          value={repositoryConfig}
          workloadData={workloadData}
          onChange={setRepositoryConfig}
        />
      </div>
      <div className="flex flex-col gap-4 lg:col-span-4">
        <ProjectedSizingCard
          workloadData={workloadData}
          repositoryConfig={repositoryConfig}
          data={data}
          isLoading={isLoading}
          error={error}
          onChange={setWorkloadData}
        />
      </div>
    </div>
  );
}
```

(`onSnapshot` and the `SnapshotPanel` are added in Tasks 7–10; this step only relocates the hook. Note the right-hand column's `className` changes from a bare `"lg:col-span-4"` to `"flex flex-col gap-4 lg:col-span-4"` in anticipation of `SnapshotPanel` being added as a sibling below `ProjectedSizingCard` later — harmless with a single child.)

- [ ] **Step 4: Update the fetch-stub comment in `simple-mode-page.test.tsx`**

The `beforeEach` comment currently reads:

```ts
// ProjectedSizingCard's useCalculatedSizing dispatches a real fetch on
// mount; stub it so these tests don't hit the network.
```

Change it to:

```ts
// SimpleModePage's useCalculatedSizing dispatches a real fetch on mount;
// stub it so these tests don't hit the network.
```

No other change is needed in this file for this task — its two existing tests don't touch `data`/`isLoading`/`error` directly.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all suites — this confirms the refactor didn't regress `projected-sizing-card.test.tsx`, `simple-mode-page.test.tsx`, or any other suite.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc -b --noEmit && npx eslint .`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/simple-mode/projected-sizing-card.tsx src/components/simple-mode/projected-sizing-card.test.tsx src/components/simple-mode/simple-mode-page.tsx src/components/simple-mode/simple-mode-page.test.tsx
git commit -m "refactor: lift useCalculatedSizing from ProjectedSizingCard to SimpleModePage"
```

---

## Task 7: Add the "Snapshot current sizing" button

**Files:**

- Modify: `src/components/simple-mode/projected-sizing-card.tsx`
- Modify: `src/components/simple-mode/projected-sizing-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `projected-sizing-card.test.tsx` (add `userEvent` and `vi` imports at the top: `import userEvent from "@testing-library/user-event";` and change the vitest import line to `import { describe, expect, it, vi } from "vitest";`):

```tsx
describe("Snapshot current sizing button", () => {
  it("calls onSnapshot when clicked", async () => {
    const user = userEvent.setup();
    const onSnapshot = vi.fn();

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
        onSnapshot={onSnapshot}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    );
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("is disabled while isLoading is true", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={null}
        isLoading={true}
        error={null}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    ).toBeDisabled();
  });

  it("is disabled when error is set", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error="Upstream sizing API unreachable"
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    ).toBeDisabled();
  });

  it("is disabled when data is null (no successful calculation yet)", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={null}
        isLoading={false}
        error={null}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    ).toBeDisabled();
  });

  it("is enabled once data is present and there is no loading/error state", () => {
    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        data={{ mode: "direct", data: mockData }}
        isLoading={false}
        error={null}
        onChange={() => {}}
        onSnapshot={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", { name: /snapshot current sizing/i }),
    ).toBeEnabled();
  });
});
```

Every other test in the file must also pass an `onSnapshot={() => {}}` prop from this point on (the prop becomes required) — add `onSnapshot={() => {}}` to each existing `<ProjectedSizingCard ... />` invocation in the file from Task 6.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/simple-mode/projected-sizing-card.test.tsx`
Expected: FAIL — no button with accessible name "Snapshot current sizing" exists yet, and TypeScript errors on the missing `onSnapshot` prop

- [ ] **Step 3: Implement the button**

In `projected-sizing-card.tsx`, add the `Button` import:

```ts
import { Button } from "@/components/ui/button";
```

Add `onSnapshot: () => void;` to `ProjectedSizingCardProps` and destructure it in the function signature. Replace the actions placeholder:

```tsx
<div
  data-testid="projected-sizing-actions-placeholder"
  className="border-border h-20 rounded-lg border border-dashed"
/>
```

with:

```tsx
<Button
  variant="outline"
  onClick={onSnapshot}
  disabled={isLoading || error !== null || data === null}
>
  Snapshot current sizing
</Button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/simple-mode/projected-sizing-card.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: no errors — this will also surface `SimpleModePage`'s now-missing `onSnapshot` prop; add a temporary `onSnapshot={() => {}}` there (Task 8/10 replaces it with the real handler) so the build stays green:

```tsx
<ProjectedSizingCard
  workloadData={workloadData}
  repositoryConfig={repositoryConfig}
  data={data}
  isLoading={isLoading}
  error={error}
  onChange={setWorkloadData}
  onSnapshot={() => {}}
/>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/simple-mode/projected-sizing-card.tsx src/components/simple-mode/projected-sizing-card.test.tsx src/components/simple-mode/simple-mode-page.tsx
git commit -m "feat: add Snapshot current sizing button to ProjectedSizingCard"
```

---

## Task 8: `Dialog` UI primitive and `CompareDialog` component

**Files:**

- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/simple-mode/compare-dialog.tsx`
- Create: `src/components/simple-mode/compare-dialog.test.tsx`

- [ ] **Step 1: Create the `Dialog` primitive**

```tsx
// src/components/ui/dialog.tsx
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid max-h-[85vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border p-6",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
};
```

No dedicated test for this file — matches the existing convention for thin Radix wrappers (`button.tsx`, `checkbox.tsx`, `tooltip.tsx` have none); it's exercised through `compare-dialog.test.tsx` below. Note the border-only elevation (no `shadow-*` classes), matching `card.tsx`'s own convention and CLAUDE.md's "keep elevation subtle... rather than decorative" design note.

- [ ] **Step 2: Write the failing tests for `CompareDialog`**

```tsx
// src/components/simple-mode/compare-dialog.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompareDialog } from "./compare-dialog";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
} from "@/types/simple-mode";
import type { CompareEntry } from "@/lib/simple-mode/compare-sizings";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const liveData: CVmAgentReturnObject = {
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

const entries: CompareEntry[] = [
  {
    label: "Live",
    workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
    repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
    data: { mode: "direct", data: liveData },
  },
  {
    label: "Snapshot 1",
    workloadData: { ...DEFAULT_WORKLOAD_DATA_VALUES, sourceSizeTB: "20" },
    repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
    data: {
      mode: "direct",
      data: {
        ...liveData,
        repoCompute: {
          compute: {
            cores: 4,
            ram: 16,
            volumes: [{ diskGB: 4096, diskPurpose: 3 }],
          },
        },
      },
    },
  },
];

describe("CompareDialog", () => {
  it("does not render its content when closed", () => {
    render(
      <CompareDialog open={false} onOpenChange={() => {}} entries={entries} />,
    );
    expect(screen.queryByText("Compare Sizings")).not.toBeInTheDocument();
  });

  it("renders a column per entry and the Total Required Storage row when open", () => {
    render(
      <CompareDialog open={true} onOpenChange={() => {}} entries={entries} />,
    );

    expect(screen.getByText("Compare Sizings")).toBeInTheDocument();

    // Scoped to the sizing table specifically: the Workload Data and
    // Repository Configuration sections each render their own
    // ComparisonTable too (mounted even while their <details> is closed —
    // jsdom doesn't hide collapsed-details content), so an unscoped
    // getByRole("columnheader", { name: "Live" }) would match 3 elements
    // and throw.
    const totalRow = screen.getByText("Total Required Storage").closest("tr");
    expect(totalRow).not.toBeNull();
    const sizingTable = totalRow!.closest("table");
    expect(sizingTable).not.toBeNull();
    expect(
      within(sizingTable!).getByRole("columnheader", { name: "Live" }),
    ).toBeInTheDocument();
    expect(
      within(sizingTable!).getByRole("columnheader", { name: "Snapshot 1" }),
    ).toBeInTheDocument();
    expect(within(totalRow!).getByText("2.0 TB")).toBeInTheDocument();
    expect(within(totalRow!).getByText("4.0 TB")).toBeInTheDocument();
  });

  it("renders the Workload Data and Repository Configuration sections collapsed by default", () => {
    render(
      <CompareDialog open={true} onOpenChange={() => {}} entries={entries} />,
    );

    const workloadDetails = screen
      .getByText("Workload Data")
      .closest("details");
    const repoDetails = screen
      .getByText("Repository Configuration")
      .closest("details");
    expect(workloadDetails).not.toBeNull();
    expect(repoDetails).not.toBeNull();
    expect(workloadDetails).not.toHaveAttribute("open");
    expect(repoDetails).not.toHaveAttribute("open");
  });

  it("reveals Workload Data rows once expanded", async () => {
    const user = userEvent.setup();
    render(
      <CompareDialog open={true} onOpenChange={() => {}} entries={entries} />,
    );

    await user.click(screen.getByText("Workload Data"));

    const sourceSizeRow = screen.getByText("Source Size (TB)").closest("tr");
    expect(sourceSizeRow).not.toBeNull();
    expect(within(sourceSizeRow!).getByText("10")).toBeInTheDocument();
    expect(within(sourceSizeRow!).getByText("20")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/simple-mode/compare-dialog.test.tsx`
Expected: FAIL — `Cannot find module './compare-dialog'`

- [ ] **Step 4: Implement `CompareDialog`**

```tsx
// src/components/simple-mode/compare-dialog.tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getRepositoryConfigComparisonRows,
  getSizingComparisonRows,
  getWorkloadDataComparisonRows,
  type CompareEntry,
  type ComparisonRow,
} from "@/lib/simple-mode/compare-sizings";

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: CompareEntry[];
}

// Cells key on column index, not entry.label — Task 9 makes snapshot labels
// user-renameable, so two entries (e.g. two snapshots both renamed to the
// same string) can share a label. Column order is stable while the dialog
// is open, so index is a safe, collision-free key.
function ComparisonTable({
  entries,
  rows,
}: {
  entries: CompareEntry[];
  rows: ComparisonRow[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-border border-b">
          <th className="py-1.5 pr-2 text-left font-medium"> </th>
          {entries.map((entry, index) => (
            <th key={index} className="py-1.5 pr-2 text-right font-medium">
              {entry.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-border border-t">
            <td className="text-muted-foreground py-1.5 pr-2">{row.label}</td>
            {row.values.map((value, index) => (
              <td
                key={`${row.label}-${index}`}
                className="py-1.5 pr-2 text-right font-mono"
              >
                {value ?? "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CompareDialog({
  open,
  onOpenChange,
  entries,
}: CompareDialogProps) {
  const sizingRows = getSizingComparisonRows(entries);
  const workloadDataRows = getWorkloadDataComparisonRows(entries);
  const repositoryConfigRows = getRepositoryConfigComparisonRows(entries);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compare Sizings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <ComparisonTable entries={entries} rows={sizingRows} />
          <details className="border-border rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Workload Data
            </summary>
            <div className="pt-3">
              <ComparisonTable entries={entries} rows={workloadDataRows} />
            </div>
          </details>
          <details className="border-border rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Repository Configuration
            </summary>
            <div className="pt-3">
              <ComparisonTable entries={entries} rows={repositoryConfigRows} />
            </div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/simple-mode/compare-dialog.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/simple-mode/compare-dialog.tsx src/components/simple-mode/compare-dialog.test.tsx
git commit -m "feat: add CompareDialog with full-parity sizing and collapsible input/config sections"
```

---

## Task 9: `SnapshotPanel` component

**Files:**

- Create: `src/components/simple-mode/snapshot-panel.tsx`
- Create: `src/components/simple-mode/snapshot-panel.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/simple-mode/snapshot-panel.test.tsx
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SnapshotPanel } from "./snapshot-panel";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type Snapshot,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const sampleData: CVmAgentReturnObject = {
  totalStorageTB: 0,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
  repoCompute: {
    compute: { cores: 4, ram: 16, volumes: [{ diskGB: 2048, diskPurpose: 3 }] },
  },
};

function makeSnapshot(id: string, label: string, diskGB: number): Snapshot {
  return {
    id,
    label,
    workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
    repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
    data: {
      mode: "direct",
      data: {
        ...sampleData,
        repoCompute: {
          compute: { cores: 4, ram: 16, volumes: [{ diskGB, diskPurpose: 3 }] },
        },
      },
    },
  };
}

const live = {
  label: "Live",
  workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
  repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
  data: null,
};

describe("SnapshotPanel", () => {
  it("shows a placeholder message when there are no saved sizings", () => {
    render(
      <SnapshotPanel
        snapshots={[]}
        live={live}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(/no saved sizings yet/i)).toBeInTheDocument();
  });

  it("renders one row per snapshot with its label and headline total", () => {
    const snapshots = [
      makeSnapshot("1", "Snapshot 1", 2048),
      makeSnapshot("2", "Snapshot 2", 4096),
    ];
    render(
      <SnapshotPanel
        snapshots={snapshots}
        live={live}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByDisplayValue("Snapshot 1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Snapshot 2")).toBeInTheDocument();
    expect(screen.getByText("2.0 TB")).toBeInTheDocument();
    expect(screen.getByText("4.0 TB")).toBeInTheDocument();
  });

  it("caps selection at 2: a 3rd checkbox is disabled until one is unchecked", async () => {
    const user = userEvent.setup();
    const snapshots = [
      makeSnapshot("1", "Snapshot 1", 1024),
      makeSnapshot("2", "Snapshot 2", 2048),
      makeSnapshot("3", "Snapshot 3", 3072),
    ];
    render(
      <SnapshotPanel
        snapshots={snapshots}
        live={live}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    expect(checkboxes[2]).toBeDisabled();

    await user.click(checkboxes[0]);
    expect(checkboxes[2]).toBeEnabled();
  });

  it("enables Compare selected only once at least one snapshot is checked, and opens the dialog on click", async () => {
    const user = userEvent.setup();
    const snapshots = [makeSnapshot("1", "Snapshot 1", 1024)];
    render(
      <SnapshotPanel
        snapshots={snapshots}
        live={live}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    const compareButton = screen.getByRole("button", {
      name: /compare selected/i,
    });
    expect(compareButton).toBeDisabled();

    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(compareButton).toBeEnabled();

    await user.click(compareButton);
    expect(screen.getByText("Compare Sizings")).toBeInTheDocument();
  });

  it("calls onDelete with the snapshot's id and removes it from the active selection", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const snapshots = [makeSnapshot("1", "Snapshot 1", 1024)];
    render(
      <SnapshotPanel
        snapshots={snapshots}
        live={live}
        onRename={() => {}}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(
      screen.getByRole("button", { name: /delete snapshot 1/i }),
    );

    expect(onDelete).toHaveBeenCalledWith("1");
    // Removing the only selected snapshot drops the selection count back to 0.
    expect(
      screen.getByRole("button", { name: /compare selected \(0\)/i }),
    ).toBeDisabled();
  });

  it("calls onRename as the label input is edited, using a stateful harness so multi-character typing works (ADR-0005)", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    function Harness() {
      const [snapshots, setSnapshots] = useState<Snapshot[]>([
        makeSnapshot("1", "Snapshot 1", 1024),
      ]);
      return (
        <SnapshotPanel
          snapshots={snapshots}
          live={live}
          onRename={(id, label) => {
            onRename(id, label);
            setSnapshots((prev) =>
              prev.map((s) => (s.id === id ? { ...s, label } : s)),
            );
          }}
          onDelete={() => {}}
        />
      );
    }

    render(<Harness />);
    const input = screen.getByDisplayValue("Snapshot 1");
    await user.clear(input);
    await user.type(input, "Baseline");

    expect(screen.getByDisplayValue("Baseline")).toBeInTheDocument();
    expect(onRename).toHaveBeenLastCalledWith("1", "Baseline");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/simple-mode/snapshot-panel.test.tsx`
Expected: FAIL — `Cannot find module './snapshot-panel'`

- [ ] **Step 3: Implement `SnapshotPanel`**

```tsx
// src/components/simple-mode/snapshot-panel.tsx
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CompareDialog } from "./compare-dialog";
import {
  getTotalRequiredStorageTB,
  type CompareEntry,
} from "@/lib/simple-mode/compare-sizings";
import type { Snapshot } from "@/types/simple-mode";

const MAX_COMPARE_SNAPSHOTS = 2;

interface SnapshotPanelProps {
  snapshots: Snapshot[];
  live: CompareEntry;
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}

export function SnapshotPanel({
  snapshots,
  live,
  onRename,
  onDelete,
}: SnapshotPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((existing) => existing !== id);
      if (prev.length >= MAX_COMPARE_SNAPSHOTS) return prev;
      return [...prev, id];
    });
  }

  function handleDelete(id: string) {
    setSelectedIds((prev) => prev.filter((existing) => existing !== id));
    onDelete(id);
  }

  const selectedSnapshots = snapshots.filter((snapshot) =>
    selectedIds.includes(snapshot.id),
  );
  const compareEntries: CompareEntry[] = [
    live,
    ...selectedSnapshots.map((snapshot) => ({
      label: snapshot.label,
      workloadData: snapshot.workloadData,
      repositoryConfig: snapshot.repositoryConfig,
      data: snapshot.data,
    })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saved Sizings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {snapshots.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No saved sizings yet. Use "Snapshot current sizing" above to hold
            one for comparison.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {snapshots.map((snapshot) => {
              const totalTB = getTotalRequiredStorageTB(snapshot.data);
              const isSelected = selectedIds.includes(snapshot.id);
              return (
                <li
                  key={snapshot.id}
                  className="border-border flex items-center gap-2 rounded-md border p-2"
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={
                      !isSelected && selectedIds.length >= MAX_COMPARE_SNAPSHOTS
                    }
                    onCheckedChange={() => toggleSelected(snapshot.id)}
                    aria-label={`Include ${snapshot.label} in comparison`}
                  />
                  <Input
                    value={snapshot.label}
                    onChange={(event) =>
                      onRename(snapshot.id, event.target.value)
                    }
                    className="h-8 flex-1"
                    aria-label={`Rename ${snapshot.label}`}
                  />
                  <span className="font-mono text-sm">
                    {totalTB === null ? "—" : `${totalTB.toFixed(1)} TB`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleDelete(snapshot.id)}
                    aria-label={`Delete ${snapshot.label}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <Button
          variant="secondary"
          disabled={selectedIds.length === 0}
          onClick={() => setIsCompareOpen(true)}
        >
          Compare selected ({selectedIds.length})
        </Button>
      </CardContent>
      <CompareDialog
        open={isCompareOpen}
        onOpenChange={setIsCompareOpen}
        entries={compareEntries}
      />
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/simple-mode/snapshot-panel.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/snapshot-panel.tsx src/components/simple-mode/snapshot-panel.test.tsx
git commit -m "feat: add SnapshotPanel with capped selection and compare trigger"
```

---

## Task 10: Wire snapshot state into `SimpleModePage`

**Files:**

- Modify: `src/components/simple-mode/simple-mode-page.tsx`
- Modify: `src/components/simple-mode/simple-mode-page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add these two tests **inside the existing `describe("SimpleModePage", ...)` block** (not as a new sibling `describe`) — they must run under that block's existing `beforeEach`/`afterEach`, which stub and clean up `fetch`. Nesting them there means the never-resolving fetch stub from `beforeEach` is already in place when the test starts; each test below simply calls `vi.stubGlobal("fetch", ...)` again with a real resolving mock, which overwrites the prior stub (no need to unstub first — `vi.stubGlobal` replacing the same key is safe, and the outer `afterEach`'s `vi.unstubAllGlobals()` still cleans up afterward). Add `import userEvent from "@testing-library/user-event";` at the top of the file if it isn't already imported (it likely already is, from the existing "threads live workloadData..." test), and change the `import { render, screen } from "@testing-library/react";` line to also bring in `within`.

Both tests scope their "18.4 TB" assertion to the snapshot's own row (via `within`), not a page-wide `getByText` — the live `StorageBreakdown` renders "18.4 TB" twice on its own (grand total + the single Performance tier row, matching this mock's one-volume shape — see `storage-breakdown.test.tsx`'s equivalent `getAllByText(...).toHaveLength(2)` case), so an unscoped `getByText("18.4 TB")` would match 3+ elements once the snapshot row exists and throw.

```tsx
it("creates a new snapshot labeled Snapshot 1 when Snapshot current sizing is clicked, once data has loaded", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            mode: "direct",
            data: {
              totalStorageTB: 18.4,
              workspaceGB: 0,
              performanceTierImmutabilityTaxGB: 0,
              capacityTierImmutabilityTaxGB: 0,
              repoCompute: {
                compute: {
                  cores: 4,
                  ram: 16,
                  volumes: [{ diskGB: 18841, diskPurpose: 3 }],
                },
              },
            },
          }),
        ),
      ),
    ),
  );

  render(<SimpleModePage />);

  const snapshotButton = await screen.findByRole("button", {
    name: /snapshot current sizing/i,
  });
  await vi.waitFor(() => expect(snapshotButton).toBeEnabled());
  await user.click(snapshotButton);

  const labelInput = screen.getByDisplayValue("Snapshot 1");
  const row = labelInput.closest("li");
  expect(row).not.toBeNull();
  expect(within(row!).getByText("18.4 TB")).toBeInTheDocument();
});

it("keeps a snapshot's stored values unchanged after the live form is edited further", async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            mode: "direct",
            data: {
              totalStorageTB: 18.4,
              workspaceGB: 0,
              performanceTierImmutabilityTaxGB: 0,
              capacityTierImmutabilityTaxGB: 0,
              repoCompute: {
                compute: {
                  cores: 4,
                  ram: 16,
                  volumes: [{ diskGB: 18841, diskPurpose: 3 }],
                },
              },
            },
          }),
        ),
      ),
    ),
  );

  render(<SimpleModePage />);

  const snapshotButton = await screen.findByRole("button", {
    name: /snapshot current sizing/i,
  });
  await vi.waitFor(() => expect(snapshotButton).toBeEnabled());
  await user.click(snapshotButton);

  const labelInput = screen.getByDisplayValue("Snapshot 1");
  const row = labelInput.closest("li");
  expect(row).not.toBeNull();
  expect(within(row!).getByText("18.4 TB")).toBeInTheDocument();

  const sourceSizeInput = screen.getByLabelText(/source data size/i);
  await user.clear(sourceSizeInput);
  await user.type(sourceSizeInput, "999");

  // The saved snapshot's own row must still read the value it was captured
  // with, unaffected by the live form's subsequent edit — proof that
  // setWorkloadData's new object doesn't retroactively change the
  // reference already stored on the snapshot.
  expect(within(row!).getByText("18.4 TB")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/simple-mode/simple-mode-page.test.tsx`
Expected: FAIL — no "Snapshot current sizing" click has any visible effect yet (no saved-sizings list rendered)

- [ ] **Step 3: Wire it up**

In `simple-mode-page.tsx`:

```tsx
import { useState } from "react";
import { WorkloadDataCard } from "./workload-data-card";
import { BackupRepositoryCard } from "./backup-repository-card";
import { ProjectedSizingCard } from "./projected-sizing-card";
import { SnapshotPanel } from "./snapshot-panel";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
  type Snapshot,
  type WorkloadDataValues,
} from "@/types/simple-mode";

export function SimpleModePage() {
  const [workloadData, setWorkloadData] = useState<WorkloadDataValues>(
    DEFAULT_WORKLOAD_DATA_VALUES,
  );
  const [repositoryConfig, setRepositoryConfig] =
    useState<RepositoryConfigValues>(DEFAULT_REPOSITORY_CONFIG_VALUES);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const { data, isLoading, error } = useCalculatedSizing(
    workloadData,
    repositoryConfig,
  );

  function handleSnapshot() {
    if (data === null) return;
    setSnapshots((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: `Snapshot ${prev.length + 1}`,
        workloadData,
        repositoryConfig,
        data,
      },
    ]);
  }

  function handleRenameSnapshot(id: string, label: string) {
    setSnapshots((prev) =>
      prev.map((snapshot) =>
        snapshot.id === id ? { ...snapshot, label } : snapshot,
      ),
    );
  }

  function handleDeleteSnapshot(id: string) {
    setSnapshots((prev) => prev.filter((snapshot) => snapshot.id !== id));
  }

  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 p-6 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-8">
        <WorkloadDataCard value={workloadData} onChange={setWorkloadData} />
        <BackupRepositoryCard
          value={repositoryConfig}
          workloadData={workloadData}
          onChange={setRepositoryConfig}
        />
      </div>
      <div className="flex flex-col gap-4 lg:col-span-4">
        <ProjectedSizingCard
          workloadData={workloadData}
          repositoryConfig={repositoryConfig}
          data={data}
          isLoading={isLoading}
          error={error}
          onChange={setWorkloadData}
          onSnapshot={handleSnapshot}
        />
        <SnapshotPanel
          snapshots={snapshots}
          live={{ label: "Live", workloadData, repositoryConfig, data }}
          onRename={handleRenameSnapshot}
          onDelete={handleDeleteSnapshot}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/simple-mode/simple-mode-page.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/simple-mode-page.tsx src/components/simple-mode/simple-mode-page.test.tsx
git commit -m "feat: wire SnapshotPanel and snapshot creation into SimpleModePage"
```

---

## Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, every suite (including `use-calculated-sizing.test.ts`, unaffected by this plan)

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc -b --noEmit && npm run build`
Expected: no errors, build succeeds

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, open the printed local URL, and in the browser:

1. Confirm "Snapshot current sizing" is disabled until the first calculation completes, then enables.
2. Click it — confirm a "Snapshot 1" row appears in the new "Saved Sizings" panel with a headline TB figure.
3. Edit a Workload Data field (e.g. Source Size), wait for the live figure to update, then click "Snapshot current sizing" again — confirm "Snapshot 2" appears with a different total, and "Snapshot 1"'s total is unchanged.
4. Check both snapshots' checkboxes — confirm "Compare selected (2)" is enabled, and a third checkbox (if a third snapshot exists) is disabled.
5. Click "Compare selected" — confirm the modal opens with 3 columns (Live, Snapshot 1, Snapshot 2), the sizing table renders with plausible values, and both "Workload Data" and "Repository Configuration" sections render collapsed.
6. Expand both sections — confirm rows render with the expected inputs/config, including at least one N/A ("—") cell if the two snapshots differ in mode or SOBR-tier configuration.
7. Close the modal, delete a snapshot — confirm it disappears from the list and (if it was selected) the compare button's count decrements.
8. Toggle to Copy mode in Backup Repository Configuration, snapshot again, and re-open Compare — confirm Secondary rows appear only for the Copy-mode entries.

- [ ] **Step 5: Report results**

If every check in Step 4 passes, the feature is complete and ready for `superpowers:requesting-code-review`. If any check fails, treat it as a bug against the relevant task above (most likely Task 3, 5, 8, or 9) rather than patching ad hoc — use `superpowers:systematic-debugging` if the cause isn't immediately obvious from the failing step.

---

## Self-Review

**Spec coverage:**

- N snapshots stored, 3-way compare cap → Task 9 (`MAX_COMPARE_SNAPSHOTS = 2`, unbounded `snapshots` list)
- Frozen `{workloadData, repositoryConfig, data}` per snapshot → Task 1 (`Snapshot` type), Task 10 (`handleSnapshot`)
- "Snapshot current sizing" button, disabled on loading/error/no-data → Task 7
- Saved list: label, rename, headline total, delete → Task 9
- Full-parity sizing comparison (Total, Primary/Secondary tiers, Compute, Bandwidth) → Tasks 3, 8
- Workload Data collapsible section, collapsed by default → Tasks 4, 8
- Repository Configuration collapsible section, collapsed by default, conditional applicability → Tasks 5, 8
- Non-goals (no persistence, no delta highlighting, no restore-to-live, immutable snapshots) → no tasks implement these, correctly
- Testing section's specific behaviors (frozen-value non-reference, button disabling, checkbox cap, mixed-mode row rendering, collapsed-by-default, delete clears selection) → covered across Tasks 7, 9, 10

**Placeholder scan:** no TBD/TODO; every code step has complete, runnable code; every test has real assertions.

**Type consistency:** `Snapshot` (Task 1) → consumed identically in Task 9 (`SnapshotPanel` props), Task 10 (`handleSnapshot`/`handleRenameSnapshot`/`handleDeleteSnapshot`). `CompareEntry`/`ComparisonRow` (Task 3) → consumed identically in Task 8 (`CompareDialog`) and Task 9 (`SnapshotPanel`'s `live` prop and `compareEntries` construction). `SizerResult` (not `SizingResult`, correcting the spec's naming) used consistently from Task 3 onward. `formatThroughputMbps` (Task 2) is the single source of the MBps→Mbps conversion, used in both `network-bandwidth.tsx` and `compare-sizings.ts`.

**Human review pass (post-self-review):** four issues found and fixed —

1. **Blocking:** `formatCapacityTier` (Task 5) collapsed independent `copyPolicy`/`movePolicy` booleans into a single ternary, silently dropping "Move" whenever both are true — which is the _default_ config (`DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier` ships with both `true`), not a rare edge case. Fixed with `formatCapacityTierPolicy` covering all 4 combinations, tested explicitly (Task 5's new "names Copy Policy and Move Policy independently" test).
2. **Blocking:** Task 5 had no test for Secondary-row omission in a direct-mode-only comparison, unlike Task 3's equivalent sizing-table coverage. Added ("omits every Secondary row entirely for a direct-mode-only comparison").
3. **Non-blocking, documented:** Task 3's "Initial Full / Restore" figure is derived from `workloadData` alone, so Primary and Secondary rows show the identical number for a copy-mode entry — matches existing `projected-sizing-card.tsx` behavior, not a regression, but easy to mistake for a bug later. Added an inline comment on `getEntryInitialFullRestore` warning against "fixing" it without a separate design decision.
4. **Minor:** `ComparisonTable` (Task 8) keyed cells and column headers on `entry.label`/`` `${row.label}-${entries[index].label}` ``, which collides once Task 9 makes labels user-renameable and two entries share a name. Switched both to index-based keys, with a comment explaining why.

Also updated the design spec (`2026-07-29-in-session-compare-design.md`) to state the Snapshot button's disable condition precisely (`isLoading || error !== null || data === null`, not just the first two) — Task 7's implementation was already correct; the spec's wording was the thing lagging behind.
