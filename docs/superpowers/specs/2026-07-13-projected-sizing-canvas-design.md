# Projected Sizing Canvas & `useCalculatedSizing` Hook — Design

**Branch:** `frontend-integration-sizing-canvas`
**Sources:** Phase 3 Task 2 brief (chat-transcribed, not committed to the repo), `docs/research/2026-07-10-vmagent-swagger-api.md` (Swagger audit), `docs/superpowers/specs/2026-07-10-bff-sizing-gateway-schema-realignment-design.md` (Task 1)

## Purpose

Task 1 delivered a correct `buildVmAgentRequest` transformer, a normalized error envelope, and a working `functions/api/vault-sizer.ts` proxy — but nothing in the UI calls any of it yet. `simple-mode-page.tsx`'s right column is still an empty dashed placeholder (`data-testid="simple-mode-sidebar-placeholder"`).

This task replaces that placeholder with a live **Projected Sizing** card: a reactive `useCalculatedSizing` hook that debounces and race-guards calls to the existing `callVaultSizerApi`, a new **Forecast Horizon** control that feeds `projectLength` into the sizing request for the first time, and a tier-by-tier storage/telemetry breakdown rendered from the response.

## Scope

**In scope:** the `useCalculatedSizing` hook; a `projectLengthYears` field threaded through `WorkloadDataValues` → `buildVmAgentRequest`; an `AbortSignal` parameter on `callVaultSizerApi`; four new components (`ProjectedSizingCard`, `ForecastHorizonControl`, `StorageBreakdown`, `InfrastructureTelemetry`); two new `ui/` primitives (`slider.tsx`, `progress.tsx`); one additive type fix (`networkThroughput` on `ComputeRequirement`).

**Out of scope:** Backup Copy sizing (still throws per ADR-0007 — the hook surfaces that as a generic error string, nothing more); a "monthly API transactions" telemetry row (in the original brief, dropped from the updated brief's telemetry bullet — see Correction 4); changing `functions/api/vault-sizer.ts`'s status codes; any density-mode ("Compact") toggle for the telemetry table, since no density-mode system exists anywhere in the codebase yet to hook into.

## Corrections from the brief

Four places where the brief's literal instructions don't match the actual codebase/contract, resolved against primary sources before writing the rest of this spec:

1. **"Total Storage Header ← `totalStorageTB`" is wrong.** `totalStorageTB` is documented (`vault-sizer-api.ts:203`, confirmed against the Swagger research note) as Performance-tier-only — "not a grand total across tiers." `screen.png`'s own numbers confirm this: 4.2 TB (Performance) + 14.2 TB (Capacity) = 18.4 TB (Total), a sum, not a field. The grand total and all three tier values instead derive from `repoCompute.compute.volumes[].diskGB`, grouped by `diskPurpose` (3=Performance, 13=Capacity, 4=Archive) — see §5.
2. **There is no `501` anywhere in this codebase.** `functions/api/vault-sizer.ts` returns HTTP 400 with a plain message when `buildVmAgentRequest` throws for `backupPath === "copy"`. The hook treats this like any other error-envelope message; no status-code special-casing.
3. **`networkThroughput` isn't modeled on `ComputeRequirement` yet**, even though it's on the wire (Swagger research note, Discrepancy 7) and is the only field that could mean the brief's "background bandwidth." Added in §4.
4. **Tier bar colors follow `DESIGN-v3`'s tokens, not `screen.png`'s.** The mockup shows both Performance and Capacity bars in the same green; CLAUDE.md is explicit that Stitch's `tier-performance`/`tier-capacity`/`tier-archive` tokens (green/blue/gray) override any other palette reference, including this older screenshot.

## Architecture

```
SimpleModePage (owns workloadData, repositoryConfig state — unchanged)
        │  props: workloadData, repositoryConfig, onWorkloadDataChange
        ▼
ProjectedSizingCard
        │  calls useCalculatedSizing(workloadData, repositoryConfig) internally
        │
        ├─ ForecastHorizonControl        (Slider + Input → onWorkloadDataChange)
        ├─ [loading indicator / error banner]
        ├─ StorageBreakdown(data)         (tier bars + grand total, from repoCompute.volumes)
        └─ InfrastructureTelemetry(data?.proxyCompute?.compute)   (cores / RAM / throughput)
```

`useCalculatedSizing` internally validates (`validateWorkloadData` / `validateRepositoryConfig`, same functions the left-column cards already call), then debounces, then calls `callVaultSizerApi(workloadData, repositoryConfig, signal)`. `ProjectedSizingCard` owns the hook call itself — `SimpleModePage` stays as unaware of it as it already is of each card's internal validation, keeping the parent a thin plumbing layer.

## 1. `WorkloadDataValues` — `src/types/simple-mode.ts`

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
  projectLengthYears: string; // NEW
}

