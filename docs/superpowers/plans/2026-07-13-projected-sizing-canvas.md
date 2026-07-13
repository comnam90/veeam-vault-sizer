# Projected Sizing Canvas & `useCalculatedSizing` Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Simple Mode's empty right-column placeholder with a live "Projected Sizing" card that debounces/race-guards calls to the existing sizing API and renders a tier-by-tier storage and compute breakdown, driven by a new Forecast Horizon control.

**Architecture:** A new `useCalculatedSizing` hook (debounced, abort-guarded, validation-gated) sits inside a new `ProjectedSizingCard`, which composes three new sub-components (`ForecastHorizonControl`, `StorageBreakdown`, `InfrastructureTelemetry`) and two new `ui/` primitives (`Slider`, `Progress`). A new `projectLengthYears` field threads through `WorkloadDataValues` → `buildVmAgentRequest`, driving both `projectLength` and `growthRateScopeYears` (ADR-0016) and, via the existing `yearlyGrowthPercent` field, `growthFactor` (ADR-0018).

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Tailwind CSS v4, Radix UI primitives (via the `radix-ui` package), Cloudflare Pages Functions (untouched by this task).

**Spec:** `docs/superpowers/specs/2026-07-13-projected-sizing-canvas-design.md` — read it first; this plan implements it section by section. Relevant ADRs: 0016 (Forecast Horizon drives both horizon fields), 0017 (Strict Mode first-load delay accepted), 0018 (`growthFactor` mirrors `growthRatePercent`'s source).

**Note on scope:** every code snippet in every task below has already been implemented and verified end-to-end in a throwaway prototype (all 191 new/changed tests passing, clean `tsc --noEmit`, clean `eslint .`, clean `npm run build`) before this plan was written, then reverted so this branch stays plan-only. Follow the steps as written — they are not speculative.

---

## File Structure

**New files:**

- `src/hooks/use-calculated-sizing.ts` / `.test.ts` — the reactive sizing hook
- `src/components/ui/slider.tsx` — thin Radix Slider wrapper (no test — matches this repo's existing `ui/` convention of untested primitives)
- `src/components/ui/progress.tsx` — thin Radix Progress wrapper (no test, same reason)
- `src/components/simple-mode/forecast-horizon-control.tsx` / `.test.tsx`
- `src/components/simple-mode/storage-breakdown.tsx` / `.test.tsx`
- `src/components/simple-mode/infrastructure-telemetry.tsx` / `.test.tsx`
- `src/components/simple-mode/projected-sizing-card.tsx` / `.test.tsx`

**Modified files:**

- `src/types/simple-mode.ts` — add `projectLengthYears` to `WorkloadDataValues` and its default
- `src/lib/simple-mode/validate-workload-data.ts` / `.test.ts` — new field's validation rule
- `src/lib/simple-mode/build-vm-agent-request.ts` / `.test.ts` — `projectLength`/`growthRateScopeYears`/`growthFactor` mapping
- `src/lib/api/vault-sizer-client.ts` / `.test.ts` — `AbortSignal` parameter
- `src/components/simple-mode/simple-mode-page.tsx` / `.test.tsx` — wire in `ProjectedSizingCard`, replacing the placeholder

**Not modified:** `src/types/vault-sizer-api.ts` (Correction 3 in the spec: `networkThroughput` is already present on `ComputeRequirement` as of Task 1's commit — verified, no change needed) and `functions/api/vault-sizer.ts` (unaffected by client-side `AbortSignal` support).

---

### Task 1: `projectLengthYears` field on `WorkloadDataValues`

**Files:**

- Modify: `src/types/simple-mode.ts`
- Modify: `src/lib/simple-mode/validate-workload-data.ts`
- Test: `src/lib/simple-mode/validate-workload-data.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/simple-mode/validate-workload-data.test.ts`, add `projectLengthYears: "1"` to the `validValues` fixture (required — without it, once Step 3 adds the field's validation rule, every _other_ test in this file that uses `validValues` unmodified will start throwing, since `requireNumber` calls `.trim()` on the now-checked-but-absent field):

```ts
const validValues: WorkloadDataValues = {
  sourceSizeTB: "10",
  dailyChangeRatePercent: "3",
  dataReductionPercent: "50",
  yearlyGrowthPercent: "10",
  shortTermRetentionDays: "30",
  gfsWeekly: "4",
  gfsMonthly: "12",
  gfsYearly: "3",
  projectLengthYears: "1",
};
```

Then add a new `describe` block at the end of the file, just before the closing `});` of the outer `describe("validateWorkloadData", ...)`:

```ts
describe("projectLengthYears", () => {
  it("accepts the boundary values 1 and 100", () => {
    expect(
      validateWorkloadData({ ...validValues, projectLengthYears: "1" })
        .projectLengthYears,
    ).toBeUndefined();
    expect(
      validateWorkloadData({ ...validValues, projectLengthYears: "100" })
        .projectLengthYears,
    ).toBeUndefined();
  });

  it("rejects 0 (the API's fall-back-to-growthRateScopeYears sentinel)", () => {
    expect(
      validateWorkloadData({ ...validValues, projectLengthYears: "0" })
        .projectLengthYears,
    ).toBe("Must be between 1 and 100");
  });

  it("rejects a value above 100", () => {
    expect(
      validateWorkloadData({ ...validValues, projectLengthYears: "101" })
        .projectLengthYears,
    ).toBe("Must be between 1 and 100");
  });

  it("rejects a non-integer value", () => {
    expect(
      validateWorkloadData({ ...validValues, projectLengthYears: "2.5" })
        .projectLengthYears,
    ).toBe("Must be a whole number");
  });

  it("rejects an empty value", () => {
    expect(
      validateWorkloadData({ ...validValues, projectLengthYears: "" })
        .projectLengthYears,
    ).toBe("Required");
  });
});
```

- [ ] **Step 2: Run the tests, verify the new ones fail**

Run: `npx vitest run src/lib/simple-mode/validate-workload-data.test.ts`
Expected: the 5 new `projectLengthYears` tests FAIL (e.g. "rejects 0" fails with `expected undefined to be 'Must be between 1 and 100'`) — `FIELD_RULES` has no entry for this key yet, so `validateWorkloadData` never checks it. All pre-existing tests still PASS (the fixture now has the field, but nothing reads it yet).

- [ ] **Step 3: Add the field to the type, its default, and the validation rule**

In `src/types/simple-mode.ts`, add `projectLengthYears: string;` as the last field of the `WorkloadDataValues` interface:

```ts
export interface WorkloadDataValues {
  sourceSizeTB: string;
  dailyChangeRatePercent: string;
  dataReductionPercent: string;
  yearlyGrowthPercent: string;
  shortTermRetentionDays: string;
  gfsWeekly: string;
  gfsMonthly: string;
  gfsYearly: string;
  projectLengthYears: string;
}
```

And add `projectLengthYears: "1",` as the last field of `DEFAULT_WORKLOAD_DATA_VALUES`:

```ts
export const DEFAULT_WORKLOAD_DATA_VALUES: WorkloadDataValues = {
  sourceSizeTB: "10",
  dailyChangeRatePercent: "3",
  dataReductionPercent: "50",
  yearlyGrowthPercent: "10",
  shortTermRetentionDays: "30",
  gfsWeekly: "4",
  gfsMonthly: "12",
  gfsYearly: "3",
  projectLengthYears: "1",
};
```

In `src/lib/simple-mode/validate-workload-data.ts`, add one entry to `FIELD_RULES`, right after the `gfsYearly` entry:

```ts
const FIELD_RULES: { key: keyof WorkloadDataValues; rules: NumberRules }[] = [
  { key: "sourceSizeTB", rules: { exclusiveMin: 0 } },
  { key: "dailyChangeRatePercent", rules: { min: 0, max: 100 } },
  { key: "dataReductionPercent", rules: { min: 0, max: 100 } },
  { key: "yearlyGrowthPercent", rules: { min: 0 } },
  { key: "shortTermRetentionDays", rules: { integer: true, min: 1 } },
  { key: "gfsWeekly", rules: { integer: true, min: 0 } },
  { key: "gfsMonthly", rules: { integer: true, min: 0 } },
  { key: "gfsYearly", rules: { integer: true, min: 0 } },
  { key: "projectLengthYears", rules: { integer: true, min: 1, max: 100 } },
];
```

`min: 1` (not just "positive") matters: the upstream API treats `projectLength: 0` as "fall back to `growthRateScopeYears`" (per the Swagger), and this UI always wants to send an explicit value, never that sentinel.

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/lib/simple-mode/validate-workload-data.test.ts`
Expected: all tests PASS (22 tests).

- [ ] **Step 5: Commit**

```bash
git add src/types/simple-mode.ts src/lib/simple-mode/validate-workload-data.ts src/lib/simple-mode/validate-workload-data.test.ts
git commit -m "$(cat <<'EOF'
feat: add projectLengthYears to WorkloadDataValues

New sizing-input field backing the Forecast Horizon control, with a
1-100 integer validation rule. min:1 avoids the API's projectLength=0
fall-back-to-growthRateScopeYears sentinel — this UI always sends an
explicit value.
EOF
)"
```

---

### Task 2: `buildVmAgentRequest` — Forecast Horizon (years + rate) mapping

**Files:**

- Modify: `src/lib/simple-mode/build-vm-agent-request.ts`
- Test: `src/lib/simple-mode/build-vm-agent-request.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/simple-mode/build-vm-agent-request.test.ts`, add `type WorkloadDataValues` to the existing type-only import from `@/types/simple-mode`:

```ts
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";
```

Replace these four lines inside the `"maps workload fields and fixed defaults for the Direct-to-Vault path"` test:

```ts
    expect(result.growthRateScopeYears).toBe(1);
    expect(result.backupWindowHours).toBe(8);
    expect(result.growthFactor).toBeUndefined();
    expect(result.projectLength).toBeUndefined();
  });
```

with:

```ts
    expect(result.growthRateScopeYears).toBe(1); // DEFAULT_WORKLOAD_DATA_VALUES.projectLengthYears = "1"
    expect(result.backupWindowHours).toBe(8);
    expect(result.growthFactor).toBe(10); // same source as growthRatePercent
    expect(result.projectLength).toBe(1); // same source as growthRateScopeYears
  });

  it("derives growthRateScopeYears and projectLength from the same projectLengthYears field", () => {
    const values: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      projectLengthYears: "5",
    };

    const result = buildVmAgentRequest(
      values,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(result.growthRateScopeYears).toBe(5);
    expect(result.projectLength).toBe(5);
  });

  it("derives growthFactor from the same yearlyGrowthPercent field as growthRatePercent", () => {
    const values: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      yearlyGrowthPercent: "25",
    };

    const result = buildVmAgentRequest(
      values,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(result.growthRatePercent).toBe(25);
    expect(result.growthFactor).toBe(25);
  });
