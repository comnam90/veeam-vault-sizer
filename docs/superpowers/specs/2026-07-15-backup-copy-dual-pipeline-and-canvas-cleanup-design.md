# Backup Copy dual-pipeline sizing + canvas tier cleanup — design

- **Date:** 2026-07-15
- **Status:** Approved (brainstorm), pending implementation plan
- **Branch:** `frontend-integration-sizing-canvas`
- **Implements:** ADR-0007 (Backup Copy models two independent sizing pipelines)

## Problem

Two changes to the Simple Mode Projected Sizing canvas:

1. **Canvas tier cleanup (Part 1).** A standalone, non-SOBR target (e.g. a Vault Azure/AWS endpoint) still renders `Capacity` and `Archive` rows holding `0.0 TB`. The panel should only show a storage tier whose resolved total is greater than zero.

2. **Backup Copy sizing (Part 2/3, ADR-0007).** `backupPath === "copy"` describes two independent physical environments that must be sized together: a Primary on-premises landing zone and a Secondary offsite Vault/SOBR copy. Today `buildVmAgentRequest` throws for copy mode. This design unblocks it with a Backend-for-Frontend (BFF) fan-out and a split-canvas UI.

## Decisions

Each is a resolved question from the brainstorm. They win over any looser reading of the original brief.

- **D1 — Per-pipeline retention.** Each pipeline resolves its own retention via `resolveEffectiveRetention`, carrying full retention days **and** W/M/Y GFS (Primary from `primary.retention`, Secondary from `secondaryRetention`). This honors ADR-0007 and stays consistent with `validate-repository-config.ts`, which already checks Primary GFS residency. The brief's "Primary = short-term / Secondary = GFS" framing is only the _default_ shape (each side defaults to `workloadData`), not a sizing rule. We do **not** strip GFS from Primary.

