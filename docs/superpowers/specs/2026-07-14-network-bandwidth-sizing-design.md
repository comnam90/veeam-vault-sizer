# Network Bandwidth Sizing — Nightly Incremental & Initial Full/Restore — Design

**Branch:** `frontend-integration-sizing-canvas`
**Sources:** Chat-transcribed conversation (not committed to the repo) reverse-engineering the official calculator API's throughput fields against `docs/official-calculator-api-swagger.json` and two live example payload/response pairs (one with Capacity Tier disabled, one enabled); `docs/research/2026-07-10-vmagent-swagger-api.md`; `docs/superpowers/specs/2026-07-13-projected-sizing-canvas-design.md` (introduced `InfrastructureTelemetry`, which this task partially restructures)

## Purpose

An SE sizing a Vault deployment normally needs to answer two network-bandwidth questions: how much bandwidth does the **nightly incremental** backup need, and how much does the **initial full backup** need — the same figure also represents a **full machine restore**, just with inbound/outbound reversed. Today `InfrastructureTelemetry` shows only the first, sourced directly from the vendor API's `proxyCompute.compute.networkThroughput`, and even that row's scope isn't stated anywhere: it's specific to the nightly incremental change, computed against `backupWindowHours` (hardcoded to `8` in `build-vm-agent-request.ts`), a window nothing in the UI currently surfaces.

The vendor API has no concept of "initial full" or "restore" bandwidth at all — confirmed against the swagger, there is no request field to ask for it and no response field carrying it. It must be derived locally.

This task adds that locally-computed figure alongside the existing nightly-incremental one, in a new dedicated section, with both rows' assumed windows stated explicitly as captions.

## Scope

**In scope:**

- New shared constants module (`backup-windows.ts`) holding both fixed backup-window assumptions; `build-vm-agent-request.ts`'s existing hardcoded `BACKUP_WINDOW_HOURS = 8` relocates here (no behavior change, only where the constant lives).
- New pure function `calculateInitialFullBandwidth`, computing the initial-full/restore bandwidth pair from `sourceSizeTB`/`dataReductionPercent`, entirely client-side, no vendor round trip.
- New `NetworkBandwidth` component — two fixed rows, "Nightly Incremental (8h)" and "Initial Full / Restore (24h)".
- `InfrastructureTelemetry` restructured to Cores/RAM only (2 rows) — its "Network Throughput" row is removed, replaced by `NetworkBandwidth`'s first row.
- `formatThroughput` relocated from `infrastructure-telemetry.tsx` into `network-bandwidth.tsx` (both its call sites end up in the same file, so no shared module is needed for it).
- `ProjectedSizingCard` renders `NetworkBandwidth` alongside `InfrastructureTelemetry`.

**Out of scope:**

- Any UI control to change either window — both stay fixed constants with no form field, matching the existing precedent for `BACKUP_WINDOW_HOURS`.
- Repo/tier-level disk throughput (`repoCompute.compute.volumes[].throughputMbps`) — a separate concept (storage-backend/offload sizing, discussed earlier in the same conversation) that this task does not surface. See Follow-up work.
- Server-side (worker) computation of the new figure — considered and explicitly rejected; see Design Decision 1.
- Forecast-horizon-scaling of the initial-full figure — always uses today's (Year-0) `sourceSizeTB`, never a grown future value.
- Renaming `InfrastructureTelemetry` itself, or any density-mode/compact-table work.

## Design decisions

