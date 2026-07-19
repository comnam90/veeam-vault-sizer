---
date: 2026-07-20
status: Approved (brainstorm), pending implementation plan
branch: sobr-archive-tier-workaround
implements: ADR-0022
---

# SOBR Archive Tier without Capacity Tier — detect-and-resubmit workaround design

## Problem

`docs/evidence/sobr-archive-tier-no-capacity/README.md` documents two confirmed
defects in Veeam's calculator API (`https://calculator.veeam.com/vse/api/VmAgent`)
whenever a request has `archiveTierEnabled: true` with both
`moveCapacityTierEnabled` and `copyCapacityTierEnabled` false (i.e. Archive
Tier enabled, Capacity Tier disabled):

- **Issue 1** (block-file Performance Tier): the Archive branch is entirely
  inert — Archive Tier volume stays `0` regardless of `archiveTierDays`.
- **Issue 2** (object-storage Performance Tier): Archive Tier reports a
  volume, but the archived days are a subset of Performance Tier's own day
  list — the same bytes are double-counted across both tiers.

A workaround was found and validated against the live API: build the request
as if a **phantom, pass-through Capacity Tier** were present
(`moveCapacityTierEnabled: true`, `capacityTierDays` set to the user's real
desired offload threshold, `archiveTierDays: 0` so Capacity forwards
everything immediately into Archive), inspect the response for a leaked
non-zero Capacity Tier volume (indicating the threshold was too low), and if
so, resubmit once with a corrected threshold computed from the response's own
restore-point data. This produces a correctly-partitioned, lossless result
for both Issues 1 and 2, confirmed across a wide adversarial sweep (see
"Open risk — investigated" in the evidence README).

This spec designs the escalate-plus-interim-workaround path: keep escalating
Issues 1/2 to Veeam, and in the meantime, use this mechanism so users of this
tool see correct numbers for this configuration today.

## Decisions

- **D1 — Applies everywhere the buggy shape can be produced, not just Direct
  mode.** `buildTargetInputs` in `build-vm-agent-request.ts` is the single
  shared function used by both **Direct to Vault**'s target dispatch and
  **Backup Copy**'s Secondary allocation — both call `buildSobrInputs` when
  `targetRepository === "sobr"`. Backup Copy's Primary is built by
  `buildStandaloneRepoInputs` from `PrimaryRepositoryConfig`, which has no
  `archiveTier` field at all and structurally can never trigger this. So
  there are three `VmAgentInputs` call sites total (Direct to Vault; Backup
  Copy Primary; Backup Copy Secondary), and two of them (Direct to Vault,
  Backup Copy Secondary) route through the same shared function and get the
  same treatment uniformly — no per-pipeline special-casing needed, since the
  trigger check is naturally false wherever it can't apply.