export const DEFAULT_WORKLOAD_DATA_VALUES: WorkloadDataValues = {
  // ...existing fields unchanged
  projectLengthYears: "1", // matches today's implicit growthRateScopeYears=1 behavior
};
```

It lives here — not in a new standalone state slice — because it's sizing-input data like every other `WorkloadDataValues` field; only its _control_ happens to render in the right canvas rather than the `WorkloadDataCard` grid. `buildVmAgentRequest` already takes the whole `workloadData` object, so no new function parameter is needed.

## 2. Validation — `src/lib/simple-mode/validate-workload-data.ts`

```ts
const FIELD_RULES: { key: keyof WorkloadDataValues; rules: NumberRules }[] = [
  // ...existing entries unchanged
  { key: "projectLengthYears", rules: { integer: true, min: 1, max: 100 } },
];
```

`min: 1` is deliberate, not just "positive": the upstream API treats `projectLength: 0` as "fall back to `growthRateScopeYears`" (Swagger), and once this control exists we always want to send an explicit value, never that sentinel. `max: 100` matches the Swagger's documented bound.

This validation isn't wired into any on-screen error text for this field — see §6's `ForecastHorizonControl` notes for why.

## 3. Request plumbing

**`build-vm-agent-request.ts`** — no signature change, one new field in the returned object:

```ts
projectLength: Number(workloadData.projectLengthYears),
```

`growthRateScopeYears` stays hardcoded at `1`: per the Swagger, it drives _proxy compute_ growth-years, a separate concern from `projectLength`'s _storage-sizing_ horizon — setting one doesn't need to touch the other.

**`vault-sizer-client.ts`** — add an optional `signal`:

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
  // ...unchanged
}
```

**`functions/api/vault-sizer.ts`** — no changes. Cancellation happens between the browser and the Function; an aborted client fetch never reaches it in a way that needs handling.

## 4. Type fix — `src/types/vault-sizer-api.ts`

```ts
export interface ComputeRequirement {
  name?: string | null;
  site?: Location | null;
  cores: number;
  ram: number;
  volumes?: Volume[] | null;
  networkThroughput?: Throughput | null; // NEW — already on the wire, per Swagger research note
}
```

## 5. `useCalculatedSizing` — `src/hooks/use-calculated-sizing.ts`

```ts
interface CalculatedSizing {
  data: CVmAgentReturnObject | null;
  isLoading: boolean;
  error: string | null;
}

function useCalculatedSizing(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): CalculatedSizing;
```

Filename/export follow the existing `use-theme.ts` convention (kebab-case file, camelCase export) — the brief's `useCalculatedSizing.ts` casing is corrected here.

**Validation gate.** Before debouncing anything, runs `validateWorkloadData(workloadData)` and `validateRepositoryConfig(repositoryConfig, workloadData)` — the same functions `WorkloadDataCard`/`BackupRepositoryCard` already call for their own field errors. If either returns any errors, the hook skips the network call entirely: `isLoading` goes `false`, `error` stays `null`, and `data` holds whatever the last successful result was. Rationale: no point round-tripping a field the user is mid-typing, and no need for a second, competing error banner when the inline field error already says what's wrong.

**Debounce.** One `useEffect` keyed on `[workloadData, repositoryConfig]`. First run (mount) fires immediately — no artificial delay before the initial result. Every later change goes through a 500ms `setTimeout`.

**Race/stale defense, two layers:**

- `AbortController`, created per debounced attempt. The effect's cleanup calls `.abort()` and `clearTimeout()`, canceling a superseded in-flight request and any still-pending timer. A rejection where `controller.signal.aborted` is true is swallowed — it's supersession, not failure.
- A monotonically incrementing `requestId` ref as a second guard: after `await`, the settled branch only calls `setState` if its `requestId` still matches the latest, covering the edge case where a response resolves in the same tick `abort()` was called too late to prevent it.

