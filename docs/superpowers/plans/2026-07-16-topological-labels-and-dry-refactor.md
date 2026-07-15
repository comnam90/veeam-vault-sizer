# Topological Labels + Projected Sizing Canvas DRY Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the copy-mode canvas's geographic site titles/single-badge with topological role titles ("Primary Repository" / "Secondary Repository") and per-tier technology labels (ADR-0021); make `SiteSizingSection` the one rendering engine for both Direct and Copy modes, deleting the duplicate flat-layout JSX; extract the repeated target/SOBR routing ternary into `buildTargetInputs`; close the copy-mode test gap in the client and hook test files.

**Spec:** `docs/superpowers/specs/2026-07-16-topological-labels-and-dry-refactor-design.md` (decisions D11–D16, supersedes D5/D8 from the prior spec). Related: ADR-0021.

**Tech Stack:** Vite + React + TypeScript, Tailwind v4, Vitest, Cloudflare Pages Functions (edge).

**Branch:** Work continues on `frontend-integration-sizing-canvas`.

**Follows on from:** `2026-07-15-backup-copy-dual-pipeline-and-canvas-cleanup.md` (PR #9, merged into this branch already).

---

## File Structure

| File                                                   | Responsibility                                  | Change                                                    |
| ------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------- |
| `src/lib/simple-mode/build-vm-agent-request.ts`        | Map form state → `VmAgentInputs`                | Extract `buildTargetInputs`, use in both entry points     |
| `src/lib/api/vault-sizer-client.test.ts`               | Client tests                                    | Add copy-mode test                                        |
| `src/hooks/use-calculated-sizing.test.ts`              | Hook tests                                      | Add copy-mode test                                        |
| `src/lib/simple-mode/storage-tiers.ts`                 | Tier-row/summation math + tier-label derivation | Add `TierLabels` type + `getTargetTierLabels`             |
| `src/components/simple-mode/storage-breakdown.tsx`     | Render one site's tier bars                     | Accept optional `tierLabels` prop                         |
| `src/components/simple-mode/site-sizing-section.tsx`   | One site's full section                         | `data` nullable; `badge` → `tierLabels`                   |
| `src/components/simple-mode/projected-sizing-card.tsx` | Right-hand canvas wrapper                       | Unify Direct into `SiteSizingSection`; new titles/subline |

**Commands:** single file → `npx vitest run <path>`; full suite → `npm run test:run`; typecheck+build → `npm run build`; lint → `npm run lint`.

**Per-task verification (applies to every task):** after the targeted single-file run passes, also run the **full suite** (`npm run test:run`) before committing — several tasks touch shared modules whose regression coverage lives in other test files.

**Every commit ends with the trailer** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Commit subjects follow conventional-commit format (`feat:`/`refactor:`/`test:`) and body lines stay ≤100 chars (a commit-msg hook enforces this).

---

## Task 1: Extract `buildTargetInputs` in the request builder

**Files:**

- Modify: `src/lib/simple-mode/build-vm-agent-request.ts`

Pure refactor (D15) — output is byte-identical for every input. No new tests: the existing direct-mode suite (`build-vm-agent-request.test.ts`, all cases) and copy-mode suite (`buildCopyVmAgentRequests` describe block, same file) already exercise every branch this routes through, so they're the regression guard.

- [ ] **Step 1: Add `buildTargetInputs` and rewire both call sites**

In `src/lib/simple-mode/build-vm-agent-request.ts`, add this function directly above `buildVmAgentRequest`:

```ts
// Shared target/SOBR routing — both buildVmAgentRequest's target dispatch and
// buildCopyVmAgentRequests's Secondary allocation use this (D15).
function buildTargetInputs(
  base: VmAgentInputs,
  targetRepository: TargetRepository,
  immutableDays: string,
  sobr: RepositoryConfigValues["sobr"],
): VmAgentInputs {
  return targetRepository !== "sobr"
    ? buildStandaloneRepoInputs(base, targetRepository, immutableDays)
    : buildSobrInputs(base, sobr);
}
```

Add `TargetRepository` to the type import from `@/types/simple-mode` (alongside the existing `RepositoryConfigValues`, `RepoType`, `WorkloadDataValues`).

Replace `buildVmAgentRequest`'s body (the `if (repositoryConfig.targetRepository !== "sobr") { ... } return buildSobrInputs(...)` block) with:

```ts
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

  return buildTargetInputs(
    base,
    repositoryConfig.targetRepository,
    repositoryConfig.targetRepositoryImmutableDays,
    repositoryConfig.sobr,
  );
}
```

Replace `buildCopyVmAgentRequests`'s Secondary allocation (the `const secondary = repositoryConfig.targetRepository !== "sobr" ? ... : ...` block) with:

```ts
const secondary = buildTargetInputs(
  secondaryBase,
  repositoryConfig.targetRepository,
  repositoryConfig.targetRepositoryImmutableDays,
  repositoryConfig.sobr,
);
```

`buildStandaloneRepoInputs` and `buildSobrInputs` stay module-private and unchanged.

- [ ] **Step 2: Run the full builder test file to verify all pass unchanged**

Run: `npx vitest run src/lib/simple-mode/build-vm-agent-request.test.ts`
Expected: PASS — every existing direct-mode and copy-mode case, unmodified, still passes (output is identical; only the internal routing moved).

Then run the full suite: `npm run test:run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/simple-mode/build-vm-agent-request.ts
git commit -m "refactor: extract buildTargetInputs to dedupe target/SOBR routing" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Close the copy-mode test gap in the client and hook

**Files:**

- Modify: `src/lib/api/vault-sizer-client.test.ts`
- Modify: `src/hooks/use-calculated-sizing.test.ts`

Both files currently only ever mock `mode: "direct"` responses (D16). Add one copy-mode case to each — pure test additions, no production code changes.

- [ ] **Step 1: Add the copy-mode test to `vault-sizer-client.test.ts`**

Add this `it` block inside the existing `describe("callVaultSizerApi", ...)`, after the "POSTs workloadData..." test:

```ts
it("returns the copy-mode primary/secondary data unmutated", async () => {
  const primaryData: CVmAgentReturnObject = {
    ...mockData,
    totalStorageTB: 24,
  };
  const secondaryData: CVmAgentReturnObject = {
    ...mockData,
    totalStorageTB: 18.4,
  };
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        mode: "copy",
        primary: primaryData,
        secondary: secondaryData,
      }),
      { status: 200 },
    ),
  );

  const result = await callVaultSizerApi(DEFAULT_WORKLOAD_DATA_VALUES, {
    ...DEFAULT_REPOSITORY_CONFIG_VALUES,
    backupPath: "copy",
  });

  expect(result).toEqual({
    mode: "copy",
    primary: primaryData,
    secondary: secondaryData,
  });
});
```

- [ ] **Step 2: Add the copy-mode test to `use-calculated-sizing.test.ts`**

Add this `it` block inside the existing `describe("useCalculatedSizing", ...)`, after the "fires immediately on mount..." test:

```ts
it("settles a copy-mode payload into state, with loading/error behaving like direct mode", async () => {
  const primaryData: CVmAgentReturnObject = {
    ...mockData,
    totalStorageTB: 24,
  };
  const secondaryData: CVmAgentReturnObject = {
    ...mockData,
    totalStorageTB: 18.4,
  };
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse({
      success: true,
      mode: "copy",
      primary: primaryData,
      secondary: secondaryData,
    }),
  );

  const { result } = renderHook(() =>
    useCalculatedSizing(DEFAULT_WORKLOAD_DATA_VALUES, {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
    }),
  );

  await vi.waitFor(() =>
    expect(result.current.data).toEqual({
      mode: "copy",
      primary: primaryData,
      secondary: secondaryData,
    }),
  );
  expect(result.current.isLoading).toBe(false);
  expect(result.current.error).toBeNull();
});
```

- [ ] **Step 3: Run both test files to verify they pass**

Run: `npx vitest run src/lib/api/vault-sizer-client.test.ts src/hooks/use-calculated-sizing.test.ts`
Expected: PASS — both new copy-mode cases pass against the existing (unchanged) client/hook implementation.

Then run the full suite: `npm run test:run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/vault-sizer-client.test.ts src/hooks/use-calculated-sizing.test.ts
git commit -m "test: cover copy-mode responses in the sizer client and hook" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `getTargetTierLabels` + `TierLabels` type in `storage-tiers.ts`