- **D2 — Response contract is a discriminated union of two un-mutilated `CVmAgentReturnObject`s** (not the brief's flattened `primaryStorageMetrics`/`primaryProxyCompute` field names, which were conceptual shorthand). `CVmAgentReturnObject` already bundles storage, compute, and telemetry per site; two of them _is_ the primary/secondary split, and the existing display components reuse verbatim.

- **D3 — Fan-out lives in the edge worker (BFF)**, not the client. One browser envelope in; the worker fires both upstream calls. Keeps parsing/aggregation off the thin React client and keeps `useCalculatedSizing` at exactly one request per state change.

- **D4 — Fail-whole via strict `Promise.all`.** If either sub-request fails, the worker returns a single `{ success: false, error }` with a message naming which side failed. An authoritative SE validation console must not render a grand total silently missing one environment.

- **D5 — Split-canvas layout.** In copy mode the right-hand panel renders a master header (combined total) above two stacked site sections (Primary On-Premises, Secondary Offsite Cloud Vault). Direct mode is visually unchanged.

- **D6 — Master total = sum of both sites' tier volumes**, computed client-side via the shared summation helper. It does **not** read `CVmAgentReturnObject.totalStorageTB`, which is documented Performance-Tier-only and would undercount an offsite SOBR.

- **D7 — Both bandwidth rows on both sides.** Nightly Incremental (8h) _and_ Initial Full / Restore (24h) render on Primary and Secondary. Initial-full visibility on Primary matters for local RTO validation, not just the nightly window. Windows come from the existing `BACKUP_WINDOW_HOURS` / `FULL_BACKUP_WINDOW_HOURS` constants.

- **D8 — Repo-type badges in section headers**, derived client-side from `repositoryConfig` (the return object carries no reliable type label).

- **D9 — Part 1 filter uses raw `diskGB > 0`.** Truly-unconfigured tiers come back as exactly `0`, so raw `>0` removes the real noise. The sub-51GB-rounds-to-`0.0` edge case is not a real configured tier. The filter lives in the shared `StorageBreakdown`, so it applies to Direct mode too — intended. (Verified against the live upstream: even a single-tier target returns `dp13`/`dp4` volumes at `0.00 GB`, confirming this is the noise to remove.)

- **D10 — Both pipelines size as independent backup targets; the calculator's copy flags stay at `base` defaults (`backupType: 0`, `copiesEnabled: false`).** Verified empirically against the live VmAgent endpoint (2026-07-15): toggling `backupType` (0/1) and `copiesEnabled` (true/false) produces **byte-identical** responses across every field — `totalStorageTB`, `workspaceGB`, immutability tax, proxy cores/RAM, network throughput (inbound and outbound), repo volumes, and restore-point count — for **both** an object-storage (Vault) and a block/file (Hardened Repository) config. So these two flags are inert for this endpoint; setting `backupType: 1` on the Secondary would not change its numbers, and `copiesEnabled: true` would not double-count. `buildBaseInputs` therefore keeps both flags at their existing defaults for both sub-requests — no per-side flag threading. (Probe scripts were throwaway; not committed.)

## Architecture

```
Browser (one fetch)
  └─ POST /api/vault-sizer  { workloadData, repositoryConfig }
       └─ functions/api/vault-sizer.ts  (branch on backupPath)
            ├─ "direct": build 1 VmAgentInputs → 1 upstream call
            │            → { success, mode:"direct", data }
            └─ "copy":   build 2 VmAgentInputs → Promise.all(2 upstream calls)
                         → { success, mode:"copy", primary, secondary }   (fail-whole)
```

The worker returns raw per-site objects; the client owns the single tier-summation definition (D6).

## Section 1 — Data contract + request builder

### 1a. Response contract (`src/types/simple-mode.ts`)

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
```

### 1b. Builder refactor (`src/lib/simple-mode/build-vm-agent-request.ts`)

The current non-SOBR branch is vault-only (hardcodes `objectStorage: true`, `blockCloning: false`) and reads retention straight from `workloadData`. Decompose into pure helpers:

- **`buildBaseInputs(workloadData, retention: EffectiveRetention)`** — shared `base`. Workload-level fields (source, change rate, reduction, growth, project length) from `workloadData`; `days` + W/M/Y GFS from the `EffectiveRetention` param. Applies `capGfsToForecastHorizon` to the resolved GFS, gated by the existing `workloadData.capGfsToForecastHorizon` toggle and using `workloadData.projectLengthYears`.
  - The `capGfsToForecastHorizon` toggle and field already exist (`WorkloadDataValues.capGfsToForecastHorizon`, rendered by `ForecastHorizonControl`); no new plumbing. The cap applies to **each side's resolved GFS independently** (override value if customized, else workload default) against the single shared forecast horizon. Capping stays a builder-only concern, distinct from vault-residency validation, which deliberately runs on the _uncapped_ effective retention (ADR-0014/0019).
- **`buildStandaloneRepoInputs(base, repoType, immutableDays)`** — sizes one repo of _any_ `RepoType` using the existing type-driven logic (`REPO_TYPE_CATEGORY`, `repoTypeRequiresImmutability`, `repoTypeSupportsBlockCloning`, `BLOCK_GENERATION_DAYS`). Replaces the vault-only branch (byte-identical for a vault target) and handles a block/file Primary.
- **`buildSobrInputs(base, sobr)`** — the existing SOBR performance/capacity/archive logic, unchanged.

Public surface:

- `buildVmAgentRequest(workloadData, repositoryConfig): VmAgentInputs` — direct mode, unchanged signature. Uses `resolveEffectiveRetention(workloadData)` (no override) → output identical to today; existing tests stay green.
- `buildCopyVmAgentRequests(workloadData, repositoryConfig): { primary: VmAgentInputs; secondary: VmAgentInputs }` — Primary via `buildStandaloneRepoInputs` with `resolveEffectiveRetention(workloadData, primary.retention)`; Secondary via the same target/SOBR dispatch as direct, with `resolveEffectiveRetention(workloadData, secondaryRetention)`.

## Section 2 — Edge worker fan-out + client wiring

### 2a. Edge worker (`functions/api/vault-sizer.ts`)

Branch on `bffRequest.repositoryConfig.backupPath`.

- **Direct mode** — unchanged logic; response tagged `{ success: true, mode: "direct", data }`.
- **Copy mode:**
  1. `buildCopyVmAgentRequests(...)` up front; a build error is a `400` (as today).
  2. Strict `Promise.all` — both upstream calls fire concurrently.
  3. Parse each body **defensively** (a `try` around each `.json()`, falling back to `{}`), so a non-JSON or unexpected error shape still surfaces a side-labeled message at the upstream's real status via `extractErrorMessage`'s fallback — never an unhandled throw or a misleading 502.
  4. Fail-whole, side-labeled (D4). Primary checked first for a deterministic status:
     - `!primaryRes.ok` → `Primary (on-premises) sizing failed: <msg>` at `primaryRes.status`.
     - `!secondaryRes.ok` → `Secondary (offsite Vault) sizing failed: <msg>` at `secondaryRes.status`.
  5. Both OK → `{ success: true, mode: "copy", primary: primaryBody.data, secondary: secondaryBody.data }` at `200`.
  6. A fetch rejection (network) → `502 "Upstream sizing API unreachable"`.

`extractErrorMessage`, CORS headers, and `onRequestOptions` are reused unchanged. The worker does not compute the grand total (D6).

### 2b. Client + hook

- **`src/lib/api/vault-sizer-client.ts`** — `callVaultSizerApi` still fetches once and throws on `success: false`. Return type widens to the success union:
  ```ts
  export type SizerResult =
    | { mode: "direct"; data: CVmAgentReturnObject }
    | {
        mode: "copy";
        primary: CVmAgentReturnObject;
        secondary: CVmAgentReturnObject;
      };
  ```
- **`src/hooks/use-calculated-sizing.ts`** — `data` state widens from `CVmAgentReturnObject | null` to `SizerResult | null`. Debounce, abort, request-id dedup, and first-run/Strict-Mode handling (ADR-0017) are untouched.

**Error handling (both modes):** invalid inputs block client-side (no call); build throw → 400; either upstream non-OK → side-labeled 4xx/5xx via fail-whole; network → 502. The client turns any `success: false` into a thrown `Error`; `ProjectedSizingCard` renders it in the existing banner — one error path.

## Section 3 — Part 1 filter, split-canvas UI

### 3a. `>0 TB` tier filter (`src/components/simple-mode/storage-breakdown.tsx`)

Replace the structural `tier.diskGB !== undefined` check with a metric `(tier.diskGB ?? 0) > 0` check (D9). This filtering lives in `getTierStorageRows` (3b), which `StorageBreakdown` consumes — so the change is realized once and applies to both modes.

### 3b. Shared tier-summation helper (new `src/lib/simple-mode/storage-tiers.ts`)

Extract the tier-row/summation math from `StorageBreakdown` into pure functions — `getTierStorageRows(data)` and `getTotalStorageGB(data)`. `StorageBreakdown` consumes them; the master header sums both sites' `getTotalStorageGB`. One summation definition, tested once (D6).

### 3c. New `SiteSizingSection` component (`src/components/simple-mode/site-sizing-section.tsx`)

Props: `title`, `badge`, `data: CVmAgentReturnObject`, `initialFullRestore`. Renders the section header (title + badge), then `StorageBreakdown`, `InfrastructureTelemetry` (Cores/RAM), and `NetworkBandwidth` (that side's `proxyCompute.compute.networkThroughput` as nightly incremental; the shared `initialFullRestore`). Reuses all three existing display components verbatim.

Badge derivation (D8): Primary → `REPO_TYPE_LABEL[primary.repoType]`; Secondary → `targetRepository === "sobr" ? "SOBR · " + REPO_TYPE_LABEL[sobr.performanceType] : REPO_TYPE_LABEL[targetRepository]`.

### 3d. `ProjectedSizingCard` branching (`src/components/simple-mode/projected-sizing-card.tsx`)

`initialFullRestore` is computed once from `workloadData` (shared, both sides). Then:

- `data === null` or `data.mode === "direct"` → existing flat layout, unwrapping `data.data`. Visually unchanged.
- `data.mode === "copy"` → master header (`Combined Required Storage` = sum of both `getTotalStorageGB`, with a per-site split line) + `SiteSizingSection` for Primary (On-Premises) + `SiteSizingSection` for Secondary (Offsite Cloud Vault).

The loading spinner, error banner, `ForecastHorizonControl`, and the two dashed placeholders stay as-is.

## Test plan

- **`storage-breakdown.test.tsx`** — add "tier with `diskGB: 0` is hidden"; fix any fixture relying on 0-tiers rendering.
- **`storage-tiers.test.ts`** (new) — summation + `>0` filtering in isolation.
- **`build-vm-agent-request.test.ts`** — keep direct-mode regression green; add copy: Primary block/file (`objectStorage:false`, `blockCloning` per type), Primary vault (immutable + block-generation), Secondary vault + SOBR, per-side retention override honored, per-side GFS cap.
- **`vault-sizer.test.ts`** (edge) — copy success aggregation; fail-whole (Primary); fail-whole (Secondary); non-JSON error body → side-labeled fallback; network → 502; direct response carries `mode:"direct"`.
- **`vault-sizer-client` / `use-calculated-sizing`** — union return type in both modes.
- **`site-sizing-section.test.tsx`** (new) — storage + compute + bandwidth + badge render.
- **`projected-sizing-card.test.tsx`** — flat in direct; split (master + two sections) in copy; error banner.

## File-by-file change list (blast radius)

| File                                                   | Change                                                                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/simple-mode.ts`                             | `SizerBffResponse` becomes 3-arm discriminated union (`mode`)                                                                          |
| `src/lib/simple-mode/build-vm-agent-request.ts`        | Decompose into `buildBaseInputs`/`buildStandaloneRepoInputs`/`buildSobrInputs`; add `buildCopyVmAgentRequests`; remove copy-mode throw |
| `src/lib/simple-mode/storage-tiers.ts`                 | New — `getTierStorageRows`, `getTotalStorageGB`                                                                                        |
| `functions/api/vault-sizer.ts`                         | Branch on `backupPath`; copy-mode `Promise.all` fan-out + fail-whole + defensive parse; tag direct response                            |
| `src/lib/api/vault-sizer-client.ts`                    | Return type widens to `SizerResult`                                                                                                    |
| `src/hooks/use-calculated-sizing.ts`                   | `data` state widens to `SizerResult \| null`                                                                                           |
| `src/components/simple-mode/storage-breakdown.tsx`     | `>0` filter; consume `storage-tiers` helpers                                                                                           |
| `src/components/simple-mode/site-sizing-section.tsx`   | New — one site's section                                                                                                               |
| `src/components/simple-mode/projected-sizing-card.tsx` | Branch flat (direct) vs split (copy); master header                                                                                    |
| Tests                                                  | As listed in Test plan                                                                                                                 |

## Non-goals / out of scope

- Advanced Mode (unrelated).
- Changing the sizing formula or upstream `VmAgentInputs` field semantics.
- Per-side backup-window UI (windows remain the fixed constants).
- Partial-render / half-estimate fallback (explicitly rejected — D4).
- Any change to vault-residency validation math (ADRs 0013–0015, 0019).

## References

- ADR-0007 — Backup Copy models two independent sizing pipelines.
- ADR-0014, ADR-0019 — GFS lifetime / forecast-horizon capping (why capping is builder-only, separate from residency).
- ADR-0017 — `useCalculatedSizing` first-load / Strict Mode behavior (unchanged here).
- `src/lib/simple-mode/vault-retention.ts` — `resolveEffectiveRetention`, `EffectiveRetention`.
- `src/lib/simple-mode/validate-repository-config.ts` — already validates both pipelines independently.