**Loading semantics.** `isLoading` flips `true` synchronously the moment the effect re-runs (on the keystroke itself, not after the debounce delay elapses) and back to `false` only when the _latest_ request settles — one continuous "recalculating" state across debounce + network, no flicker.

**Error semantics.** Any non-abort rejection sets `error` to the envelope's message string; `data` is left as the last good value, so the canvas keeps showing the last valid sizing underneath the error banner rather than blanking.

```ts
function useCalculatedSizing(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): CalculatedSizing {
  const [state, setState] = useState<CalculatedSizing>({
    data: null,
    isLoading: false,
    error: null,
  });
  const latestRequestId = useRef(0);
  const hasRunRef = useRef(false); // tracks "has any dispatch fired yet", independent of requestId

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

    const timeoutId = isFirstRun ? undefined : setTimeout(dispatch, 500);
    if (isFirstRun) void dispatch();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      controller.abort();
    };
  }, [workloadData, repositoryConfig]);

  return state;
}
```

## 6. UI components

**`ProjectedSizingCard`** (`src/components/simple-mode/projected-sizing-card.tsx`) — the shell replacing the sidebar placeholder in `simple-mode-page.tsx`. Props: `workloadData`, `repositoryConfig`, `onWorkloadDataChange`. Calls `useCalculatedSizing` itself; composes the three components below plus the loading/error banner (§7).