**Files:**

- Modify: `src/lib/simple-mode/storage-tiers.ts`
- Modify: `src/lib/simple-mode/storage-tiers.test.ts`

New pure function deriving per-tier technology labels from a target/SOBR config (D12) — the same dispatch Direct mode's single target and Copy mode's Secondary already share.

- [ ] **Step 1: Write the failing tests**

In `src/lib/simple-mode/storage-tiers.test.ts`, change the first import line from:

```ts
import { getTierStorageRows, getTotalStorageGB } from "./storage-tiers";
```

to:

```ts
import {
  getTargetTierLabels,
  getTierStorageRows,
  getTotalStorageGB,
} from "./storage-tiers";
```

and add a new import line for the default config fixture:

```ts
import { DEFAULT_REPOSITORY_CONFIG_VALUES } from "@/types/simple-mode";
```

Then add this `describe` block at the end of the file:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/simple-mode/storage-tiers.test.ts`
Expected: FAIL — `getTargetTierLabels` is not exported / not a function.

- [ ] **Step 3: Add `TierLabels` and `getTargetTierLabels` to `storage-tiers.ts`**

Change the top-of-file import to also pull in the repo-type helpers and target config types:

```ts
import {
  REPO_TYPE_LABEL,
  type RepositoryConfigValues,
  type TargetRepository,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject, Volume } from "@/types/vault-sizer-api";
