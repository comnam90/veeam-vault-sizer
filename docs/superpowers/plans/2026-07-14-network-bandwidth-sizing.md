# Network Bandwidth Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a locally-computed "Initial Full / Restore" network bandwidth figure alongside the existing vendor-sourced "Nightly Incremental" one, in a new dedicated UI section, since the official calculator API has no concept of the former at all.

**Architecture:** A new pure function (`calculateInitialFullBandwidth`) derives the initial-full/restore bandwidth pair client-side from `sourceSizeTB`/`dataReductionPercent`, mirroring the same formula shape already used by the vendor API for the nightly-incremental figure but against a fixed 24h window instead of 8h. Both fixed window constants move into one shared module. A new `NetworkBandwidth` component renders both figures; `InfrastructureTelemetry` sheds its throughput row to make room for it.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library — matches the existing `src/components/simple-mode/` and `src/lib/simple-mode/` conventions.

**Spec:** `docs/superpowers/specs/2026-07-14-network-bandwidth-sizing-design.md`

---

## File Structure

- Create `src/lib/simple-mode/backup-windows.ts` — the two fixed window constants (relocates the existing `BACKUP_WINDOW_HOURS`, adds `FULL_BACKUP_WINDOW_HOURS`).
- Modify `src/lib/simple-mode/build-vm-agent-request.ts` — import `BACKUP_WINDOW_HOURS` instead of declaring it locally.
- Create `src/lib/simple-mode/calculate-initial-full-bandwidth.ts` + `.test.ts` — the new pure calculation.
- Create `src/components/simple-mode/network-bandwidth.tsx` + `.test.tsx` — the new UI section (also absorbs `formatThroughput`).
- Modify `src/components/simple-mode/infrastructure-telemetry.tsx` + `.test.tsx` — drops the Network Throughput row.
- Modify `src/components/simple-mode/projected-sizing-card.tsx` + `.test.tsx` — wires `NetworkBandwidth` in.

---

### Task 1: Extract backup-window constants into a shared module

**Files:**

- Create: `src/lib/simple-mode/backup-windows.ts`
- Modify: `src/lib/simple-mode/build-vm-agent-request.ts:1-13`

- [ ] **Step 1: Create the shared constants module**

```ts
// src/lib/simple-mode/backup-windows.ts
// Fixed sizing assumptions with no corresponding UI field yet.
export const BACKUP_WINDOW_HOURS = 8; // nightly incremental proxy throughput
export const FULL_BACKUP_WINDOW_HOURS = 24; // initial full backup / full restore bandwidth
```

- [ ] **Step 2: Point `build-vm-agent-request.ts` at the shared constant**

Replace the top of `src/lib/simple-mode/build-vm-agent-request.ts` (currently):

```ts
import {
  BLOCK_GENERATION_DAYS,
  REPO_TYPE_CATEGORY,
  repoTypeRequiresImmutability,
  repoTypeSupportsBlockCloning,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { VmAgentInputs } from "@/types/vault-sizer-api";
import { capGfsToForecastHorizon } from "./cap-gfs-to-forecast-horizon";

// Fixed sizing assumptions with no corresponding UI field yet.
const BACKUP_WINDOW_HOURS = 8;
```

with:

```ts
import {
  BLOCK_GENERATION_DAYS,
  REPO_TYPE_CATEGORY,
  repoTypeRequiresImmutability,
  repoTypeSupportsBlockCloning,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { VmAgentInputs } from "@/types/vault-sizer-api";
import { BACKUP_WINDOW_HOURS } from "./backup-windows";
import { capGfsToForecastHorizon } from "./cap-gfs-to-forecast-horizon";
```

The rest of the file (including `backupWindowHours: BACKUP_WINDOW_HOURS,` further down) is unchanged — same identifier, now imported instead of declared locally.

- [ ] **Step 3: Run the existing test suite to confirm no regression**

Run: `npm run test:run -- build-vm-agent-request`
Expected: PASS, including the existing `expect(result.backupWindowHours).toBe(8);` assertion.

- [ ] **Step 4: Commit**

```bash
git add src/lib/simple-mode/backup-windows.ts src/lib/simple-mode/build-vm-agent-request.ts
git commit -m "refactor: extract backup window constants into shared backup-windows module"
```

---