- **D2 — New pure module, `src/lib/simple-mode/resolve-archive-tier-workaround.ts`,
  owns shape-selection and response-inspection; `build-vm-agent-request.ts`
  stays untouched.** Considered three approaches (all logic in the BFF;
  shape-selection pushed into `build-vm-agent-request.ts`; a new dedicated
  module). Chose the new module because it keeps `build-vm-agent-request.ts`
  a pure, synchronous UI→request mapper with no knowledge of retries or
  response inspection, matches this codebase's existing pattern of small
  single-purpose lib modules (`vault-retention.ts`, `cap-gfs-to-forecast-horizon.ts`,
  `storage-tiers.ts`), and makes the already-live-validated mechanism directly
  unit-testable against static fixtures with no `fetch` mocking.

  Exported functions:

  ```ts
  detectsArchiveTierWithoutCapacity(inputs: VmAgentInputs): boolean
  // true iff archiveTierEnabled && !moveCapacityTierEnabled && !copyCapacityTierEnabled.
  // Storage-type-agnostic — Issues 1 and 2 are both this one shape.

  buildPhantomCapacityInputs(inputs: VmAgentInputs): VmAgentInputs
  // moveCapacityTierEnabled: true, capacityTierDays: max(inputs.archiveTierDays, inputs.immutablePerfDays),
  // archiveTierDays: 0. archiveTierStandalone and everything else preserved.

  hasLeakedNonGfsPoints(response: CVmAgentReturnObject): boolean
  // the existing leak-check: ghost Capacity Tier volume (diskPurpose 13) > 0

  computeCorrectedThreshold(response: CVmAgentReturnObject): number
  // max(day of isGFS:false points in the response) + 1.
  // Only called from the leak branch (hasLeakedNonGfsPoints already true),
  // which implies at least one non-GFS point exists — an empty non-GFS set
  // (max of nothing → NaN) is not reachable from that call site.

  isArchiveComplete(response: CVmAgentReturnObject): boolean
  // every isGFS:true day appears (at least once) as pointType archiveTier.
  // Plain day-set membership — matches README.md's own "Next steps" #3
  // conclusion. Single-response check — isGFS/day assignment is stable
  // across different threshold values on the same dataset (validated in the
  // evidence doc), so there is no need to diff against an earlier response.
  ```

  **No tax-field OR-branch.** An earlier draft of this function also accepted
  a day appearing only as `performanceTier` when a non-zero
  `*ImmutabilityTaxGB` field was present. Dropped: every Immutability Tax
  case observed in the evidence doc tags the day under **both**
  `performanceTier` and `archiveTier` simultaneously — the tax duplicates,
  it never substitutes for the `archiveTier` tag. Nothing in the evidence
  shows a still-locked GFS point appearing _only_ under `performanceTier`
  with no `archiveTier` tag at all, so the OR-branch was untested,
  unreachable given observed engine behavior, and inconsistent with
  README.md's own conclusion. Plain membership is both simpler and
  strictly stricter (an omission that happened to coincide with a non-zero
  tax field for unrelated reasons would no longer be excused).

  **Rejected: a two-response `validateWorkaroundIntegrity(baseResponse,
correctedResponse)` comparing total volume across the floor-threshold and
  corrected-threshold calls.** Raising the threshold legitimately moves real
  data from Capacity/Archive back into Performance — that's expected
  redistribution, not an error, and it is _not_ the same thing as the
  Immutability Tax delta. Distinguishing "expected redistribution from the
  threshold change" from "the tax delta" would require modeling how much
  data _should_ shift between tiers as the threshold moves — i.e.
  reconstructing Veeam's internal tiering math, which ADR-0001 commits this
  project to never doing. Concretely, from the evidence: at
  `days=1, m=12, y=1`, total (Performance+Archive) is 28,160 GB at threshold
  1–20, 29,004.8 GB at threshold 29–34 (the tax window), and 28,160 GB again
  at threshold 35–40 — the swing isn't tax alone. The single-response check
  in `isArchiveComplete` is sufficient and doesn't require this.

- **D3 — Data flow through `functions/api/vault-sizer.ts`.** One new
  orchestration function, `resolveInputs(inputs: VmAgentInputs): Promise<{ data: CVmAgentReturnObject; archiveTierNotice?: ArchiveTierNotice }>`,
  replaces the bare `upstreamFetch` call at each of the three call sites
  (D1). Call-count by scenario:

  | Scenario                                                                                          | Calls                                             |
  | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
  | Not triggering (`detectsArchiveTierWithoutCapacity` false)                                        | 1 (unchanged from today)                          |
  | Triggering, phantom call clean, floor equals user's own `archiveTierDays`                         | 1                                                 |
  | Triggering, phantom call clean, floor raised the threshold above the user's own `archiveTierDays` | 1                                                 |
  | Triggering, leak → corrected resubmit clean                                                       | 2                                                 |
  | Triggering, corrected resubmit still incomplete (fallback)                                        | 3 (phantom, corrected, then original naive shape) |

  `handleCopy` calls `resolveInputs` independently for Primary and Secondary
  — Primary's call is a no-op pass-through of the first scenario, since it
  can never trigger (D1).