```

Add this at the end of the file:

```ts
export type TierLabels = Partial<Record<TierStorageRow["key"], string>>;

// Shared by Direct mode's single target and Copy mode's Secondary — both
// dispatch on the same targetRepository/sobr shape (D12). Archive Tier never
// gets a label: ArchiveTierConfig has no user-selectable RepoType.
export function getTargetTierLabels(
  targetRepository: TargetRepository,
  sobr: RepositoryConfigValues["sobr"],
): TierLabels {
  if (targetRepository !== "sobr") {
    return { performance: REPO_TYPE_LABEL[targetRepository] };
  }

  const labels: TierLabels = {
    performance: REPO_TYPE_LABEL[sobr.performanceType],
  };
  if (sobr.capacityTier.enabled) {
    labels.capacity = REPO_TYPE_LABEL[sobr.capacityTier.type];
  }
  return labels;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/simple-mode/storage-tiers.test.ts`
Expected: PASS.

Then run the full suite: `npm run test:run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/storage-tiers.ts src/lib/simple-mode/storage-tiers.test.ts
git commit -m "feat: add getTargetTierLabels for per-tier technology labels" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `StorageBreakdown` accepts an optional `tierLabels` prop

**Files:**

- Modify: `src/components/simple-mode/storage-breakdown.tsx`
- Modify: `src/components/simple-mode/storage-breakdown.test.tsx`

When present, each tier row's label gets a `" — "` suffix from the matching `tierLabels` entry (D11); omitted (or missing a key) falls back to the bare tier label — fully backward compatible with every existing caller/test.

- [ ] **Step 1: Write the failing test**

Add this `it` block inside `describe("StorageBreakdown", ...)` in `storage-breakdown.test.tsx`, before its closing `});`:

```ts
  it("appends a technology label to a tier row when tierLabels is passed, one row at a time", () => {
    const data = makeData([
      { diskGB: 2048, diskPurpose: 3 },
      { diskGB: 4096, diskPurpose: 13 },
    ]);
    render(
      <StorageBreakdown
        data={data}
        tierLabels={{ performance: "Vault Azure", capacity: "Vault AWS" }}
      />,
    );

    expect(screen.getByText("Performance — Vault Azure")).toBeInTheDocument();
    expect(screen.getByText("Capacity — Vault AWS")).toBeInTheDocument();
  });

  it("falls back to the bare tier label when tierLabels is omitted", () => {
    const data = makeData([{ diskGB: 2048, diskPurpose: 3 }]);
    render(<StorageBreakdown data={data} />);

    expect(screen.getByText("Performance")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/simple-mode/storage-breakdown.test.tsx`
Expected: FAIL — `tierLabels` prop doesn't exist yet; the labeled-row assertions don't find matching text.

- [ ] **Step 3: Add the `tierLabels` prop**

In `src/components/simple-mode/storage-breakdown.tsx`, update the import and props:

```tsx
import { Progress } from "@/components/ui/progress";
import {
  getTierStorageRows,
  getTotalStorageGB,
  type TierLabels,
} from "@/lib/simple-mode/storage-tiers";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

interface StorageBreakdownProps {
  data: CVmAgentReturnObject | null;
  tierLabels?: TierLabels;
}

export function StorageBreakdown({ data, tierLabels }: StorageBreakdownProps) {
```

Change the tier row's label rendering from `<span>{tier.label}</span>` to:

```tsx
<span>
  {tierLabels?.[tier.key]
    ? `${tier.label} — ${tierLabels[tier.key]}`
    : tier.label}
</span>
```

- [ ] **Step 4: Run the full test file to verify all pass**

Run: `npx vitest run src/components/simple-mode/storage-breakdown.test.tsx`
Expected: PASS — existing tests (no `tierLabels` passed, unchanged rendering) plus both new cases.

Then run the full suite: `npm run test:run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/storage-breakdown.tsx src/components/simple-mode/storage-breakdown.test.tsx
git commit -m "feat: StorageBreakdown appends per-tier technology labels" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `SiteSizingSection` + `ProjectedSizingCard` — nullable data, topological titles, unified layout

**Files:**

- Modify: `src/components/simple-mode/site-sizing-section.tsx`
- Modify: `src/components/simple-mode/site-sizing-section.test.tsx` (full rewrite below)
- Modify: `src/components/simple-mode/projected-sizing-card.tsx` (full rewrite below)
- Modify: `src/components/simple-mode/projected-sizing-card.test.tsx`

**This task is one atomic change, not two.** `SiteSizingSection`'s interface change (`data` nullable, `badge` → `tierLabels`) and `ProjectedSizingCard` — its only caller — becoming the universal engine are inseparable: `SiteSizingSection` dropping `badge`/requiring `tierLabels` is a `tsc` error in its only caller until that caller is rewritten to match, and there is no intermediate state where both the full suite and `npm run build` are green. Do both steps below before running any verification, so every verification command in this task runs against the finished state.

`data` becomes `CVmAgentReturnObject | null` (Direct mode has no data until the first response lands — D13); `badge: string` is replaced by `tierLabels: TierLabels`, passed through to `StorageBreakdown`. Direct mode collapses to one `SiteSizingSection`, deleting the duplicate flat-layout JSX (D13). Both modes get topological titles (D11). The combined-header subline drops geographic wording and derives its second figure from the already-rounded headline/primary figures so the two numbers always sum consistently — this makes headline and subline internally consistent; it does not make the subline's "Secondary" figure agree with that section's own independently-rounded `StorageBreakdown` total in every case, which can still differ by up to 0.1 TB at a rounding boundary (D14).

- [ ] **Step 1: Write the failing test (full rewrite)**

Replace the entire contents of `src/components/simple-mode/site-sizing-section.test.tsx` with:

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
  it("renders the title, per-tier label, proxy compute, and nightly bandwidth", () => {
    render(
      <SiteSizingSection
        title="Primary Repository"
        tierLabels={{ performance: "Hardened Repository" }}
        data={siteData}
        initialFullRestore={{ inboundMBps: 200, outboundMBps: 100 }}
      />,
    );

    expect(screen.getByText("Primary Repository")).toBeInTheDocument();
    expect(
      screen.getByText("Performance — Hardened Repository"),
    ).toBeInTheDocument();

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

  it("renders the placeholder state without throwing when data is null", () => {
    render(
      <SiteSizingSection
        title="Primary Repository"
        tierLabels={{ performance: "Vault Azure" }}
        data={null}
        initialFullRestore={null}
      />,
    );

    expect(screen.getByText("Primary Repository")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/Performance/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Update `projected-sizing-card.test.tsx`'s assertions**

Change the copy-mode test's assertions (in `"renders the split canvas with a combined total and both site sections in copy mode"`):

Replace:

```ts
expect(
  screen.getByText("Primary — On-Premises Landing Zone"),
).toBeInTheDocument();
expect(screen.getByText("Secondary — Offsite Cloud Vault")).toBeInTheDocument();
// Default copy config: primary hardened-repository, secondary vault-azure.
expect(screen.getByText("Hardened Repository")).toBeInTheDocument();
expect(screen.getByText("Vault Azure")).toBeInTheDocument();
```

with:

```ts
expect(screen.getByText("Primary Repository")).toBeInTheDocument();
expect(screen.getByText("Secondary Repository")).toBeInTheDocument();
// Default copy config: primary hardened-repository, secondary vault-azure,
// both on the Performance tier (the only tier either side has enabled).
expect(
  screen.getByText("Performance — Hardened Repository"),
).toBeInTheDocument();
expect(screen.getByText("Performance — Vault Azure")).toBeInTheDocument();
// Subline: primary 24576 GB / 1024 = 24.0 TB; secondary is the residual
// from the rounded combined/primary figures (D14), not its own rounding.
expect(
  screen.getByText("Primary 24.0 TB + Secondary 18.4 TB"),
).toBeInTheDocument();
```

Add this `it` block after the copy-mode test, to cover Direct mode's new title:

```ts
  it("titles the direct-mode section Primary Repository with its target's tier label", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, mode: "direct", data: mockData }),
    );

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        onChange={() => {}}
      />,
    );

    await vi.waitFor(() =>
      expect(screen.getByText("Primary Repository")).toBeInTheDocument(),
    );
    // DEFAULT_REPOSITORY_CONFIG_VALUES.targetRepository is "vault-azure".
    expect(screen.getByText("Performance — Vault Azure")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run both test files to confirm they fail against the current implementation**

Run: `npx vitest run src/components/simple-mode/site-sizing-section.test.tsx src/components/simple-mode/projected-sizing-card.test.tsx`
Expected: FAIL — `SiteSizingSection` still requires a `badge` prop and a non-null `data` (the null-data case throws on `data.proxyCompute`); `ProjectedSizingCard` still renders the old geographic titles/flat layout and the old badge-based assertions no longer match.

- [ ] **Step 4: Rewrite `site-sizing-section.tsx`**

Replace the entire contents of `src/components/simple-mode/site-sizing-section.tsx` with:

```tsx
import { StorageBreakdown } from "./storage-breakdown";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import { NetworkBandwidth } from "./network-bandwidth";
import type { TierLabels } from "@/lib/simple-mode/storage-tiers";
import type { CVmAgentReturnObject, Throughput } from "@/types/vault-sizer-api";

interface SiteSizingSectionProps {
  title: string;
  tierLabels: TierLabels;
  data: CVmAgentReturnObject | null;
  initialFullRestore: Throughput | null;
}

export function SiteSizingSection({
  title,
  tierLabels,
  data,
  initialFullRestore,
}: SiteSizingSectionProps) {
  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <StorageBreakdown data={data} tierLabels={tierLabels} />
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Proxy Compute
        </p>
        <InfrastructureTelemetry compute={data?.proxyCompute?.compute} />
        <NetworkBandwidth
          nightlyIncremental={data?.proxyCompute?.compute?.networkThroughput}
          initialFullRestore={initialFullRestore}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `projected-sizing-card.tsx`**

Replace the entire contents of `src/components/simple-mode/projected-sizing-card.tsx` with:

```tsx
import { LoaderCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
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

  // Shared by Direct mode's single target and Copy mode's Secondary — both
  // dispatch on the same targetRepository/sobr shape.
  const targetTierLabels = getTargetTierLabels(
    repositoryConfig.targetRepository,
    repositoryConfig.sobr,
  );

  // Rounded once here so the headline and subline always sum consistently
  // (D14) — the subline's second figure is a residual, not its own rounding.
  let combinedTBDisplay = "";
  let primaryTBDisplay = "";
  let secondaryTBDisplay = "";
  if (copyData) {
    const combinedTB =
      (getTotalStorageGB(copyData.primary) +
        getTotalStorageGB(copyData.secondary)) /
      1024;
    const primaryTB = getTotalStorageGB(copyData.primary) / 1024;
    combinedTBDisplay = combinedTB.toFixed(1);
    primaryTBDisplay = primaryTB.toFixed(1);
    secondaryTBDisplay = (
      Number(combinedTBDisplay) - Number(primaryTBDisplay)
    ).toFixed(1);
  }

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
                {combinedTBDisplay} TB
              </p>
              <p className="text-muted-foreground text-xs">
                Primary {primaryTBDisplay} TB{" + "}
                Secondary {secondaryTBDisplay} TB
              </p>
            </div>
            <SiteSizingSection
              title="Primary Repository"
              tierLabels={{
                performance: REPO_TYPE_LABEL[repositoryConfig.primary.repoType],
              }}
              data={copyData.primary}
              initialFullRestore={initialFullRestore}
            />
            <SiteSizingSection
              title="Secondary Repository"
              tierLabels={targetTierLabels}
              data={copyData.secondary}
              initialFullRestore={initialFullRestore}
            />
          </>
        ) : (
          <SiteSizingSection
            title="Primary Repository"
            tierLabels={targetTierLabels}
            data={directData}
            initialFullRestore={initialFullRestore}
          />
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

- [ ] **Step 6: Run both test files to verify they pass**

Run: `npx vitest run src/components/simple-mode/site-sizing-section.test.tsx src/components/simple-mode/projected-sizing-card.test.tsx`
Expected: PASS — `SiteSizingSection`'s two cases (with data, with null data) and `ProjectedSizingCard`'s full set (title/layout assertions updated in Step 2, the updated copy-mode test, and the new direct-mode title test).

- [ ] **Step 7: Full verification**

Run: `npm run test:run`
Expected: PASS — entire suite.

Run: `npm run build`
Expected: PASS — typecheck + build (this is the check that would have caught a `badge`/`tierLabels` mismatch had the two files been split across separate commits).

Run: `npm run lint`
Expected: PASS — no lint errors (in particular, no unused imports left in `projected-sizing-card.tsx` from the deleted flat-layout branch — `StorageBreakdown`, `InfrastructureTelemetry`, and `NetworkBandwidth` are no longer imported directly here).

- [ ] **Step 8: Commit**

```bash
git add src/components/simple-mode/site-sizing-section.tsx src/components/simple-mode/site-sizing-section.test.tsx src/components/simple-mode/projected-sizing-card.tsx src/components/simple-mode/projected-sizing-card.test.tsx
git commit -m "feat: unify Projected Sizing canvas on SiteSizingSection, drop geographic titles" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification

After Task 5, run the app (`npm run dev`, which starts `wrangler pages dev` — hit the printed `:8788` URL, not a bare Vite `:5173` dev server, since the BFF function needs the Workers runtime) and:

1. **Direct to Vault**, Vault Azure target: confirm the single section is titled "Primary Repository" and its Performance row reads "Performance — Vault Azure".
2. Switch to **Backup Copy to Vault**: confirm the combined header reads "Combined Required Storage" with a "Primary X TB + Secondary Y TB" subline (no "On-Premises"/"Offsite" wording anywhere), and the two sections are titled "Primary Repository" / "Secondary Repository" with per-tier labels instead of a single badge.
3. Enable **SOBR** as the target with Capacity Tier on: confirm the Secondary (or Direct) section shows both "Performance — {type}" and "Capacity — {type}" rows, and that Archive Tier (if also enabled) renders as bare "Archive" with no suffix.
4. Confirm the initial page load (before the first response settles) renders the "Primary Repository" section with `StorageBreakdown`'s "—" placeholder, not a crash — this is the null-safety fix from Task 5.