```

- [ ] **Step 2: Run the tests, verify failures**

Run: `npx vitest run src/lib/simple-mode/build-vm-agent-request.test.ts`
Expected: `maps workload fields and fixed defaults...` FAILS at `expect(result.growthFactor).toBe(10)` with `expected undefined to be 10`. The two new tests FAIL similarly (`growthFactor`/`projectLength` both `undefined`).

- [ ] **Step 3: Update the implementation**

In `src/lib/simple-mode/build-vm-agent-request.ts`, remove the now-obsolete constant:

```ts
// Fixed sizing assumptions with no corresponding UI field yet.
const BACKUP_WINDOW_HOURS = 8;
```

(deleting the `const GROWTH_RATE_SCOPE_YEARS = 1;` line that was there before it.)

Then update the `base` object's growth-related fields:

```ts
    growthRatePercent: Number(workloadData.yearlyGrowthPercent),
    growthFactor: Number(workloadData.yearlyGrowthPercent),
    growthRateScopeYears: Number(workloadData.projectLengthYears),
    projectLength: Number(workloadData.projectLengthYears),
    days: Number(workloadData.shortTermRetentionDays),
```

(this replaces the previous `growthRatePercent: Number(workloadData.yearlyGrowthPercent), growthRateScopeYears: GROWTH_RATE_SCOPE_YEARS, days: ...` block — two new lines inserted, one line's right-hand side changed.)

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/lib/simple-mode/build-vm-agent-request.test.ts`
Expected: all tests PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/build-vm-agent-request.ts src/lib/simple-mode/build-vm-agent-request.test.ts
git commit -m "$(cat <<'EOF'
feat: derive projectLength/growthRateScopeYears/growthFactor from UI fields

