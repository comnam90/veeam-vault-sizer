# Projected Sizing Canvas & `useCalculatedSizing` Hook — Design

**Branch:** `frontend-integration-sizing-canvas`
**Sources:** Phase 3 Task 2 brief (chat-transcribed, not committed to the repo), `docs/research/2026-07-10-vmagent-swagger-api.md` (Swagger audit), `docs/superpowers/specs/2026-07-10-bff-sizing-gateway-schema-realignment-design.md` (Task 1)

## Purpose

Task 1 delivered a correct `buildVmAgentRequest` transformer, a normalized error envelope, and a working `functions/api/vault-sizer.ts` proxy — but nothing in the UI calls any of it yet. `simple-mode-page.tsx`'s right column is still an empty dashed placeholder (`data-testid="simple-mode-sidebar-placeholder"`).

This task replaces that placeholder with a live **Projected Sizing** card: a reactive `useCalculatedSizing` hook that debounces and race-guards calls to the existing `callVaultSizerApi`, a new **Forecast Horizon** control that feeds `projectLength` into the sizing request for the first time, and a tier-by-tier storage/telemetry breakdown rendered from the response.

## Scope

**In scope:** the `useCalculatedSizing` hook; a `projectLengthYears` field threaded through `WorkloadDataValues` → `buildVmAgentRequest`, feeding both `projectLength` (storage-sizing horizon) and `growthRateScopeYears` (proxy-compute growth horizon — see §3); an `AbortSignal` parameter on `callVaultSizerApi`; four new components (`ProjectedSizingCard`, `ForecastHorizonControl`, `StorageBreakdown`, `InfrastructureTelemetry`); two non-functional ghost placeholders inside `ProjectedSizingCard` marking the assumptions-note box and Export Report/Save Configuration actions as still-to-build (see §6); two new `ui/` primitives (`slider.tsx`, `progress.tsx`); one additive type fix (`networkThroughput` on `ComputeRequirement`).