- **D4 — Response contract: one new optional field, flat on the envelope.**

  ```ts
  export interface ArchiveTierNotice {
    status: "adjusted" | "failed";
    effectiveThresholdDays?: number; // present only when status === "adjusted"
  }
  ```

  Added to both the `direct` and `copy` arms of `SizerBffResponse`. Flat
  rather than nested under `data`/`secondary` — only Secondary can ever
  produce it in Copy mode (Primary can't trigger per D1), so per-pipeline
  granularity is YAGNI today.

  **The notice is gated on whether the threshold actually changed, not on
  whether the mechanism ran.** `effectiveThresholdDays` is the
  `capacityTierDays` value actually used in whichever call produced the
  final `data` — the floor value (`max(archiveTierDays, immutablePerfDays)`)
  in the one-call case, or `computeCorrectedThreshold`'s output in the
  two-call case. `resolveInputs` only sets `archiveTierNotice` when that
  final value differs from the user's own original `archiveTierDays`
  input — if `effectiveThresholdDays === inputs.archiveTierDays`, the field
  is omitted entirely, same as the non-triggering case. This matters because
  in the default config (`archiveTier.moveDays: "90"`,
  `performanceImmutableDays: "30"`), the floor computation
  (`max(90, 30) = 90`) is identical to the user's own input — the mechanism
  still has to run (to route around Issues 1/2), but nothing was actually
  adjusted, and the notice must not claim otherwise.

- **D5 — UI treatment: visible notice, not silent, only when something
  changed.** When `archiveTierNotice.status === "adjusted"` is actually
  present (per D4's gating — not merely "the mechanism ran"), show an
  inline note near Archive Tier's "Move GFS archives older than" field / in
  the results panel:

  > "Effective offload threshold adjusted internally to X days to match GFS
  > chain offload requirements."

  Framed as an engine/mechanism detail (GFS chain offload requirements), not
  as "we detected a bug in Veeam's calculator" — consistent with this
  project's framing as an authoritative SE validation console. No notice is
  shown when the mechanism ran but landed on the user's own value
  unchanged — silently using phantom-Capacity-Tier internally in that case
  is not something the user needs to know about; there's nothing to
  disclose.

- **D6 — Fallback on failed detection: show the raw, unmitigated response
  with a hard disclaimer, not the corrected-but-unverified numbers and not a
  blocked/empty result.** When `isArchiveComplete` is still false after the
  one corrected resubmit, the BFF makes a third call with the user's original
  naive inputs and returns that raw data (i.e., a response known to exhibit
  Issue 1 or Issue 2 as documented) with `archiveTierNotice: { status: "failed" }`.
  The frontend renders a hard disclaimer explaining the tool detected an
  issue it couldn't safely correct, with remediation guidance (e.g. "enable
  Capacity Tier" or "adjust your offload threshold"). Chosen over (a)
  showing the unverified corrected numbers with a soft disclaimer, or (c)
  blocking the result entirely — this is expected to be rare (the evidence
  sweep found zero completeness failures across 1–1,000 day retention, 0–60
  GFS points, both storage types, single- and multi-year), but the design
  needs a defined answer regardless.

- **D7 — Error handling: per-call failures are unchanged; "detection
  failed" is a success-path notice, not an HTTP error.** Every call in the
  chain reuses the existing `upstreamFetch`/`parseBody`/`extractErrorMessage`
  handling verbatim — a network/HTTP failure at any step propagates
  immediately as `success: false`, exactly as today, with no new failure
  modes introduced. "Detection failed" (D6) is different: all calls
  succeeded, so the BFF returns `success: true` with the raw data and
  `archiveTierNotice: { status: "failed" }` — a 200, because the frontend
  needs to render the disclaimer inside the results UI, not a generic
  network-error banner. One explicit edge case: if the third, last-resort
  raw-fallback call itself fails, that propagates as a normal
  `success: false` (there's no valid data left to show at all) rather than
  serving the stale, known-incomplete corrected-resubmit data.

- **D8 — No changes to `validate-repository-config.ts`.** The existing
  client-side rules (Vault Minimum Retention — ADRs 0013–0015; Archive-Feed
  compatibility — ADR-0012) govern what the user is allowed to configure.
  This workaround operates entirely server-side on an already-valid config;
  the two systems don't interact.

- **D9 — `archiveTier.standaloneFullBackups: true` is explicitly untested,
  not assumed covered.** The evidence sweep validated the mechanism with
  `standaloneFullBackups: false` throughout. The design does not assume the
  same mechanism handles the standalone-full-backups case correctly — that
  needs its own evidence pass before this workaround is trusted for that
  configuration. Tracked as a follow-up, not blocking this implementation
  (the trigger condition and mechanism are unchanged either way; this is a
  correctness question to verify, not a design gap).

## File-by-file change list (blast radius)

| File                                                                       | Change                                                                                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/lib/simple-mode/resolve-archive-tier-workaround.ts`                   | New — pure functions per D2                                                                                 |
| `src/lib/simple-mode/resolve-archive-tier-workaround.test.ts`              | New — unit tests against evidence-doc fixtures                                                              |
| `functions/api/vault-sizer.ts`                                             | New `resolveInputs` orchestration (D3); `handleDirect`/`handleCopy` call it instead of bare `upstreamFetch` |
| `functions/api/vault-sizer.test.ts`                                        | New scenarios per Test plan                                                                                 |
| `src/types/simple-mode.ts`                                                 | `ArchiveTierNotice` type; `SizerBffResponse`'s `direct`/`copy` arms gain optional `archiveTierNotice` (D4)  |
| `src/lib/api/vault-sizer-client.ts` / `src/hooks/use-calculated-sizing.ts` | Thread `archiveTierNotice` through to components (no logic change, just widen the passthrough type)         |
| Archive Tier UI component (Repository Configuration card)                  | Render D5's inline note when `status: "adjusted"`                                                           |
| Results/Projected Sizing components                                        | Render D6's hard disclaimer when `status: "failed"`                                                         |
| `docs/adr/0022-*.md`                                                       | New — records this design's compliance with ADR-0001 (domain-modeling follow-up, not part of this spec)     |

## Test plan

Pure module (no `fetch` mocking, fixtures from `docs/evidence/sobr-archive-tier-no-capacity/`):

- `detectsArchiveTierWithoutCapacity`: true/false across enabled-flag combinations.
- `buildPhantomCapacityInputs`: exact substitution asserted against a sample input.
- `hasLeakedNonGfsPoints`: true using the "Mechanism risk" (threshold=20) fixture; false using "Mechanism check" (threshold=90).
- `computeCorrectedThreshold`: the `days=90` case (`maxNonGfsDay=91` → `92`).
- `isArchiveComplete`: true for a clean partition; true for the day-63 Immutability Tax fixture (a duplicate is present — tagged both `performanceTier` and `archiveTier` — but the function passes on plain membership alone, since the `archiveTier` tag is there regardless of the duplicate); false for a hand-built fixture with a day missing from `archiveTier` entirely (synthetic — never observed live, but proves the function detects a real omission rather than always passing).

BFF orchestration (`vi.stubGlobal("fetch", ...)`, extending the existing pattern in `vault-sizer.test.ts`):

1. Non-triggering config → exactly one fetch, `archiveTierNotice` absent entirely.
2. Triggering, phantom call clean, floor equals the user's own `archiveTierDays` (the default-config case: `archiveTier.moveDays: "90"`, `performanceImmutableDays: "30"`, `max(90,30)=90`) → one fetch, `archiveTierNotice` **absent** — nothing was actually adjusted.
3. Triggering, phantom call clean, floor raises the threshold above the user's own `archiveTierDays` (e.g. `archiveTierDays: "20"`, `immutablePerfDays: "30"`) → one fetch, `status: "adjusted"`, `effectiveThresholdDays: 30`.
4. Triggering, leak → corrected resubmit clean → two fetches, second call's `capacityTierDays` matches the computed threshold, `status: "adjusted"`.
5. Triggering, corrected resubmit still incomplete → three fetches, third matches the original naive shape, `status: "failed"`.
6. Backup Copy: Secondary triggers, Primary doesn't → Primary unaffected (one fetch), Secondary follows scenario 3/4 independently, notice reflects Secondary only.
7. Last-resort failure: third (fallback) call itself fails → `success: false`, same shape as any other upstream failure today.
8. **Phantom-tier artifacts don't leak through** (verifies Section "Verify during implementation" below): in scenario 2/3's response, assert no capacity-tagged data (`transactions.capacityTierTransactions`, `restorePoints` entries with `pointType: "capacityTier"`) reaches whatever the client-facing result renders — `transactions`/`restorePoints` aren't consumed by any component in `src/` today (confirmed by repo-wide grep), so this is currently a non-issue, but the assertion guards against a future component starting to render them without accounting for the phantom tier.

## Verify during implementation

- **Phantom-tier artifacts must not leak into the UI.** The `data` returned
  to the client in the triggering path is built from a request with a fake
  Capacity Tier. `getTierStorageRows`'s `diskGB > 0` filter already keeps a
  clean-case ~0 Capacity volume from rendering as a tier row, but
  `transactions.capacityTierTransactions` and capacity-tagged
  `restorePoints` entries aren't filtered the same way. Neither is
  currently consumed by any component in `src/` (confirmed by grep), so
  this isn't a live bug — but it needs confirming that nothing
  capacity-flavored surfaces in the Results/Projected Sizing components
  before or after this ships, given how load-bearing the tier color-coding
  is (CLAUDE.md: `tier-performance`/`tier-capacity`/`tier-archive`). See
  Test plan item 8.
- **Loading state for 2–3 sequential upstream calls.** The triggering path
  can take up to 3x as long as today's single call. No new loading UI is
  proposed — the existing "waiting for `/api/vault-sizer`" state already
  covers this, since it's the same request from the client's perspective,
  just occasionally slower — but this should be confirmed to feel
  acceptable in practice once implemented, not assumed.

## Non-goals / out of scope

- Fixing Issues 1/2 upstream (that's the escalation to Veeam, tracked separately).
- The `getTotalStorageGB()` Immutability Tax undercount (GitHub issue #11) — unrelated defect in this project's own total-storage summation, not this workaround.
- `archiveTier.standaloneFullBackups: true` correctness (D9) — flagged as a follow-up, not solved here.
- Advanced Mode (doesn't exist yet).
- Any change to `validate-repository-config.ts`'s client-side rules (D8).
- New logging/observability infrastructure for `archiveTierNotice` occurrences — no existing telemetry infrastructure in this codebase to hook into; out of scope unless requested separately.

## Retirement

The evidence doc flags this as a live cost of the whole approach: a local
correction is a landmine if Veeam patches the engine later. Retirement is
tied to the same mechanism already established for detecting drift —
`docs/evidence/sobr-archive-tier-no-capacity/probe.mjs` is re-run
periodically (or whenever Veeam announces a relevant change) against the
live API; if Issues 1/2 no longer reproduce, that's the signal to remove
`resolve-archive-tier-workaround.ts` and the BFF orchestration around it,
reverting `handleDirect`/`handleCopy` to the bare `upstreamFetch` call. No
new tooling proposed for this — it rides on `probe.mjs`'s existing role.

## Sequencing note

**Resolved.** `docs/adr/0022-detect-and-resubmit-does-not-violate-adr-0001.md`
is written — the core argument from D2's "Rejected" paragraph, lifted into
the ADR before implementation, not after.

## References

- `docs/evidence/sobr-archive-tier-no-capacity/README.md` — the defects, the mechanism validation, the Immutability Tax resolution.
- `docs/evidence/sobr-archive-tier-no-capacity/probe.mjs` — live-API regression checks and fixture source.
- ADR-0001 — delegate sizing to Veeam's calculator API (why D2 rejected the cross-response volume check).
- ADR-0007 — Backup Copy models two independent sizing pipelines (D1, D3).
- ADR-0008 — Archive Tier standalone means independent fulls (D9).
- ADR-0011 — Archive Tier's early-deletion guardrail is out of scope (precedent: this project doesn't route around gaps in Veeam's _request shape_; D2's rejected approach would have required exactly that kind of reverse-engineering for the _response_).
- ADR-0012 — Archive-Feed compatibility is one rule, not two (D8 — unaffected by this workaround).
- ADRs 0013–0015 — Vault Minimum Retention (D8 — unaffected by this workaround).
- GitHub issue #11 — `getTotalStorageGB()` omits Immutability Tax fields (related but out of scope).