projectLengthYears now drives both growthRateScopeYears (proxy-compute
growth horizon) and projectLength (storage-sizing horizon) instead of
the former hardcoded 1-year constant (ADR-0016). growthFactor mirrors
growthRatePercent's existing yearlyGrowthPercent source instead of
relying on the upstream API's undocumented-in-this-codebase fallback
(ADR-0018).
EOF
)"
```

---

### Task 3: `callVaultSizerApi` — `AbortSignal` parameter

**Files:**

- Modify: `src/lib/api/vault-sizer-client.ts`
- Test: `src/lib/api/vault-sizer-client.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test at the end of the `describe("callVaultSizerApi", ...)` block in `src/lib/api/vault-sizer-client.test.ts`:

```ts
it("forwards an AbortSignal to fetch when provided", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: mockData }), {
      status: 200,
    }),
  );
  const controller = new AbortController();

  await callVaultSizerApi(
    DEFAULT_WORKLOAD_DATA_VALUES,
    DEFAULT_REPOSITORY_CONFIG_VALUES,
    controller.signal,
  );

  expect(fetch).toHaveBeenCalledWith(
    "/api/vault-sizer",
    expect.objectContaining({ signal: controller.signal }),
  );
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/lib/api/vault-sizer-client.test.ts`
Expected: FAILS with a TypeScript/argument-count error at the call site — `callVaultSizerApi` doesn't accept a third argument yet (the extra argument is simply ignored at runtime since JS doesn't enforce arity, so the real failure is the `toHaveBeenCalledWith` assertion: the actual `fetch` call has no `signal` key at all, so `expect.objectContaining({ signal: controller.signal })` fails).

- [ ] **Step 3: Add the parameter**

In `src/lib/api/vault-sizer-client.ts`:

```ts
export async function callVaultSizerApi(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
  signal?: AbortSignal,
): Promise<CVmAgentReturnObject> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workloadData, repositoryConfig }),
    signal,
  });
```