1. **Client-side, not worker-side.** The only real appeal of computing this in `functions/api/vault-sizer.ts` is symmetry — both bandwidth numbers arriving together inside `data`. But the initial-full figure depends on nothing but `sourceSizeTB` and `dataReductionPercent`, both already in the browser, and never touches the upstream vendor call. Folding it into the worker's response would couple it to that call's debounce/staleness behavior instead: `useCalculatedSizing` preserves the last-good `data` on both the validation-gate branch and the catch block (`setState((prev) => ({ ...prev, ... }))` — `data` is never reset, per the existing "keep stale data visible" behavior documented in `2026-07-13-projected-sizing-canvas-design.md` and covered by `use-calculated-sizing.test.ts`'s "leaves prior data intact" case), so a server-computed figure would not go blank — but it would go **stale**. Concretely: (a) it would only update on the trailing edge of the 500ms debounce plus a real network round trip, even though it's arithmetic on two already-known numbers with no vendor dependency; and (b) it would stop updating entirely whenever _either_ `workloadData` _or_ `repositoryConfig` currently fails validation — the hook's gate (`workloadErrors.length > 0 || repositoryErrors.length > 0`) blocks the whole call, so an unrelated invalid repository-config field would freeze this figure even while `sourceSizeTB` itself is being actively and validly edited. Computing it client-side avoids both: no debounce, no dependency on `repositoryConfig`'s validity at all. `buildVmAgentRequest` lives in the worker because it's proximate to the upstream fetch, not because "sizing math belongs server-side" — `validate-workload-data.ts` is existing precedent for sizing-adjacent pure logic already living and running client-side.
2. **Single combined row, not two.** "Initial Full Backup Bandwidth" and "Full Restore Bandwidth" are the same magnitude pair with inbound/outbound swapped. One "Initial Full / Restore" row avoids showing duplicate numbers. Open item for implementation: the label/caption alone currently carries the entire explanation of _which_ number applies to which direction for which scenario — worth a short tooltip or helper text once real copy is written, not a blocker for this spec.
3. **Fixed 24h window constant**, not user-adjustable yet — mirrors the existing 8h precedent.
4. **Always Year-0 `sourceSizeTB`** — an initial full or a restore is a point-in-time event happening today, regardless of the multi-year forecast horizon used elsewhere on the page.
5. **New dedicated "Network Bandwidth" section**, separate from Cores/RAM — a different kind of sizing decision (WAN/link sizing vs. compute sizing) that reads better on its own.

## Formula reference

Reverse-engineered from the vendor API's own response values (matched to 6+ significant figures across two independent example payloads) and reused deliberately for the new client-side calculation — same shape, different data volume and window:

**Existing (vendor-computed), nightly incremental — `proxyCompute.compute.networkThroughput`:**

```
inboundMBps  = (sourceTB × changeRate%) × 1,048,576 MB/TB ÷ (BACKUP_WINDOW_HOURS × 3600)
outboundMBps = inboundMBps × (1 − reduction%)
```

**New (locally-computed), initial full / restore:**

```
inboundMBps  = sourceTB × 1,048,576 MB/TB ÷ (FULL_BACKUP_WINDOW_HOURS × 3600)
outboundMBps = inboundMBps × (1 − reduction%)
```

The only differences: the full-size calculation uses the whole `sourceTB` instead of `sourceTB × changeRate%`, and a 24h window instead of 8h.

## Architecture

```
ProjectedSizingCard
        │  workloadData, data (from useCalculatedSizing) — both already available
        │
        ├─ StorageBreakdown(data)
        ├─ InfrastructureTelemetry(data?.proxyCompute?.compute)     (Cores, RAM — 2 rows)
        ├─ NetworkBandwidth(                                         (Nightly Incremental, Initial Full/Restore — 2 rows)
        │     nightlyIncremental: data?.proxyCompute?.compute?.networkThroughput,
        │     initialFullRestore: calculateInitialFullBandwidth(
        │       workloadData.sourceSizeTB, workloadData.dataReductionPercent),
        │   )
        ├─ [ghost placeholder: assumptions note]
        └─ [ghost placeholder: Export Report / Save Configuration]
```

`NetworkBandwidth` stays a presentational component like `InfrastructureTelemetry` — it receives two already-resolved `Throughput | null | undefined` values as props and knows nothing about `workloadData`, validity, or the vendor call. `ProjectedSizingCard` is the only place that calls `calculateInitialFullBandwidth`.

## 1. `src/lib/simple-mode/backup-windows.ts` (new)

```ts
export const BACKUP_WINDOW_HOURS = 8; // nightly incremental
export const FULL_BACKUP_WINDOW_HOURS = 24; // initial full / restore
```

`build-vm-agent-request.ts` imports `BACKUP_WINDOW_HOURS` from here instead of declaring it locally; its own comment ("Fixed sizing assumptions with no corresponding UI field yet") moves with it. No behavior change to the request-building logic.

## 2. `src/lib/simple-mode/calculate-initial-full-bandwidth.ts` (new)

```ts
import { FULL_BACKUP_WINDOW_HOURS } from "./backup-windows";
import type { Throughput } from "@/types/vault-sizer-api";

export function calculateInitialFullBandwidth(
  sourceSizeTB: string,
  dataReductionPercent: string,
): Throughput | null {
  const sourceTB = Number(sourceSizeTB);
  const reduction = Number(dataReductionPercent);

  if (!Number.isFinite(sourceTB) || sourceTB <= 0) return null;
  if (!Number.isFinite(reduction) || reduction < 0 || reduction > 100)
    return null;

  const inboundMBps =
    (sourceTB * 1_048_576) / (FULL_BACKUP_WINDOW_HOURS * 3600);
  return { inboundMBps, outboundMBps: inboundMBps * (1 - reduction / 100) };
}
```

Takes the raw form strings directly (not pre-parsed numbers, unlike `capGfsToForecastHorizon`) and owns its own validity guard, scoped to exactly the two fields it depends on — not the whole form. The bounds (`sourceSizeTB` strictly positive, reduction `0`–`100`) mirror `validate-workload-data.ts`'s existing rules for the same two fields, but are re-checked locally rather than imported, so this function never depends on the broader form validator and never goes blank because of an unrelated field's error (e.g. an invalid GFS count). Returns `null` — not `NaN` values — when the inputs aren't meaningful yet, so callers get the same "absent" signal `InfrastructureTelemetry`'s `formatThroughput` already treats as `—`.

## 3. `src/components/simple-mode/network-bandwidth.tsx` (new)

```ts
import type { Throughput } from "@/types/vault-sizer-api";
import { BACKUP_WINDOW_HOURS, FULL_BACKUP_WINDOW_HOURS } from "@/lib/simple-mode/backup-windows";

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

Identical markup/class structure to `InfrastructureTelemetry`'s existing table — same component visually, different rows.

`formatThroughput` is copied here verbatim from `infrastructure-telemetry.tsx` and removed from there — it now has exactly one file's worth of call sites again, so no shared module is warranted. Same null-vs-zero convention as the existing table: a real `{inboundMBps: 0, outboundMBps: 0}` renders `"0.0 / 0.0 MB/s"`, not `—`; only `null`/`undefined` renders `—`. Both rows always render structurally, matching `InfrastructureTelemetry`'s existing "fixed rows, varying values" pattern.

**Blank-state asymmetry (intentional):** "Nightly Incremental" shows `—` until `data` resolves from the vendor call — unchanged from today. "Initial Full / Restore" shows `—` only when `sourceSizeTB`/`dataReductionPercent` themselves are invalid, independent of the vendor round trip or of unrelated form errors — it can be populated well before the first API response lands.

## 4. `src/components/simple-mode/infrastructure-telemetry.tsx` (modified)

Drops the `networkThroughput` prop, the `formatThroughput` helper, and the "Network Throughput" row. Becomes a 2-row table: Cores, RAM. `compute` prop type narrows from needing `networkThroughput` to just `{ cores, ram }`-shaped access — the prop itself can stay `ComputeRequirement | null | undefined` for simplicity (no new type needed), just with fewer fields read from it.

## 5. `src/components/simple-mode/projected-sizing-card.tsx` (modified)

```ts
const initialFullRestore = calculateInitialFullBandwidth(
  workloadData.sourceSizeTB,
  workloadData.dataReductionPercent,
);
```

computed directly in the render body (cheap arithmetic, no memoization needed). `NetworkBandwidth` renders immediately after `InfrastructureTelemetry`, receiving `nightlyIncremental={data?.proxyCompute?.compute?.networkThroughput}` and `initialFullRestore={initialFullRestore}`.

## Testing & verification

- `calculate-initial-full-bandwidth.test.ts`: formula match against a known value (`sourceSizeTB: "10"`, `dataReductionPercent: "50"` → `inboundMBps ≈ 121.36`, `outboundMBps ≈ 60.68`); `null` for empty string, non-numeric string, `0`, negative, and reduction `< 0` / `> 100`.
- `network-bandwidth.test.tsx`: both rows render with correct labels/window captions; each value independently shows `—` for `null`/`undefined`; a real `{inboundMBps: 0, outboundMBps: 0}` renders `"0.0 / 0.0 MB/s"`.
- `infrastructure-telemetry.test.tsx`: existing throughput-row assertions removed; Cores/RAM assertions kept.
- `projected-sizing-card.test.tsx`: `NetworkBandwidth` renders alongside `InfrastructureTelemetry` with values sourced correctly from `data` and `workloadData`.
- `build-vm-agent-request.test.ts`: no behavior change expected, but re-run to confirm the `BACKUP_WINDOW_HOURS` relocation doesn't alter `backupWindowHours: 8` in the built request.

## Addendum (2026-07-15): outbound-only display

`formatThroughput` now renders only `outboundMBps` (superseded display unit — see 2026-07-16 addendum below). Rationale: the vault always holds reduced (deduped/compressed) data while the source/target host holds raw data, so `outboundMBps` is the vault-facing figure in every row — write-to-repo for Nightly Incremental and for the Initial Full leg, and (despite the field name) the same reduced magnitude as the read-from-repo traffic for the Restore leg. Since SE sizing cares about the Vault/repo-facing link, not the source-host-facing one, inbound is dropped from display. This closes part of Design Decision 2's open item: with only one number shown per row, there's no longer an inbound/outbound pair whose scenario-mapping needs explaining in a tooltip. `Throughput` and `calculateInitialFullBandwidth` are unchanged — both fields are still computed, only the unused `inboundMBps` half stops being displayed.

## Addendum (2026-07-16): Mbps display, not MB/s

`formatThroughput` now converts `outboundMBps` to Mbps (`(outboundMBps * 8).toFixed(1)} Mbps`) instead of displaying MB/s directly — e.g. `"485.5 Mbps"`, not `"60.7 MB/s"`. Rationale: Mbps is the conventional unit for network-link sizing (what an SE compares against a WAN circuit's rated speed); MB/s reads as a storage-throughput unit. This is a genuine value conversion, not a relabel — `08a454b` (two days prior) fixed the opposite mistake, where the UI said "Mbps" but the field's actual unit was MB/s, so simply swapping the suffix here would have reintroduced that same class of bug. The ×8 factor treats MB and Mb as equal-magnitude (bytes → bits only), which is the standard networking-domain convention, not the strict ×8.388608 that the field's underlying MiB-based calculation (`1_048_576` in `calculate-initial-full-bandwidth.ts`) would technically imply — the ~5% difference doesn't change which WAN-circuit tier an SE would size to. `Throughput`, `inboundMBps`/`outboundMBps` naming, and `calculateInitialFullBandwidth` are unchanged — the conversion is display-only, inside `formatThroughput`.

## Follow-up work (not this task)

- Exposing `repoCompute.compute.volumes[].throughputMbps` (per-tier disk throughput) for storage-backend/offload validation — a separate concept from proxy network bandwidth, discussed earlier in the same conversation but not part of this task.
- Making either window (8h / 24h) user-adjustable via a form control.
- Confirming whether the vendor's per-volume throughput assumption (16h, observed against both tier volumes) is a fixed constant or dynamically `24 − backupWindowHours` — indistinguishable from the two example payloads gathered so far, since both used the same `backupWindowHours: 8`. Would need a live probe against the vendor API with a different `backupWindowHours` to settle.
- Building real, functional versions of the assumptions-note box and Export Report/Save Configuration ghost placeholders (pre-existing scope boundary from the prior task, unrelated to this one).