### Task 2: `calculateInitialFullBandwidth` pure function

**Files:**

- Create: `src/lib/simple-mode/calculate-initial-full-bandwidth.ts`
- Test: `src/lib/simple-mode/calculate-initial-full-bandwidth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/simple-mode/calculate-initial-full-bandwidth.test.ts
import { describe, expect, it } from "vitest";
import { calculateInitialFullBandwidth } from "./calculate-initial-full-bandwidth";

describe("calculateInitialFullBandwidth", () => {
  it("computes inbound/outbound MBps for a 10TB source at 50% reduction over the 24h window", () => {
    const result = calculateInitialFullBandwidth("10", "50");

    expect(result).not.toBeNull();
    expect(result?.inboundMBps).toBeCloseTo(121.36296, 4);
    expect(result?.outboundMBps).toBeCloseTo(60.68148, 4);
  });

  it("outbound equals inbound at 0% reduction (no dedup)", () => {
    const result = calculateInitialFullBandwidth("10", "0");

    expect(result?.inboundMBps).toBeCloseTo(121.36296, 4);
    expect(result?.outboundMBps).toBeCloseTo(121.36296, 4);
  });

  it("outbound is 0 at 100% reduction", () => {
    const result = calculateInitialFullBandwidth("10", "100");

    expect(result?.outboundMBps).toBe(0);
  });

  it("returns null for an empty sourceSizeTB", () => {
    expect(calculateInitialFullBandwidth("", "50")).toBeNull();
  });

  it("returns null for a non-numeric sourceSizeTB", () => {
    expect(calculateInitialFullBandwidth("abc", "50")).toBeNull();
  });

  it("returns null for a zero or negative sourceSizeTB", () => {
    expect(calculateInitialFullBandwidth("0", "50")).toBeNull();
    expect(calculateInitialFullBandwidth("-5", "50")).toBeNull();
  });

  it("returns null for a non-numeric dataReductionPercent", () => {
    expect(calculateInitialFullBandwidth("10", "abc")).toBeNull();
  });

  it("returns null for a dataReductionPercent out of the 0-100 range", () => {
    expect(calculateInitialFullBandwidth("10", "-1")).toBeNull();
    expect(calculateInitialFullBandwidth("10", "101")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- calculate-initial-full-bandwidth`
Expected: FAIL — `Cannot find module './calculate-initial-full-bandwidth'` (or equivalent module-not-found error).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/simple-mode/calculate-initial-full-bandwidth.ts
import type { Throughput } from "@/types/vault-sizer-api";
import { FULL_BACKUP_WINDOW_HOURS } from "./backup-windows";

/**
 * Bandwidth needed to move the entire source dataset within the fixed
 * FULL_BACKUP_WINDOW_HOURS window — sizes both the initial full backup and,
 * with inbound/outbound reversed, a full machine restore. Mirrors the
 * vendor API's own nightly-incremental formula (sourceTB × changeRate% ÷
 * BACKUP_WINDOW_HOURS), just against the whole sourceTB and a 24h window
 * instead of a daily delta and an 8h window — the vendor API has no
 * equivalent field for this scenario, so it's derived locally.
 */