(adds the `signal?: AbortSignal` parameter and the `signal,` line inside the `fetch` call's options object; everything else is unchanged.)

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/lib/api/vault-sizer-client.test.ts`
Expected: all tests PASS (3 tests). The two pre-existing tests still pass unmodified — Vitest's `toHaveBeenCalledWith` treats an object with an explicit `signal: undefined` key as equal to one without that key, so calls made without a third argument aren't affected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/vault-sizer-client.ts src/lib/api/vault-sizer-client.test.ts
git commit -m "feat: accept an optional AbortSignal in callVaultSizerApi"
```

---

### Task 4: `useCalculatedSizing` hook

**Files:**

- Create: `src/hooks/use-calculated-sizing.ts`
- Test: `src/hooks/use-calculated-sizing.test.ts`

This hook is one cohesive stateful unit — its debounce, abort-guard, validation-gate, and loading/error state all share one `useEffect` body, so there's no meaningful "partial" implementation to grow test-by-test the way a pure function would. This task writes the complete test suite first, confirms every test fails against a not-yet-existing module, then writes the complete implementation in one step.

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/use-calculated-sizing.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCalculatedSizing } from "./use-calculated-sizing";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const mockData: CVmAgentReturnObject = {
  totalStorageTB: 18.4,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("useCalculatedSizing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fires immediately on mount, with no debounce delay", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, data: mockData }),
    );

    const { result } = renderHook(() =>
      useCalculatedSizing(
        DEFAULT_WORKLOAD_DATA_VALUES,
        DEFAULT_REPOSITORY_CONFIG_VALUES,
      ),
    );

    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => expect(result.current.data).toEqual(mockData));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("collapses rapid consecutive changes into a single fetch call, using the latest values", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, data: mockData }),
    );

    const { rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    expect(fetch).toHaveBeenCalledTimes(1); // the immediate mount fetch

    const secondEdit: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    const thirdEdit: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "12",
    };

    act(() => rerender({ workloadData: secondEdit }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    act(() => rerender({ workloadData: thirdEdit }));

    // Still within the 500ms debounce window from the *last* edit — no second dispatch yet.
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/vault-sizer",
      expect.objectContaining({
        body: JSON.stringify({
          workloadData: thirdEdit,
          repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        }),
      }),
    );
  });

  it("sets isLoading synchronously on a value change and clears it once the request settles", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, data: mockData }),
    );

    const { result, rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    act(() => rerender({ workloadData: edited }));

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("reflects the newer response and aborts the older request when a slower older request is superseded", async () => {
    let resolveFirst!: (value: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const olderData: CVmAgentReturnObject = { ...mockData, totalStorageTB: 1 };
    const newerData: CVmAgentReturnObject = {
      ...mockData,
      totalStorageTB: 2,
    };

    vi.mocked(fetch)
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce(jsonResponse({ success: true, data: newerData }));

    const { result, rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    const firstCallSignal = vi.mocked(fetch).mock.calls[0][1]?.signal;

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    act(() => rerender({ workloadData: edited }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() => expect(result.current.data).toEqual(newerData));

    // The superseded first request's controller was aborted.
    expect(firstCallSignal?.aborted).toBe(true);

    // The first request resolving *after* the second has already settled
    // must not clobber the newer state.
    resolveFirst(jsonResponse({ success: true, data: olderData }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data).toEqual(newerData);
  });

  it("leaves error null when a rejection is caused by abort (supersession, not failure)", async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() => {
        const error = new DOMException("Aborted", "AbortError");
        return Promise.reject(error);
      })
      .mockResolvedValueOnce(jsonResponse({ success: true, data: mockData }));

    const { result, rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    act(() => rerender({ workloadData: edited }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() => expect(result.current.data).toEqual(mockData));
    expect(result.current.error).toBeNull();
  });

  it("sets error on a non-abort rejection and leaves prior data intact", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ success: true, data: mockData }))
      .mockResolvedValueOnce(
        jsonResponse(
          { success: false, error: "Upstream sizing API unreachable" },
          502,
        ),
      );

    const { result, rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    await vi.waitFor(() => expect(result.current.data).toEqual(mockData));

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "11",
    };
    act(() => rerender({ workloadData: edited }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() =>
      expect(result.current.error).toBe("Upstream sizing API unreachable"),
    );
    expect(result.current.data).toEqual(mockData);
  });

  it("never calls fetch while workloadData fails validation", async () => {
    const invalid: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      sourceSizeTB: "",
    };

    const { result } = renderHook(() =>
      useCalculatedSizing(invalid, DEFAULT_REPOSITORY_CONFIG_VALUES),
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("carries an updated projectLengthYears through to the outbound request body as projectLength", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, data: mockData }),
    );

    const { rerender } = renderHook(
      ({ workloadData }) =>
        useCalculatedSizing(workloadData, DEFAULT_REPOSITORY_CONFIG_VALUES),
      { initialProps: { workloadData: DEFAULT_WORKLOAD_DATA_VALUES } },
    );

    const edited: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      projectLengthYears: "5",
    };
    act(() => rerender({ workloadData: edited }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetch).toHaveBeenLastCalledWith(
      "/api/vault-sizer",
      expect.objectContaining({
        body: JSON.stringify({
          workloadData: edited,
          repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run src/hooks/use-calculated-sizing.test.ts`
Expected: FAILS to resolve — `Cannot find module './use-calculated-sizing'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/hooks/use-calculated-sizing.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import { callVaultSizerApi } from "@/lib/api/vault-sizer-client";
import { validateRepositoryConfig } from "@/lib/simple-mode/validate-repository-config";
import { validateWorkloadData } from "@/lib/simple-mode/validate-workload-data";
import type {
  RepositoryConfigValues,
  WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const DEBOUNCE_MS = 500;

interface CalculatedSizing {
  data: CVmAgentReturnObject | null;
  isLoading: boolean;
  error: string | null;
}

export function useCalculatedSizing(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): CalculatedSizing {
  const [state, setState] = useState<CalculatedSizing>({
    data: null,
    isLoading: false,
    error: null,
  });
  const latestRequestId = useRef(0);
  const hasRunRef = useRef(false);

  useEffect(() => {
    const workloadErrors = validateWorkloadData(workloadData);
    const repositoryErrors = validateRepositoryConfig(
      repositoryConfig,
      workloadData,
    );
    if (
      Object.keys(workloadErrors).length > 0 ||
      Object.keys(repositoryErrors).length > 0
    ) {
      setState((prev) => ({ ...prev, isLoading: false, error: null }));
      return;
    }

    const requestId = ++latestRequestId.current;
    const controller = new AbortController();
    const isFirstRun = !hasRunRef.current;
    hasRunRef.current = true;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const dispatch = async () => {
      try {
        const data = await callVaultSizerApi(
          workloadData,
          repositoryConfig,
          controller.signal,
        );
        if (latestRequestId.current === requestId) {
          setState({ data, isLoading: false, error: null });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (latestRequestId.current === requestId) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : "Unknown error",
          }));
        }
      }
    };

    const timeoutId = isFirstRun
      ? undefined
      : setTimeout(dispatch, DEBOUNCE_MS);
    if (isFirstRun) void dispatch();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      controller.abort();
    };
  }, [workloadData, repositoryConfig]);

  return state;
}
```

Notes on non-obvious parts (see spec §5 and ADR-0017 for full rationale):

- **Validation gate** runs before any debounce/network activity — reuses the same `validateWorkloadData`/`validateRepositoryConfig` functions the left-column cards already call, so an invalid field's inline error is the only signal (no duplicate banner).
- **`isFirstRun`/`hasRunRef`**: the very first dispatch (mount) skips the debounce entirely. This is deliberately a dedicated ref, not derived from `requestId === 1` — if the very first render's data ever failed validation (skipping the `requestId` increment via the early `return` above), a naive `requestId === 1` check would misfire on the _next_ real attempt.
- **Known limitation, accepted, not fixed here**: under React's `<StrictMode>` (enabled in `main.tsx`), the effect's dev-only double-invoke means the real initial load's `hasRunRef` gets flipped by the throwaway first invocation, so it goes through the 500ms debounce instead of firing immediately — a dev-only, cosmetic ~500ms delay before the first result appears in `npm run dev`. Do not attempt to fix this by resetting `hasRunRef` in the effect's cleanup — that reset fires on every real edit too (cleanup runs before every effect re-run, not just Strict Mode's synthetic one), which permanently defeats the debounce. See ADR-0017.

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/hooks/use-calculated-sizing.test.ts`
Expected: all tests PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-calculated-sizing.ts src/hooks/use-calculated-sizing.test.ts
git commit -m "$(cat <<'EOF'
feat: add useCalculatedSizing hook

Debounced (500ms), validation-gated, abort/race-guarded hook wrapping
callVaultSizerApi. Fires immediately on mount; every later change to
workloadData/repositoryConfig collapses through the debounce. A
requestId ref discards stale responses even if abort() couldn't
prevent them in time.
EOF
)"
```

---

### Task 5: `Slider` and `Progress` UI primitives

**Files:**

- Create: `src/components/ui/slider.tsx`
- Create: `src/components/ui/progress.tsx`

No dedicated tests — every existing file in `src/components/ui/` (`button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `switch.tsx`, etc.) is untested; these are thin styling wrappers over Radix primitives with no branching logic of their own, and this task follows that established convention.

- [ ] **Step 1: Create `slider.tsx`**

```tsx
import * as React from "react";
import { Slider as SliderPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none items-center select-none",
        "data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="bg-muted relative h-1.5 w-full grow overflow-hidden rounded-full"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="bg-primary absolute h-full"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className={cn(
          "border-primary bg-background block size-4 shrink-0 rounded-full border shadow transition-colors",
          "focus-visible:ring-primary/20 focus-visible:ring-4 focus-visible:outline-none",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
```

This is a single-thumb slider only (one `<SliderPrimitive.Thumb>`, not a `.map()` over a `values` array) — the only consumer, `ForecastHorizonControl` (Task 6), always passes a single-element `value` array, so multi-thumb support would be speculative.

- [ ] **Step 2: Create `progress.tsx`**

```tsx
import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.ComponentProps<
  typeof ProgressPrimitive.Root
> {
  indicatorClassName?: string;
}

function Progress({
  className,
  indicatorClassName,
  value,
  ...props
}: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "bg-muted relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "bg-primary h-full w-full flex-1 transition-all",
          indicatorClassName,
        )}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
```

**Important:** `value` must be explicitly forwarded to `<ProgressPrimitive.Root value={value}>`, not just read locally for the transform calculation. A version that destructures `value` out of props purely to compute the indicator's inline `style` — without also passing it back to `Root` — compiles fine and _looks_ right, but Radix never receives the value, so it renders `data-state="indeterminate"` and no `aria-valuenow` regardless of what's visually drawn. This was caught during prototyping by inspecting the rendered DOM, not by the component's own visual output.

`indicatorClassName` is a small addition beyond bare shadcn/Radix defaults: `StorageBreakdown` (Task 7) needs three differently-colored bars (`tier-performance`/`tier-capacity`/`tier-archive`) from the same component, and Radix's `Progress` doesn't expose a way to style the indicator separately from `Root` otherwise.

- [ ] **Step 3: Verify the app still typechecks and builds**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run build`
Expected: both succeed with no output/errors. (Nothing imports these two files yet, so there's no runtime behavior to test — Task 6 and 7 are the first consumers.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/slider.tsx src/components/ui/progress.tsx
git commit -m "feat: add Slider and Progress ui primitives"
```

---

### Task 6: `ForecastHorizonControl` component

**Files:**

- Create: `src/components/simple-mode/forecast-horizon-control.tsx`
- Test: `src/components/simple-mode/forecast-horizon-control.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/simple-mode/forecast-horizon-control.test.tsx`:

```tsx
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastHorizonControl } from "./forecast-horizon-control";
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type WorkloadDataValues,
} from "@/types/simple-mode";

describe("ForecastHorizonControl", () => {
  it("renders the slider thumb reflecting the in-range default value", () => {
    render(
      <ForecastHorizonControl
        value={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "1");
  });

  it("clamps the slider's displayed position for an out-of-range raw value, while the input keeps the raw value", () => {
    render(
      <ForecastHorizonControl
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, projectLengthYears: "10" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "5");
    expect(screen.getByLabelText(/forecast horizon \(years\)/i)).toHaveValue(
      "10",
    );
  });

  it("clamps to the minimum for a non-numeric raw value without throwing", () => {
    expect(() =>
      render(
        <ForecastHorizonControl
          value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, projectLengthYears: "" }}
          onChange={() => {}}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "1");
  });

  it("updates projectLengthYears when the input is edited", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    // Controlled input: a plain vi.fn() onChange never feeds a new value
    // back in, so React would reset the DOM value after every keystroke
    // (ADR-0005). This harness mirrors how ProjectedSizingCard actually
    // uses this control (state lives in the parent).
    function Harness() {
      const [value, setValue] = useState<WorkloadDataValues>(
        DEFAULT_WORKLOAD_DATA_VALUES,
      );
      return (
        <ForecastHorizonControl
          value={value}
          onChange={(next) => {
            setValue(next);
            handleChange(next);
          }}
        />
      );
    }
    render(<Harness />);

    const input = screen.getByLabelText(/forecast horizon \(years\)/i);
    await user.clear(input);
    await user.type(input, "7");

    const lastCall = handleChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ projectLengthYears: "7" });
  });

  it("renders an inline error for an invalid raw value", () => {
    render(
      <ForecastHorizonControl
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, projectLengthYears: "0" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("Must be between 1 and 100")).toBeInTheDocument();
  });

  it("shows no error for a valid raw value that still pins the slider display", () => {
    render(
      <ForecastHorizonControl
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, projectLengthYears: "42" }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "5");
    expect(screen.queryByText(/must be/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run src/components/simple-mode/forecast-horizon-control.test.tsx`
Expected: FAILS to resolve — `Cannot find module './forecast-horizon-control'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/simple-mode/forecast-horizon-control.tsx`:

```tsx
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { validateWorkloadData } from "@/lib/simple-mode/validate-workload-data";
import type { WorkloadDataValues } from "@/types/simple-mode";

const SLIDER_MIN = 1;
const SLIDER_MAX = 5;

function clampForSliderDisplay(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return SLIDER_MIN;
  return Math.min(Math.max(parsed, SLIDER_MIN), SLIDER_MAX);
}

interface ForecastHorizonControlProps {
  value: WorkloadDataValues;
  onChange: (value: WorkloadDataValues) => void;
}

export function ForecastHorizonControl({
  value,
  onChange,
}: ForecastHorizonControlProps) {
  const errorId = useId();
  const error = validateWorkloadData(value).projectLengthYears;

  function setProjectLengthYears(next: string) {
    onChange({ ...value, projectLengthYears: next });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Label className="shrink-0">Forecast Horizon</Label>
        <Slider
          value={[clampForSliderDisplay(value.projectLengthYears)]}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={1}
          onValueChange={([next]) => setProjectLengthYears(String(next))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="w-32"
        />
        <Input
          aria-label="Forecast Horizon (years)"
          value={value.projectLengthYears}
          inputMode="numeric"
          onChange={(event) => setProjectLengthYears(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="w-16 text-center font-mono"
        />
        <span className="text-muted-foreground text-sm">yrs</span>
      </div>
      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

`clampForSliderDisplay` guards the Radix `Slider`'s `value` prop specifically — see Task 5's `Progress` note and spec §6 for why an out-of-bounds/`NaN` value must never reach a Radix primitive's controlled `value` prop directly. The `<Input>` always shows the raw, uncapped string; only the visual slider position is clamped.

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/components/simple-mode/forecast-horizon-control.test.tsx`
Expected: all tests PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/forecast-horizon-control.tsx src/components/simple-mode/forecast-horizon-control.test.tsx
git commit -m "feat: add ForecastHorizonControl component"
```

---

### Task 7: `StorageBreakdown` component

**Files:**

- Create: `src/components/simple-mode/storage-breakdown.tsx`
- Test: `src/components/simple-mode/storage-breakdown.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/simple-mode/storage-breakdown.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StorageBreakdown } from "./storage-breakdown";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

function makeData(
  volumes: { diskGB: number; diskPurpose: number }[],
): CVmAgentReturnObject {
  return {
    totalStorageTB: 0,
    workspaceGB: 0,
    performanceTierImmutabilityTaxGB: 0,
    capacityTierImmutabilityTaxGB: 0,
    repoCompute: {
      compute: {
        cores: 2,
        ram: 8,
        volumes,
      },
    },
  };
}

describe("StorageBreakdown", () => {
  it("renders the grand total as — with no tier rows when data is null", () => {
    render(<StorageBreakdown data={null} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Performance")).not.toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
  });

  it("renders only the Performance tier when only its volume is present, matching the grand total", () => {
    const data = makeData([{ diskGB: 2048, diskPurpose: 3 }]);
    render(<StorageBreakdown data={data} />);

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
    // Grand total and the single tier row both read "2.0 TB" here.
    expect(screen.getAllByText("2.0 TB")).toHaveLength(2);
    // The bar actually reflects its value to Radix, not just visually via
    // the indicator's inline transform (a real bug caught in prototyping:
    // forgetting to forward `value` to ProgressPrimitive.Root left every
    // bar stuck at data-state="indeterminate").
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "data-state",
      "complete",
    );
  });

  it("renders all three tiers present in volumes[] and sums them into the grand total", () => {
    const data = makeData([
      { diskGB: 2048, diskPurpose: 3 }, // 2.0 TB
      { diskGB: 4096, diskPurpose: 13 }, // 4.0 TB
      { diskGB: 1024, diskPurpose: 4 }, // 1.0 TB
    ]);
    render(<StorageBreakdown data={data} />);

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Capacity")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    expect(screen.getByText("7.0 TB")).toBeInTheDocument(); // grand total
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run src/components/simple-mode/storage-breakdown.test.tsx`
Expected: FAILS to resolve — `Cannot find module './storage-breakdown'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/simple-mode/storage-breakdown.tsx`:

```tsx
import { Progress } from "@/components/ui/progress";
import type { CVmAgentReturnObject, Volume } from "@/types/vault-sizer-api";

const TIERS = [
  {
    key: "performance",
    label: "Performance",
    diskPurpose: 3,
    colorClassName: "bg-tier-performance",
  },
  {
    key: "capacity",
    label: "Capacity",
    diskPurpose: 13,
    colorClassName: "bg-tier-capacity",
  },
  {
    key: "archive",
    label: "Archive",
    diskPurpose: 4,
    colorClassName: "bg-tier-archive",
  },
] as const;

function findTierDiskGB(
  volumes: Volume[],
  diskPurpose: number,
): number | undefined {
  return volumes.find((volume) => volume.diskPurpose === diskPurpose)?.diskGB;
}

interface StorageBreakdownProps {
  data: CVmAgentReturnObject | null;
}

export function StorageBreakdown({ data }: StorageBreakdownProps) {
  const volumes = data?.repoCompute?.compute?.volumes ?? [];
  const tierRows = TIERS.map((tier) => ({
    ...tier,
    diskGB: findTierDiskGB(volumes, tier.diskPurpose),
  })).filter((tier) => tier.diskGB !== undefined);

  const totalGB = tierRows.reduce((sum, tier) => sum + (tier.diskGB ?? 0), 0);
  const totalTB = totalGB / 1024;

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
            const tierTB = (tier.diskGB ?? 0) / 1024;
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

Per spec Correction 1: this deliberately does **not** read `totalStorageTB` (documented as Performance-tier-only, not a grand total) or `repositoryConfig`'s `sobr.*.enabled` flags (which tier to render is derived purely from which `diskPurpose` entries the response's own `volumes[]` actually contains — one data source, not two that could disagree).

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/components/simple-mode/storage-breakdown.test.tsx`
Expected: all tests PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/storage-breakdown.tsx src/components/simple-mode/storage-breakdown.test.tsx
git commit -m "feat: add StorageBreakdown component"
```

---

### Task 8: `InfrastructureTelemetry` component

**Files:**

- Create: `src/components/simple-mode/infrastructure-telemetry.tsx`
- Test: `src/components/simple-mode/infrastructure-telemetry.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/simple-mode/infrastructure-telemetry.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import type { ComputeRequirement } from "@/types/vault-sizer-api";

describe("InfrastructureTelemetry", () => {
  it("renders cores, RAM, and throughput when compute is present", () => {
    const compute: ComputeRequirement = {
      cores: 4,
      ram: 16,
      networkThroughput: { inboundMBps: 120, outboundMBps: 80 },
    };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.getByText("Cores")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getByText("16 GB")).toBeInTheDocument();
    expect(screen.getByText("Network Throughput")).toBeInTheDocument();
    expect(screen.getByText("120 / 80 Mbps")).toBeInTheDocument();
  });

  it("renders a real 0 throughput reading distinctly from an absent one", () => {
    const compute: ComputeRequirement = {
      cores: 2,
      ram: 8,
      networkThroughput: { inboundMBps: 0, outboundMBps: 0 },
    };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.getByText("0 / 0 Mbps")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("renders — in every value cell, with all three rows present, when compute is undefined", () => {
    render(<InfrastructureTelemetry compute={undefined} />);

    expect(screen.getByText("Cores")).toBeInTheDocument();
    expect(screen.getByText("RAM")).toBeInTheDocument();
    expect(screen.getByText("Network Throughput")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("renders — for throughput specifically when networkThroughput is null but compute exists", () => {
    const compute: ComputeRequirement = {
      cores: 4,
      ram: 16,
      networkThroughput: null,
    };
    render(<InfrastructureTelemetry compute={compute} />);

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("16 GB")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run src/components/simple-mode/infrastructure-telemetry.test.tsx`
Expected: FAILS to resolve — `Cannot find module './infrastructure-telemetry'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/simple-mode/infrastructure-telemetry.tsx`:

```tsx
import type { ComputeRequirement, Throughput } from "@/types/vault-sizer-api";

function formatThroughput(throughput: Throughput | null | undefined): string {
  if (throughput == null) return "—";
  return `${throughput.inboundMBps} / ${throughput.outboundMBps} Mbps`;
}

interface InfrastructureTelemetryProps {
  compute: ComputeRequirement | null | undefined;
}

export function InfrastructureTelemetry({
  compute,
}: InfrastructureTelemetryProps) {
  const rows = [
    { label: "Cores", value: compute ? String(compute.cores) : "—" },
    { label: "RAM", value: compute ? `${compute.ram} GB` : "—" },
    {
      label: "Network Throughput",
      value: formatThroughput(compute?.networkThroughput),
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

`formatThroughput` uses `== null` (catches both `null` and `undefined`), never truthiness — a real `{ inboundMBps: 0, outboundMBps: 0 }` reading is valid data, not an absent one, and a truthy-style check would misrender it as `—`. All three rows always render structurally; only the value cells vary.

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/components/simple-mode/infrastructure-telemetry.test.tsx`
Expected: all tests PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/infrastructure-telemetry.tsx src/components/simple-mode/infrastructure-telemetry.test.tsx
git commit -m "feat: add InfrastructureTelemetry component"
```

---

### Task 9: `ProjectedSizingCard` shell

**Files:**

- Create: `src/components/simple-mode/projected-sizing-card.tsx`
- Test: `src/components/simple-mode/projected-sizing-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/simple-mode/projected-sizing-card.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
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
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("ProjectedSizingCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders both ghost placeholders", () => {
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

    expect(
      screen.getByTestId("projected-sizing-assumptions-placeholder"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("projected-sizing-actions-placeholder"),
    ).toBeInTheDocument();
  });

  it("shows a loading indicator while the initial request is in flight", () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        onChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("Recalculating")).toBeInTheDocument();
  });

  it("shows the error banner and keeps last-good data visible beneath it", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ success: true, data: mockData }))
      .mockResolvedValueOnce(
        jsonResponse(
          { success: false, error: "Upstream sizing API unreachable" },
          502,
        ),
      );

    const { rerender } = render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        onChange={() => {}}
      />,
    );

    await vi.waitFor(() =>
      expect(screen.getAllByText("18.4 TB").length).toBeGreaterThan(0),
    );

    const edited = { ...DEFAULT_WORKLOAD_DATA_VALUES, sourceSizeTB: "11" };
    act(() => {
      rerender(
        <ProjectedSizingCard
          workloadData={edited}
          repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
          onChange={() => {}}
        />,
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Upstream sizing API unreachable",
      ),
    );
    expect(screen.getAllByText("18.4 TB").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npx vitest run src/components/simple-mode/projected-sizing-card.test.tsx`
Expected: FAILS to resolve — `Cannot find module './projected-sizing-card'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/simple-mode/projected-sizing-card.tsx`:

```tsx
import { LoaderCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
import { ForecastHorizonControl } from "./forecast-horizon-control";
import { StorageBreakdown } from "./storage-breakdown";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
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

The two ghost placeholders correspond to `screen.png`'s assumptions-note box and Export Report/Save Configuration buttons — neither is functional in this task (see spec Scope). They're plain `data-testid`-only `<div>`s, not their own components, matching the existing (already-shipped) `simple-mode-sidebar-placeholder` convention this task replaces.

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/components/simple-mode/projected-sizing-card.test.tsx`
Expected: all tests PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/projected-sizing-card.tsx src/components/simple-mode/projected-sizing-card.test.tsx
git commit -m "feat: add ProjectedSizingCard component"
```

---

### Task 10: Wire `ProjectedSizingCard` into `SimpleModePage`

**Files:**

- Modify: `src/components/simple-mode/simple-mode-page.tsx`
- Modify: `src/components/simple-mode/simple-mode-page.test.tsx`

- [ ] **Step 1: Update the failing test**

In `src/components/simple-mode/simple-mode-page.test.tsx`, replace the top of the file (imports and the first test) with:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SimpleModePage } from "./simple-mode-page";

describe("SimpleModePage", () => {
  beforeEach(() => {
    // ProjectedSizingCard's useCalculatedSizing dispatches a real fetch on
    // mount; stub it so these tests don't hit the network.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the Workload Data card, the Repository Configuration card, and the Projected Sizing card", () => {
    render(<SimpleModePage />);

    expect(screen.getByText("Workload Data")).toBeInTheDocument();
    expect(screen.getByText("Repository Configuration")).toBeInTheDocument();
    expect(screen.getByText("Projected Sizing")).toBeInTheDocument();
  });
```

(the second test, `"threads live workloadData from WorkloadDataCard into BackupRepositoryCard's retention inheritance"`, is unchanged — leave it exactly as-is below this point; it now benefits from the same `beforeEach` fetch stub.)

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/components/simple-mode/simple-mode-page.test.tsx`
Expected: FAILS — `screen.getByText("Projected Sizing")` finds no match; the placeholder div is still what's rendered.

- [ ] **Step 3: Wire the component into the page**

In `src/components/simple-mode/simple-mode-page.tsx`, add the import:

```ts
import { ProjectedSizingCard } from "./projected-sizing-card";
```

(alongside the existing `WorkloadDataCard`/`BackupRepositoryCard` imports.)

Replace the sidebar placeholder block:

```tsx
<div className="lg:col-span-4">
  <div
    data-testid="simple-mode-sidebar-placeholder"
    className="border-border h-full min-h-40 rounded-lg border border-dashed"
  />
</div>
```

with:

```tsx
<div className="lg:col-span-4">
  <ProjectedSizingCard
    workloadData={workloadData}
    repositoryConfig={repositoryConfig}
    onChange={setWorkloadData}
  />
</div>
```

- [ ] **Step 4: Run the tests, verify all pass**

Run: `npx vitest run src/components/simple-mode/simple-mode-page.test.tsx`
Expected: both tests PASS.

- [ ] **Step 5: Run the full suite, typecheck, lint, and build**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.app.json && npx eslint . && npm run build`
Expected: all four succeed — 191 tests passing across 21 test files, no type errors, no lint errors, successful production build.

- [ ] **Step 6: Commit**

```bash
git add src/components/simple-mode/simple-mode-page.tsx src/components/simple-mode/simple-mode-page.test.tsx
git commit -m "$(cat <<'EOF'
feat: replace Simple Mode sidebar placeholder with ProjectedSizingCard

Wires the live sizing canvas into the page for the first time —
Simple Mode's Direct-to-Vault path now shows real tier storage and
compute figures instead of an empty dashed placeholder.
EOF
)"
```

---

## Manual verification (do this after Task 10, before considering the feature complete)

Automated tests cover behavior; they don't confirm the UI actually looks and feels right. Run `npm run dev`, open the app, and check:

1. On load, the right-hand card shows "Projected Sizing" with real numbers within ~1 second (no long blank/loading state) — Performance/Capacity/Archive rows should match what's configured in the left-column cards.
2. Drag the Forecast Horizon slider and type a value like `10` directly into its input — confirm the slider thumb visually pins at its rightmost position while the input still shows `10`, and that the sizing numbers below update within about half a second of the last interaction (not on every single drag frame).
3. **Empirical check flagged in spec review, not yet verified against the real upstream API**: confirm that changing the Forecast Horizon actually changes the _storage_ totals, not just the compute (cores/RAM) figures. The spec sets `growthFactor` from `yearlyGrowthPercent` (ADR-0018) precisely so storage growth has a rate to compound over `projectLength`, but this hasn't been checked against the live `https://calculator.veeam.com/vse/api/VmAgent` endpoint. If storage totals don't respond to the horizon control, `growthFactor`'s mapping needs re-examination — this would be a genuine follow-up, not a regression in this task's own logic.
4. Trigger an error (e.g., open dev tools, throttle/block network momentarily while editing a field) and confirm the red error banner appears while the last-known-good numbers stay visible underneath it, then confirm the banner clears on the next successful recalculation.
5. Toggle Backup Copy in the left column and confirm the right-hand card shows a plain error message (not a crash, not a `501`) — this path isn't implemented yet (ADR-0007).
6. Confirm both dashed ghost-placeholder boxes render below the telemetry table and are visually distinguishable from the working content above them.

---

## Self-Review

**Spec coverage:** every numbered section of the design doc (§1 data model, §2 validation, §3 request plumbing incl. ADR-0016/0018, §4 no-op type note, §5 hook incl. ADR-0017, §6 all four UI components + both primitives + ghost placeholders, §7 primitives, §8 loading/error treatment) maps to a task above. The four "Corrections from the brief" are all reflected in the implementation (Correction 1 → Task 7's `volumes[]`-only sourcing; Correction 2 → Task 4's generic error-message handling; Correction 3 → explicitly _not_ modifying `vault-sizer-api.ts`, called out in File Structure; Correction 4 → Task 7's `tier-*` token usage).

**Placeholder scan:** no TBD/TODO markers. The one open item (manual-verification step 3, whether `growthFactor` actually moves storage totals against the real API) is explicitly flagged as a post-implementation empirical check, not a gap in this plan's own code.

**Type consistency:** `WorkloadDataValues`, `RepositoryConfigValues`, `CVmAgentReturnObject`, `ComputeRequirement`, `Throughput`, `Volume` are used identically (names, shapes) across every task — checked against the actual current source of each file before writing this plan, not from memory.