**Out of scope:** Backup Copy sizing (still throws per ADR-0007 — the hook surfaces that as a generic error string, nothing more); a "monthly API transactions" telemetry row (in the original brief, dropped from the updated brief's telemetry bullet — see Correction 4); changing `functions/api/vault-sizer.ts`'s status codes; any density-mode ("Compact") toggle for the telemetry table, since no density-mode system exists anywhere in the codebase yet to hook into; the _functionality_ of the assumptions-note text box and Export Report/Save Configuration actions visible in `screen.png` — nothing in this task backs them, so they're represented only as the ghost placeholders above.

## Corrections from the brief

Four places where the brief's literal instructions don't match the actual codebase/contract, resolved against primary sources before writing the rest of this spec:

1. **"Total Storage Header ← `totalStorageTB`" is wrong.** `totalStorageTB` is documented (`vault-sizer-api.ts:203`, confirmed against the Swagger research note) as Performance-tier-only — "not a grand total across tiers." `screen.png`'s own numbers confirm this: 4.2 TB (Performance) + 14.2 TB (Capacity) = 18.4 TB (Total), a sum, not a field. The grand total and all three tier values instead derive from `repoCompute.compute.volumes[].diskGB`, grouped by `diskPurpose` (3=Performance, 13=Capacity, 4=Archive) — see §5.
2. **There is no `501` anywhere in this codebase.** `functions/api/vault-sizer.ts` returns HTTP 400 with a plain message when `buildVmAgentRequest` throws for `backupPath === "copy"`. The hook treats this like any other error-envelope message; no status-code special-casing.
3. **`networkThroughput` isn't modeled on `ComputeRequirement` yet**, even though it's on the wire (Swagger research note, Discrepancy 7) and is the only field that could mean the brief's "background bandwidth." Added in §4.
4. **Tier bar colors follow `DESIGN-v3`'s tokens, not `screen.png`'s.** The mockup shows both Performance and Capacity bars in the same green; CLAUDE.md is explicit that Stitch's `tier-performance`/`tier-capacity`/`tier-archive` tokens (green/blue/gray) override any other palette reference, including this older screenshot.

## Architecture

```
SimpleModePage (owns workloadData, repositoryConfig state — unchanged)
        │  props: workloadData, repositoryConfig, onChange
        ▼
ProjectedSizingCard
        │  calls useCalculatedSizing(workloadData, repositoryConfig) internally
        │
        ├─ ForecastHorizonControl        (Slider + Input → onChange; inline error from validateWorkloadData)
        ├─ [loading indicator / error banner]
        ├─ StorageBreakdown(data)         (grand total + tier bars, from repoCompute.volumes)
        ├─ InfrastructureTelemetry(data?.proxyCompute?.compute)   (cores / RAM / throughput)
        ├─ [ghost placeholder: assumptions note]                 — non-functional, out of scope
        └─ [ghost placeholder: Export Report / Save Configuration] — non-functional, out of scope
```

`useCalculatedSizing` internally validates (`validateWorkloadData` / `validateRepositoryConfig`, same functions the left-column cards already call), then debounces, then calls `callVaultSizerApi(workloadData, repositoryConfig, signal)`. `ProjectedSizingCard` owns the hook call itself — `SimpleModePage` stays as unaware of it as it already is of each card's internal validation, keeping the parent a thin plumbing layer. The callback prop is named `onChange`, not `onWorkloadDataChange`, to match `WorkloadDataCard`/`BackupRepositoryCard`'s existing convention — both are also a single controlled value plus a change callback, and nothing in this task's scope writes to `repositoryConfig` from this card, so there's no second value to justify a more specific name yet.

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
  projectLengthYears: "1", // preserves today's growthRateScopeYears=1 default (both now derive from this field — see §3)
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

This validation **is** wired into on-screen error text — see §6's `ForecastHorizonControl` notes. Leaving it silent would mean an invalid `projectLengthYears` (blank, `0`, non-numeric, `>100`) silently blocks `useCalculatedSizing`'s network call (§5's validation gate) with no visible explanation anywhere, since this field renders nowhere else in the left-column cards to surface an error for it.

## 3. Request plumbing

**`build-vm-agent-request.ts`** — no signature change; two fields in the returned object now derive from the same new value:

```ts
growthRateScopeYears: Number(workloadData.projectLengthYears),
projectLength: Number(workloadData.projectLengthYears),
```

The previously-hardcoded `GROWTH_RATE_SCOPE_YEARS = 1` constant is removed. Per the Swagger, `growthRateScopeYears` drives _proxy compute_ growth-years while `projectLength` drives the _storage-sizing_ horizon — genuinely separate pipelines — but this task is the first place either becomes an interactive, user-facing "horizon" control (`ForecastHorizonControl`). Leaving `growthRateScopeYears` pinned at `1` while `projectLength` scales up to 100 years would mean `InfrastructureTelemetry`'s cores/RAM/throughput numbers — exposed for the first time by this same task — silently stop reflecting the horizon the user is looking at, which reads as a bug rather than a deliberate scope boundary. Sharing one input value is safe: `growthRateScopeYears`'s own declared range (`0`–`100`) matches `projectLength`'s, so no new validation is needed beyond §2's existing rule. See ADR-0016 and CONTEXT.md's "Forecast Horizon" entry.

A third field follows the same pattern, on the _rate_ axis rather than the _years_ axis:

```ts
growthFactor: Number(workloadData.yearlyGrowthPercent),
```

`growthRatePercent` (proxy-compute growth rate) has always been populated from `workloadData.yearlyGrowthPercent`; `growthFactor` (storage/GFS growth rate — same `0`–`100` percentage scale) was left unset by Task 1 to rely on its documented fallback to `growthRatePercent`. That fallback means today's behavior is already "correct" by coincidence, but only because nothing in this codebase records that the two are linked — a future change to either field independently would silently desync them. Setting `growthFactor` explicitly from the same input it already implicitly falls back to closes that gap, mirroring `growthRateScopeYears`/`projectLength` above: one existing UI value now explicitly drives two independently-modeled sizing pipelines' rate inputs, not just their horizon inputs. See ADR-0018.

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

**Strict Mode limitation (accepted, not fixed).** `main.tsx` wraps the app in `<StrictMode>`, which double-invokes this effect in development (mount → cleanup → mount) without resetting refs between invocations. The throwaway first invocation flips `hasRunRef.current` to `true` before its own cleanup runs, so the second, surviving invocation sees `isFirstRun === false` and routes the genuine initial load through the 500ms debounce instead of firing immediately — a ~500ms delay before the first sizing result appears, in `npm run dev` only (Strict Mode's double-invoke doesn't happen in production builds, and isn't exercised by `renderHook`-based tests either). An earlier draft of this spec tried to patch this by resetting `hasRunRef.current` to `false` in cleanup whenever the invocation being cleaned up was the first run. That's broken: cleanup runs before _every_ effect re-run, not just Strict Mode's synthetic one, so it resets the ref on every real edit too — `isFirstRun` becomes perpetually `true`, and the 500ms debounce never fires again for the rest of the session (traceable against test #2's rapid-edits-collapse-to-one-fetch case, which the patched version fails). The narrower alternative — flipping `hasRunRef.current` to `true` only inside the dispatch's success branch instead of synchronously before dispatching — does survive Strict Mode without that regression, but adds its own edge case (an edit made before the very first request resolves also bypasses the debounce) and real complexity for a symptom that's cosmetic and dev-only. This spec accepts the ~500ms dev-only delay rather than take on that risk for no production benefit. See ADR-0017.

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

**`ProjectedSizingCard`** (`src/components/simple-mode/projected-sizing-card.tsx`) — the shell replacing the sidebar placeholder in `simple-mode-page.tsx`. Props: `workloadData`, `repositoryConfig`, `onChange`. Calls `useCalculatedSizing` itself; composes `ForecastHorizonControl`, the loading/error banner (§8), `StorageBreakdown`, `InfrastructureTelemetry`, and the two ghost placeholders described below.

**`ForecastHorizonControl`** — shadcn `<Slider>` (range 1–5) + shadcn `<Input>` (uncapped integer), both bound to `workloadData.projectLengthYears`, both calling `onChange({ ...workloadData, projectLengthYears: next })`. The slider's thumb position clamps to its `[1,5]` track for display; the input's raw value (e.g. `10`) is what actually flows into the hook/API — this is the "adjusts or pins gracefully" behavior from the brief. Below the control, an inline error (same presentation as `WorkloadField`'s error paragraph elsewhere in this app) renders from `validateWorkloadData(workloadData).projectLengthYears` whenever the raw value is genuinely invalid — blank, non-numeric, `0`, negative, or `>100`. An earlier draft of this spec left the field silent on invalid input instead; that would let `useCalculatedSizing`'s validation gate (§5) skip recalculation with no visible explanation anywhere, since this field renders nowhere else. The clamped slider display and the inline error are independent: a value like `42` is valid (no error) but still pins the slider thumb to `SLIDER_MAX`; only a value `validateWorkloadData` actually rejects shows the error.

**Clamping guard (Radix specifics):** Radix's `SliderPrimitive.Root` does not clamp an out-of-bounds controlled `value` prop itself — passing `11` against a `max={5}` produces a >100% position calculation, which can render the thumb outside the track or, for a non-finite input (`NaN`, from a mid-edit empty string), produce an invalid transform. `slider.tsx` stays a thin, unopinionated wrapper with no business logic, matching every other `ui/` primitive in this repo (e.g. `switch.tsx` just forwards props) — so this guard belongs in `ForecastHorizonControl`, not the primitive. It computes the value passed to `<Slider value={[...]}>` through a local helper, separate from the raw string shown in the `<Input>`:

```ts
function clampForSliderDisplay(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return SLIDER_MIN;
  return Math.min(Math.max(parsed, SLIDER_MIN), SLIDER_MAX);
}
```

This absorbs empty-string/non-numeric input (`NaN` → `SLIDER_MIN`), negative values, and overflow (`10` → `SLIDER_MAX`) before Radix ever sees them — the `<Input>` itself still displays and propagates the uncapped raw value.

**`StorageBreakdown`** — takes only `data: CVmAgentReturnObject | null`, deliberately not `repositoryConfig`. Whether the Capacity/Archive rows render at all is derived from whether `repoCompute.compute.volumes` contains an entry for `diskPurpose` 13 / 4 — not from reading `repositoryConfig.sobr.*.enabled`. The response is the ground truth of what was actually sized; keying off it means one data source instead of two that could disagree. Grand total and each tier's TB value come from summing/reading `volumes[].diskGB` (÷1024), per Correction 1. Each tier row's bar is a shadcn `<Progress>` instance (value = that tier's % of the grand total), filled with the matching `tier-performance`/`tier-capacity`/`tier-archive` token per Correction 4 — this is `progress.tsx`'s only call site in this task.

**Loading state.** Before the very first response resolves (`data === null`), only the grand-total line renders, showing `—`; no tier rows render at all, since — per the paragraph above — row presence is meant to come only from the response's own `volumes[]`, and faking rows from `repositoryConfig` during the loading window would reopen exactly the two-disagreeing-sources problem this component's design otherwise avoids. Once the first response lands, the grand total updates and however many tier rows apply (1–3) appear beneath it.

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

**Ghost placeholders.** Two non-functional, inline `<div>`s render at the bottom of `ProjectedSizingCard`, after `InfrastructureTelemetry` — a small dashed-border box roughly the height of `screen.png`'s assumptions-note info box, and a second one roughly the height of its Export Report/Save Configuration button row. Both are unlabeled, matching the existing (already-shipped) `data-testid="simple-mode-sidebar-placeholder"` convention in `simple-mode-page.tsx`, and carry their own `data-testid`s (e.g. `projected-sizing-assumptions-placeholder`, `projected-sizing-actions-placeholder`) rather than being separate components — two static dashed boxes don't warrant their own files. They're placed after the real, functioning content (not interleaved between `StorageBreakdown` and `InfrastructureTelemetry`, even though that's `screen.png`'s vertical order) so the "not built yet" signal stays grouped at the end rather than breaking up working pieces. They exist purely so the page visibly shows there's more to complete here, without implying either element works.

## 7. New `ui/` primitives

`src/components/ui/slider.tsx` and `src/components/ui/progress.tsx` don't exist yet. Both are hand-authored wrappers over the already-installed `radix-ui` package, following the exact pattern `switch.tsx` uses (`data-slot` attributes, `cn()` class merging, Tailwind v4 tokens) — not pulled in via a component-library import, consistent with how every other `ui/` primitive in this repo is built.

## 8. Loading & error treatment

- **Loading:** a small inline indicator next to the "Projected Sizing" header when `isLoading` is true. Last-good numbers stay visible underneath — no skeleton replacing them — matching the hook's "keep stale data visible" behavior. Before the very first response ever lands, `StorageBreakdown` shows only its grand-total line as `—` with no tier rows, and `InfrastructureTelemetry` renders its three fixed rows with `—` in every value cell — see §6 for why those two "empty" states aren't the same shape.
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
8. Changing only `projectLengthYears` triggers a recalculation whose outbound request body carries the updated `projectLength` (and `growthRateScopeYears` — see §3).
9. Changing only `yearlyGrowthPercent` triggers a recalculation whose outbound request body carries the updated `growthFactor` alongside `growthRatePercent` (see §3, ADR-0018).

No test targets the Strict Mode dev-only delay described in §5 — it's an accepted limitation, not a guaranteed behavior, and `renderHook` doesn't reproduce Strict Mode's double-invoke by default anyway.

Component tests (RTL + `user-event`): `storage-breakdown.test.tsx` (tier rows appear/disappear based on `volumes[]` presence; total equals the sum; `data === null` renders the grand total as `—` with no tier rows), `forecast-horizon-control.test.tsx` (slider/input both update `projectLengthYears`; out-of-range input pins the slider but keeps the raw value; empty-string/negative/non-numeric keystrokes produce no console error/warning, `clampForSliderDisplay` resolves to an in-bounds number, and an inline error renders for genuinely invalid raw values), `infrastructure-telemetry.test.tsx` (renders cores/RAM/throughput; `networkThroughput` of `{ inboundMBps: 0, outboundMBps: 0 }` renders `"0 / 0 Mbps"`, not `—`; `null`/`undefined` `networkThroughput` or `compute` renders `—` in the value cells while all three rows remain present), `projected-sizing-card.test.tsx` (loading indicator, error banner, stale-data-preserved-under-error, both ghost placeholders present).

Existing files get small additions: `build-vm-agent-request.test.ts` (`projectLength` and `growthRateScopeYears` both populated from the new field — including updating the existing assertion that hardcoded `growthRateScopeYears` to `1`, plus a case with a non-default `projectLengthYears` proving both fields track it; `growthFactor` populated from `yearlyGrowthPercent` alongside the already-tested `growthRatePercent` — including updating the existing assertion that `growthFactor` is `toBeUndefined()`), `validate-workload-data.test.ts` (new field's rule), `vault-sizer-client.test.ts` (`signal` forwarded to `fetch`).

`npx tsc --noEmit -p tsconfig.app.json` — no type errors from the `networkThroughput` addition or the new `WorkloadDataValues` field across every existing call site.

## Follow-up work (not this task)

- Backup Copy sizing (ADR-0007) — the hook surfaces its 400 as a generic error string; no dedicated UI for it.
- A "monthly API transactions" telemetry row, if still wanted despite the updated brief dropping it (Correction 4/Scope).
- Any density-mode ("Compact") system — CLAUDE.md documents it as a future concept; nothing in the codebase implements it yet, so `InfrastructureTelemetry` just uses naturally compact styling, not a toggle.
- Building real, functional versions of the assumptions-note box and Export Report/Save Configuration actions where their ghost placeholders currently sit (see Scope, §6).