export function calculateInitialFullBandwidth(
  sourceSizeTB: string,
  dataReductionPercent: string,
): Throughput | null {
  const sourceTB = Number(sourceSizeTB);
  const reduction = Number(dataReductionPercent);

  if (!Number.isFinite(sourceTB) || sourceTB <= 0) return null;
  if (!Number.isFinite(reduction) || reduction < 0 || reduction > 100) {
    return null;
  }

  const inboundMBps =
    (sourceTB * 1_048_576) / (FULL_BACKUP_WINDOW_HOURS * 3600);
  return { inboundMBps, outboundMBps: inboundMBps * (1 - reduction / 100) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- calculate-initial-full-bandwidth`
Expected: PASS, all 8 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/calculate-initial-full-bandwidth.ts src/lib/simple-mode/calculate-initial-full-bandwidth.test.ts
git commit -m "feat: add calculateInitialFullBandwidth for initial full/restore sizing"
```

---

### Task 3: `NetworkBandwidth` component

**Files:**

- Create: `src/components/simple-mode/network-bandwidth.tsx`
- Test: `src/components/simple-mode/network-bandwidth.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/simple-mode/network-bandwidth.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetworkBandwidth } from "./network-bandwidth";

describe("NetworkBandwidth", () => {
  it("renders both rows with their window captions and formatted values", () => {
    render(
      <NetworkBandwidth
        nightlyIncremental={{
          inboundMBps: 10.922666666666666,
          outboundMBps: 5.461333333333333,
        }}
        initialFullRestore={{
          inboundMBps: 121.362962962962963,
          outboundMBps: 60.681481481481481,
        }}
      />,
    );

    expect(screen.getByText("Nightly Incremental (8h)")).toBeInTheDocument();
    expect(screen.getByText("10.9 / 5.5 MB/s")).toBeInTheDocument();
    expect(
      screen.getByText("Initial Full / Restore (24h)"),
    ).toBeInTheDocument();
    expect(screen.getByText("121.4 / 60.7 MB/s")).toBeInTheDocument();
  });

  it("renders a real 0 throughput distinctly from an absent one", () => {
    render(
      <NetworkBandwidth
        nightlyIncremental={{ inboundMBps: 0, outboundMBps: 0 }}
        initialFullRestore={null}
      />,
    );

    expect(screen.getByText("0.0 / 0.0 MB/s")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("renders — in both value cells, with both rows present, when both props are absent", () => {
    render(
      <NetworkBandwidth
        nightlyIncremental={undefined}
        initialFullRestore={undefined}
      />,
    );

    expect(screen.getByText("Nightly Incremental (8h)")).toBeInTheDocument();
    expect(
      screen.getByText("Initial Full / Restore (24h)"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- network-bandwidth`
Expected: FAIL — `Cannot find module './network-bandwidth'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/simple-mode/network-bandwidth.tsx
import type { Throughput } from "@/types/vault-sizer-api";
import {
  BACKUP_WINDOW_HOURS,
  FULL_BACKUP_WINDOW_HOURS,
} from "@/lib/simple-mode/backup-windows";

function formatThroughput(throughput: Throughput | null | undefined): string {
  if (throughput == null) return "—";
  return `${throughput.inboundMBps.toFixed(1)} / ${throughput.outboundMBps.toFixed(1)} MB/s`;
}

interface NetworkBandwidthProps {
  nightlyIncremental: Throughput | null | undefined;
  initialFullRestore: Throughput | null | undefined;
}

export function NetworkBandwidth({
  nightlyIncremental,
  initialFullRestore,
}: NetworkBandwidthProps) {
  const rows = [
    {
      label: `Nightly Incremental (${BACKUP_WINDOW_HOURS}h)`,
      value: formatThroughput(nightlyIncremental),
    },
    {
      label: `Initial Full / Restore (${FULL_BACKUP_WINDOW_HOURS}h)`,
      value: formatThroughput(initialFullRestore),
    },
  ];

  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            className="border-border border-t first:border-t-0"
          >
            <td className="text-muted-foreground py-1.5 pr-2">{row.label}</td>
            <td className="py-1.5 text-right font-mono">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- network-bandwidth`
Expected: PASS, all 3 cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/network-bandwidth.tsx src/components/simple-mode/network-bandwidth.test.tsx
git commit -m "feat: add NetworkBandwidth component for nightly incremental and initial full/restore rows"
```

---

### Task 4: Trim `InfrastructureTelemetry` to Cores/RAM only

**Files:**

- Modify: `src/components/simple-mode/infrastructure-telemetry.tsx`
- Modify: `src/components/simple-mode/infrastructure-telemetry.test.tsx`
- Modify: `src/components/simple-mode/projected-sizing-card.test.tsx:101` (drops an assertion this task's implementation change makes false — see Step 2)

- [ ] **Step 1: Rewrite the test file for the 2-row shape**

Replace the full contents of `src/components/simple-mode/infrastructure-telemetry.test.tsx` with:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import type { ComputeRequirement } from "@/types/vault-sizer-api";

describe("InfrastructureTelemetry", () => {
  it("renders cores and RAM when compute is present", () => {
    const compute: ComputeRequirement = { cores: 4, ram: 16 };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.getByText("Cores")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getByText("16 GB")).toBeInTheDocument();
  });

  it("no longer renders a Network Throughput row — that moved to NetworkBandwidth", () => {
    const compute: ComputeRequirement = {
      cores: 4,
      ram: 16,
      networkThroughput: { inboundMBps: 120, outboundMBps: 80 },
    };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.queryByText("Network Throughput")).not.toBeInTheDocument();
  });

  it("renders — in both value cells, with both rows present, when compute is undefined", () => {
    render(<InfrastructureTelemetry compute={undefined} />);

    expect(screen.getByText("Cores")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
```

This drops the throughput-precision, real-zero, and null-`networkThroughput` cases from the old test file — that exact coverage now lives in `network-bandwidth.test.tsx` (Task 3), against the component that actually owns that row now.

- [ ] **Step 2: Remove the now-stale assertion from `projected-sizing-card.test.tsx`**

This task's implementation change (Step 4 below) removes `InfrastructureTelemetry`'s Network Throughput row entirely, which will make `projected-sizing-card.test.tsx`'s existing `"wires InfrastructureTelemetry to proxyCompute, not repoCompute"` test assert on text that no longer renders anywhere (that row doesn't move into `NetworkBandwidth` until Task 5). Fix the assertion now, as part of this same change, so this task's own commit stays green rather than landing red until Task 5.

In `src/components/simple-mode/projected-sizing-card.test.tsx`, replace:

```tsx
it("wires InfrastructureTelemetry to proxyCompute, not repoCompute", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse({ success: true, data: mockData }),
  );

  render(
    <ProjectedSizingCard
      workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
      repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
      onChange={() => {}}
    />,
  );

  // proxyCompute's cores (8)/ram (32 GB), not repoCompute's (4/16).
  await vi.waitFor(() => expect(screen.getByText("8")).toBeInTheDocument());
  expect(screen.getByText("32 GB")).toBeInTheDocument();
  expect(screen.getByText("100.0 / 50.0 MB/s")).toBeInTheDocument();
});
```

with:

```tsx
it("wires InfrastructureTelemetry to proxyCompute, not repoCompute", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse({ success: true, data: mockData }),
  );

  render(
    <ProjectedSizingCard
      workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
      repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
      onChange={() => {}}
    />,
  );

  // proxyCompute's cores (8)/ram (32 GB), not repoCompute's (4/16).
  await vi.waitFor(() => expect(screen.getByText("8")).toBeInTheDocument());
  expect(screen.getByText("32 GB")).toBeInTheDocument();
});
```

(Just the `100.0 / 50.0 MB/s` assertion dropped — that figure's assertion returns in Task 5, against `NetworkBandwidth`, once that component actually renders it.)

- [ ] **Step 3: Run the affected test files to verify the expected red/green split**

Run: `npm run test:run -- infrastructure-telemetry projected-sizing-card`
Expected: `infrastructure-telemetry` FAILs — the "no longer renders a Network Throughput row" test fails because the current component still renders it; the "both rows present" test fails because `getAllByText("—")` still finds 3 elements, not 2. `projected-sizing-card` PASSes — Step 2 already removed the assertion that would otherwise break here.

- [ ] **Step 4: Write the implementation**

Replace the full contents of `src/components/simple-mode/infrastructure-telemetry.tsx` with:

```tsx
import type { ComputeRequirement } from "@/types/vault-sizer-api";

interface InfrastructureTelemetryProps {
  compute: ComputeRequirement | null | undefined;
}

export function InfrastructureTelemetry({
  compute,
}: InfrastructureTelemetryProps) {
  const rows = [
    { label: "Cores", value: compute ? String(compute.cores) : "—" },
    { label: "RAM", value: compute ? `${compute.ram} GB` : "—" },
  ];

  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            className="border-border border-t first:border-t-0"
          >
            <td className="text-muted-foreground py-1.5 pr-2">{row.label}</td>
            <td className="py-1.5 text-right font-mono">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Run the full test suite to verify this commit lands green**

Run: `npm run test:run`
Expected: PASS — every test file, including both `infrastructure-telemetry` (all 3 cases) and `projected-sizing-card` (all 4 existing cases, unchanged in count until Task 5 adds a new one).

- [ ] **Step 6: Commit**

```bash
git add src/components/simple-mode/infrastructure-telemetry.tsx src/components/simple-mode/infrastructure-telemetry.test.tsx src/components/simple-mode/projected-sizing-card.test.tsx
git commit -m "refactor: trim InfrastructureTelemetry to Cores/RAM, throughput moved to NetworkBandwidth"
```

---

### Task 5: Wire `NetworkBandwidth` into `ProjectedSizingCard`

**Files:**

- Modify: `src/components/simple-mode/projected-sizing-card.tsx`
- Modify: `src/components/simple-mode/projected-sizing-card.test.tsx`

- [ ] **Step 1: Add a new test to the test file**

`projected-sizing-card.test.tsx`'s `"wires InfrastructureTelemetry to proxyCompute, not repoCompute"` test was already trimmed to drop its throughput assertion in Task 4, Step 2 (that figure isn't `InfrastructureTelemetry`'s concern anymore). This step only adds a new test, directly after it, covering `NetworkBandwidth`'s wiring:

```tsx
it("wires NetworkBandwidth to proxyCompute's networkThroughput and the derived initial full/restore figure", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse({ success: true, data: mockData }),
  );

  render(
    <ProjectedSizingCard
      workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
      repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
      onChange={() => {}}
    />,
  );

  // proxyCompute.compute.networkThroughput from mockData.
  await vi.waitFor(() =>
    expect(screen.getByText("100.0 / 50.0 MB/s")).toBeInTheDocument(),
  );
  // Derived from DEFAULT_WORKLOAD_DATA_VALUES: sourceSizeTB "10",
  // dataReductionPercent "50" — computed instantly, no fetch involved.
  expect(screen.getByText("121.4 / 60.7 MB/s")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- projected-sizing-card`
Expected: FAIL — the new test can't find `"121.4 / 60.7 MB/s"` (and `NetworkBandwidth` isn't rendered at all yet).

- [ ] **Step 3: Wire it into the component**

Replace the full contents of `src/components/simple-mode/projected-sizing-card.tsx` with:

```tsx
import { LoaderCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
import { calculateInitialFullBandwidth } from "@/lib/simple-mode/calculate-initial-full-bandwidth";
import { ForecastHorizonControl } from "./forecast-horizon-control";
import { StorageBreakdown } from "./storage-breakdown";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import { NetworkBandwidth } from "./network-bandwidth";
import type {
  RepositoryConfigValues,
  WorkloadDataValues,
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
        <StorageBreakdown data={data} />
        <InfrastructureTelemetry compute={data?.proxyCompute?.compute} />
        <NetworkBandwidth
          nightlyIncremental={data?.proxyCompute?.compute?.networkThroughput}
          initialFullRestore={initialFullRestore}
        />
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:run -- projected-sizing-card`
Expected: PASS, all 5 cases (the 4 original plus the new one).

- [ ] **Step 5: Run the full test suite**

Run: `npm run test:run`
Expected: PASS, no regressions anywhere else in the app.

- [ ] **Step 6: Commit**

```bash
git add src/components/simple-mode/projected-sizing-card.tsx src/components/simple-mode/projected-sizing-card.test.tsx
git commit -m "feat: render NetworkBandwidth in ProjectedSizingCard"
```

---

## Self-Review Notes

- **Spec coverage:** every "In scope" bullet from the spec has a task — constants module relocation (Task 1), the new pure function (Task 2), the new component (Task 3), `InfrastructureTelemetry` trimmed (Task 4), `ProjectedSizingCard` wiring (Task 5). `formatThroughput`'s relocation is covered inside Tasks 3–4 (added new in Task 3, removed from its old home in Task 4). Out-of-scope items (adjustable windows, tier disk throughput, worker-side computation, horizon-scaling, renaming `InfrastructureTelemetry`) have no corresponding task, as intended.
- **Placeholder scan:** no TBD/TODO; every step shows complete, runnable code and exact commands.
- **Type consistency:** `Throughput`, `ComputeRequirement`, `calculateInitialFullBandwidth`, `NetworkBandwidth`'s prop names (`nightlyIncremental`, `initialFullRestore`) are used identically across Tasks 2, 3, and 5.
- **Commit atomicity:** each task's final verification step runs against the full suite, not just its own scoped file, before committing — Task 4 in particular fixes `projected-sizing-card.test.tsx`'s now-stale `100.0 / 50.0 MB/s` assertion inline (Step 2) rather than leaving it for Task 5, so Task 4's commit doesn't land with a known-red test elsewhere in the suite.