**`ForecastHorizonControl`** — shadcn `<Slider>` (range 1–5) + shadcn `<Input>` (uncapped integer), both bound to `workloadData.projectLengthYears`, both calling `onWorkloadDataChange({ ...workloadData, projectLengthYears: next })`. The slider's thumb position clamps to its `[1,5]` track for display; the input's raw value (e.g. `10`) is what actually flows into the hook/API — this is the "adjusts or pins gracefully" behavior from the brief. No inline error text for out-of-range/non-numeric keystrokes; the control just clamps/ignores them locally rather than routing through `WorkloadDataErrors` (which nothing currently surfaces for a field this card doesn't render).

**Clamping guard (Radix specifics):** Radix's `SliderPrimitive.Root` does not clamp an out-of-bounds controlled `value` prop itself — passing `11` against a `max={5}` produces a >100% position calculation, which can render the thumb outside the track or, for a non-finite input (`NaN`, from a mid-edit empty string), produce an invalid transform. `slider.tsx` stays a thin, unopinionated wrapper with no business logic, matching every other `ui/` primitive in this repo (e.g. `switch.tsx` just forwards props) — so this guard belongs in `ForecastHorizonControl`, not the primitive. It computes the value passed to `<Slider value={[...]}>` through a local helper, separate from the raw string shown in the `<Input>`:

```ts
function clampForSliderDisplay(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return SLIDER_MIN;
  return Math.min(Math.max(parsed, SLIDER_MIN), SLIDER_MAX);
}
```

This absorbs empty-string/non-numeric input (`NaN` → `SLIDER_MIN`), negative values, and overflow (`10` → `SLIDER_MAX`) before Radix ever sees them — the `<Input>` itself still displays and propagates the uncapped raw value.

**`StorageBreakdown`** — takes only `data: CVmAgentReturnObject | null`, deliberately not `repositoryConfig`. Whether the Capacity/Archive rows render at all is derived from whether `repoCompute.compute.volumes` contains an entry for `diskPurpose` 13 / 4 — not from reading `repositoryConfig.sobr.*.enabled`. The response is the ground truth of what was actually sized; keying off it means one data source instead of two that could disagree. Grand total and each tier's TB value come from summing/reading `volumes[].diskGB` (÷1024), per Correction 1. Bars use `tier-performance`/`tier-capacity`/`tier-archive` tokens, per Correction 4.

**`InfrastructureTelemetry`** — takes `data?.proxyCompute?.compute`. A compact table with **three fixed rows** — Cores, RAM, Network Throughput — that always render structurally; only the value cells vary. Handles `undefined`/`null` `compute` (before the first response resolves) by rendering `—` in every value cell, not an error.

**Throughput nullability:** `networkThroughput` is `Throughput | null | undefined`, and a legitimate `0` (zero inbound/outbound bandwidth) is a valid, meaningful value — not the same as "absent." Formatting must use an explicit presence check, not truthiness, or a real `0` gets misrendered as missing:

```ts
function formatThroughput(throughput: Throughput | null | undefined): string {
  if (throughput == null) return "—";
  return `${throughput.inboundMBps} / ${throughput.outboundMBps} Mbps`;
}
```

The row itself is never conditionally omitted based on the value — only ever based on whether `compute` exists at all (i.e., before the first successful response).

All numeric values across these three components (TB, cores, GB RAM, Mbps) render in `font-mono` (JetBrains Mono), per CLAUDE.md's rule that alignment-sensitive numeric data uses the mono typeface, not Inter.

## 7. New `ui/` primitives

`src/components/ui/slider.tsx` and `src/components/ui/progress.tsx` don't exist yet. Both are hand-authored wrappers over the already-installed `radix-ui` package, following the exact pattern `switch.tsx` uses (`data-slot` attributes, `cn()` class merging, Tailwind v4 tokens) — not pulled in via a component-library import, consistent with how every other `ui/` primitive in this repo is built.

## 8. Loading & error treatment

- **Loading:** a small inline indicator next to the "Projected Sizing" header when `isLoading` is true. Last-good numbers stay visible underneath — no skeleton replacing them — matching the hook's "keep stale data visible" behavior. Before the very first response ever lands, `StorageBreakdown`/`InfrastructureTelemetry` render their empty/dash state with just the loading indicator active.
- **Error:** a bordered inline `<div role="alert">` (existing design tokens, not a new `ui/alert.tsx` — this is a single one-off banner, not a reusable pattern) between the header and the breakdown, shown whenever `error` is non-null. Last-good data stays visible below it. Clears automatically on the next successful request — no separate dismiss state.
- Validation-gated skips produce **no banner** — the inline field errors already visible in the left-column cards are the only signal.

## Testing & verification

`src/hooks/use-calculated-sizing.test.ts` — `vi.useFakeTimers()` + `renderHook` + `vi.stubGlobal("fetch", vi.fn())`, matching `vault-sizer-client.test.ts`'s existing style:

1. Fires immediately on mount, no debounce delay.
2. Rapid consecutive re-renders within the 500ms window collapse to exactly one `fetch` call, carrying the last render's values.
3. `isLoading` is `true` synchronously on a value change, `false` once the request settles.
4. Race defense: an older request resolving after a newer one — final state reflects the newer response; the older request's controller is aborted.
5. Non-abort rejection sets `error`, leaves prior `data` intact.
6. Abort-triggered rejection leaves `error` as `null`.
7. Invalid input (e.g. blank `sourceSizeTB`) never calls `fetch`.
8. Changing only `projectLengthYears` triggers a recalculation whose outbound request body carries the updated `projectLength`.

Component tests (RTL + `user-event`): `storage-breakdown.test.tsx` (tier rows appear/disappear based on `volumes[]` presence; total equals the sum), `forecast-horizon-control.test.tsx` (slider/input both update `projectLengthYears`; out-of-range input pins the slider but keeps the raw value; empty-string/negative/non-numeric keystrokes produce no console error/warning and `clampForSliderDisplay` resolves to an in-bounds number), `infrastructure-telemetry.test.tsx` (renders cores/RAM/throughput; `networkThroughput` of `{ inboundMBps: 0, outboundMBps: 0 }` renders `"0 / 0 Mbps"`, not `—`; `null`/`undefined` `networkThroughput` or `compute` renders `—` in the value cells while all three rows remain present), `projected-sizing-card.test.tsx` (loading indicator, error banner, stale-data-preserved-under-error).

Existing files get small additions: `build-vm-agent-request.test.ts` (`projectLength` populated from the new field), `validate-workload-data.test.ts` (new field's rule), `vault-sizer-client.test.ts` (`signal` forwarded to `fetch`).

`npx tsc --noEmit -p tsconfig.app.json` — no type errors from the `networkThroughput` addition or the new `WorkloadDataValues` field across every existing call site.

## Follow-up work (not this task)

- Backup Copy sizing (ADR-0007) — the hook surfaces its 400 as a generic error string; no dedicated UI for it.
- A "monthly API transactions" telemetry row, if still wanted despite the updated brief dropping it (Correction 4/Scope).
- Any density-mode ("Compact") system — CLAUDE.md documents it as a future concept; nothing in the codebase implements it yet, so `InfrastructureTelemetry` just uses naturally compact styling, not a toggle.
