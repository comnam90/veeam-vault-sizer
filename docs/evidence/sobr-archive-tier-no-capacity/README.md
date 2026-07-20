# Evidence: SOBR Archive Tier without Capacity Tier — calculator engine defects

Investigation findings only. **No ADR yet** — the candidate fix has an open
gap (see "Open risk" below) and the decision between shipping a local
workaround vs. escalating upstream is still pending. This document is the
durable record so the investigation survives outside chat/scratchpad.

## Context

Simple Mode lets a user enable Archive Tier on a SOBR without enabling
Capacity Tier — Performance Tier → Archive Tier directly. Confirmed via
Veeam's own documentation
([Direct Data Transfer to Archive Tier](https://helpcenter.veeam.com/docs/vbr/userguide/archive_tier.html))
and directly by a Veeam SE on this project, this is a real, valid VBR
configuration: Archive Tier offload is a true _move_ (points leave
Performance Tier), subject to one constraint — a Performance Tier under
immutability can't move data out until the immutability period has passed.

The upstream sizing engine (`https://calculator.veeam.com/vse/api/VmAgent`,
delegated to per ADR-0001) does not size this configuration correctly.

## Issue 1 — block-file Performance Tier: Archive branch is entirely inert

Performance Tier type: Hardened Repository (block/file, immutable, 30-day
lock). Archive Tier enabled, Capacity Tier disabled, tested at two offload
thresholds (90 days, 7 days).

|                 | Performance (dp2) | Archive (dp4) |
| --------------- | ----------------- | ------------- |
| Archive off     | 27,228.16 GB      | 0             |
| Archive on, 90d | 27,228.16 GB      | 0             |
| Archive on, 7d  | 27,228.16 GB      | 0             |

Byte-identical across all three (only the response's randomized `siteId`
differs). Enabling Archive Tier — at any threshold — has **zero effect**.
Not "Performance fails to shrink while Archive populates" — the entire
Archive branch never engages.

## Issue 2 — object-storage Performance Tier: Performance/Archive double-count

Same test with Performance Tier type `s3-compatible` (object storage,
otherwise consistent: `blockCloning: false`, `blockGenerationDays: 10`).

|                 | Performance (dp3) | Archive (dp4) |
| --------------- | ----------------- | ------------- |
| Archive off     | 22,359.04 GB      | 0             |
| Archive on, 90d | 22,359.04 GB      | 13,235.2 GB   |

Performance is **unchanged** by enabling Archive — but this time Archive
_does_ compute a real, non-zero volume. Restore-point-level inspection shows
why: with Archive on, Performance's day-list is identical to the archive-off
baseline (46 days), and Archive's 10 days are an exact subset already present
inside that same 46-day list. The same 10 restore points are billed to both
tiers.

## Root cause discriminators (confirmed empirically)

- **The `objectStorage` request flag is the switch between Issue 1 and Issue
  2's shape**, not Capacity Tier presence. Flipping only `objectStorage` /
  `storageType` on an otherwise-identical Hardened Repository payload
  reproduces Issue 2's behavior instead of Issue 1's.
- **Archive Tier only ever accepts GFS-flagged restore points** —
  confirmed at the individual restore-point level (`isGFS: true` on every
  point that reaches `archiveTier`, `isGFS: false` on every point that
  doesn't, regardless of age). Matches Veeam's documented "Supported Types
  of Backup Files: backups with GFS flags" constraint.
- **The engine does not self-enforce the Performance Tier immutability
  floor.** Forcing a move at day 21 against a 30-day immutability lock
  succeeded without complaint. Any local fix must apply
  `Math.max(moveDays, immutablePerfDays)` itself — the engine won't protect
  against a premature move.
- **This project's own `chainFloor` formula (`vault-retention.ts`) is not a
  substitute** for "the day past which only GFS points exist" — it answers a
  different question (a floor for GFS class _lifetime_, not a boundary for
  tier _routing_) and was tested and found insufficient (gives 36; the
  actual last non-GFS day in the same dataset is 42).

## Workaround explored: phantom pass-through Capacity Tier

Mechanism: when Archive Tier is enabled and Capacity Tier is disabled,
inject Capacity Tier fields anyway (`moveCapacityTierEnabled: true`,
`copyCapacityTierEnabled: false`, `capacityTierDays: <threshold>`,
`immutableCap: false`, `immutableCapDays: 0`, force `archiveTierDays: 0`).
This exploits the fact that the engine's Performance→Capacity→Archive
pipeline works correctly when a **real** Capacity Tier is present (confirmed:
Performance 16,752.64 / Capacity 20,162.56 / Archive 13,235.2 GB, cleanly
tiered) — the phantom tier borrows that working pipeline.

**Validated (mechanism sound):** with the threshold set past the last
non-GFS day (e.g. 90, vs. this dataset's last non-GFS day of 42), the
technique produces an exact, lossless repartition — Performance + Archive
reconstructs the original full restore-point set with zero overlap and zero
loss, matching confirmed real semantics (Archive = true move). See
`probe.mjs`'s "Mechanism check" section.

**Static threshold formulas all failed empirically.** Every attempt to
_predict_ a safe threshold locally was disproven by live data:

| Formula tried                                       | Result                                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `capacityTierDays = archiveTier.moveDays` (raw)     | Leaks whenever `moveDays` is short — non-GFS points strand in a now-visible "ghost" Capacity Tier (9,180.16 GB in the 20-day test) |
| `Math.max(moveDays, immutablePerfDays)`             | Still leaks — immutability (30d) is shorter than the actual last non-GFS day (42d) in the same dataset                             |
| `Math.max(moveDays, immutablePerfDays, chainFloor)` | Still leaks — `chainFloor` (36) is also shorter than 42                                                                            |

No quantity available to this codebase reliably lands past the true
boundary, because that boundary is set by Veeam's internal, undocumented
chain-completion logic — reverse-engineering it locally is exactly what
ADR-0001 commits this project to not doing.

**Better candidate: detect-and-resubmit instead of predict.** Submit the
request with the user's real threshold (floored only by
`immutablePerfDays`, the one constraint confirmed to be real and
engine-unenforced). Inspect the response's own restore-point data. If
Capacity comes back non-zero (a leak), compute
`correctedThreshold = maxDay(points where isGFS === false) + 1` **from that
same response** and resubmit once. Validated: this reproduced a clean,
correctly-partitioned result (Capacity 0, Archive received all GFS points),
and `isGFS`/day assignment was confirmed stable across different threshold
values on the same underlying dataset — the schedule itself doesn't change,
only which bucket a point lands in.

This single-dataset validation held up under a much wider sweep — but a
different anomaly surfaced in that sweep. See "Open risk — investigated"
below before treating this mechanism as trustworthy as-is.

### Open risk — investigated (2026-07-17)

Two questions were open after the mechanism was first validated. Both have
now been tested against the live API; results below.

**1. Interleaving-omission (does the corrected threshold ever drop a GFS
point?) — does not manifest.** Swept `shortTermRetentionDays` from 1 to
1,000 against monthly/yearly GFS cadences from 0 to 60 points, single- and
multi-year (`projectLength` 1–5), for both block-file and object-storage
Performance Tiers — well past any realistic configuration. In every case,
the detect-and-resubmit mechanism's own restore-point data showed
`min(day of isGFS:true point) > max(day of isGFS:false point)`: the engine
never leaves a distinct GFS point sitting chronologically before the tail
of the daily chain — as retention grows, GFS points that would otherwise
fall inside the daily window are absorbed into it (not left distinct)
rather than interleaved. The corrected-threshold resubmit never dropped a
GFS point across this matrix. This resolves the risk as originally framed
in the user's favor: the interleaving-omission scenario is not
reproducible.

**2. Duplicate-window over-count — resolved: intended (Veeam's "Immutability
Tax").** While testing (1), a different artifact surfaced: when the
tier-move threshold in use (either the `immutablePerfDays` floor on the
first call, or the corrected threshold from a resubmit) falls within
roughly 6 days immediately _before_ a GFS point's day, that restore point
appears **twice** in the response — once tagged `performanceTier`, once
tagged `archiveTier` — with two different, non-matching `backupCapacity`
values (e.g. 5.5 GB vs. 0.82 GB for the same day), inflating the reported
Performance volume by the smaller figure. This reproduced in ~27% of a
fine-grained sweep of `shortTermRetentionDays` (1–400, step 3) using the
_actual_ gated mechanism (resubmit only when Capacity comes back
non-zero) — including cases where the correction itself lands in the
danger window (e.g. `shortTermRetentionDays: 90` → corrected threshold 92,
next GFS day 98 → the duplicate at day 98 ships in the final, "corrected"
output). It also reproduces under a fully realistic, valid configuration —
30-day short-term retention, 14-day immutability (immutability need not
approach, let alone exceed, retention for this to trigger; the project's
own rule that immutability must stay below retention is unaffected), Capacity
Tier moved at 60 days — where 60 lands 3 days before the first distinct
monthly GFS point (day 63; day 35's point is absorbed into the daily chain
at this retention and doesn't trigger it). See `probe.mjs`'s
duplicate-window section for the exact reproduction. It reproduced for
both block-file and object-storage Performance Tiers, and with immutability
turned off, so it is not specific to Archive
Tier, GFS, or immutability — it looks like a general week-granularity
artifact of the engine's tier-move calculation, first noticed here because
this workaround happens to probe thresholds right at tier boundaries.

**Bug vs. intended — resolved (2026-07-17), confirmed intended.** The
response carries two explicit top-level fields,
`performanceTierImmutabilityTaxGB` and `capacityTierImmutabilityTaxGB`, that
Veeam's own engine computes and names for exactly this: capacity a still-
immutability-locked restore point occupies in its original tier _in
addition to_ wherever it's been moved to, because the lock prevents
reclaiming that space before the move destination's copy exists. In the
30-day-retention / 14-day-immutability / 60-day-move-threshold case above,
`performanceTierImmutabilityTaxGB` was **1689.6 GB**, which is exactly 1.65
TiB — matching the official calculator UI's own "Immutability overhead:
1.65 TB" line item to the decimal. A named, computed, UI-surfaced field
reconciling exactly to the on-screen figure is first-party confirmation,
not inference: this is intended behavior, not a defect. (Note:
cross-checking this against the official UI is necessarily weak evidence
on its own — both this probe and the official UI call the identical
backend endpoint, so of course they agree whether or not the underlying
behavior is a bug. The field name + exact numeric reconciliation is what
actually settles it.)

**New, separate finding: this project's own total-storage calculation
currently ignores both tax fields.** `src/types/vault-sizer-api.ts` types
`performanceTierImmutabilityTaxGB`/`capacityTierImmutabilityTaxGB` on the
response, but a repo-wide grep (including `functions/`) turns up no
reader of either field outside test fixtures (where they're stubbed to
`0`). `getTotalStorageGB()` in `src/lib/simple-mode/storage-tiers.ts` sums
only `repoCompute.compute.volumes` by `diskPurpose` — the tax fields never
enter the total. For the reconciliation case above: tiers-only sum is
27,991 GB (27.33 TB); tiers + tax is 29,681 GB (28.98 TB) — a ~1.65 TB
(~6%) undercount relative to what the official calculator's own total
implies whenever the Immutability Tax is non-zero. This is unrelated to
Issues 1/2 or the phantom-Capacity-Tier workaround — it would apply to
any repository configuration where a point is still locked at the moment
its tier tries to move it — and is a candidate follow-up task in its own
right, not addressed here (no production code changed as part of this
investigation).

**What this changes about the completeness check:** the check the
detect-and-resubmit design needs is not "does every `isGFS: true` day from
the original response appear somewhere in the corrected response" (a
day-set membership check — this cannot see a duplicate, by construction,
since the day IS present, just twice, by design). It needs to be
**duplicate/volume-aware**: a same-day appearance under two `pointType`s is
now known to be expected (Immutability Tax) rather than a failure signal,
so the check should distinguish "duplicate matches
`performanceTierImmutabilityTaxGB`/`capacityTierImmutabilityTaxGB`" (fine)
from "duplicate/discrepancy with no corresponding tax field accounting for
it" (would indicate a real problem) — rather than treating every
same-day-two-tiers case as suspect.

### Scope note

Detect-and-resubmit requires inspecting a response and issuing a second
upstream call — it cannot live inside `buildSobrInputs` (a pure
inputs→request mapper). It belongs in the BFF handler
(`functions/api/vault-sizer.ts`, where the upstream fetch already happens)
as a two-pass flow, which also changes the testing story from a synchronous
unit test to an integration-level test of the handler.

## Options considered

| Path                                       | Pros                                                                                                                                                                                             | Cons                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Escalate to Veeam**                      | Fixes it at the source for every consumer of this API; aligns with ADR-0001 (Veeam owns the sizing math); we have a clean, reproducible bug report ready to hand off (this doc + `probe.mjs`)    | Vendor release cycles take time; users see bad numbers meanwhile                                                                                                                                                                                                                                                                                                          |
| **Presentation-layer disclaimer only**     | Zero risk of silently-wrong numbers; fully ADR-0001-clean; simple                                                                                                                                | Gives no corrected number; degrades UX for this config                                                                                                                                                                                                                                                                                                                    |
| **Phantom tier, static formula**           | —                                                                                                                                                                                                | Rejected: every formula tried failed empirically; requires reverse-engineering Veeam's internal logic, which isn't reliably derivable                                                                                                                                                                                                                                     |
| **Phantom tier, detect-and-resubmit**      | Produces correct numbers without predicting Veeam's internal logic; degrades safely (falls back to honest number + disclaimer when it can't verify correctness); covers both Issue 1 and Issue 2 | Two sequential upstream calls (latency); bigger blast radius than originally scoped (BFF handler, not just the builder); needs the completeness check added before it's trustworthy; still a local-correction landmine if Veeam patches the engine later — needs a retirement plan (an out-of-band script like `probe.mjs`, not a live call baked into the CI test suite) |
| **Escalate + interim detect-and-resubmit** | Fixes it now for users, superseded cleanly once Veeam patches upstream                                                                                                                           | Carries the detect-and-resubmit cons above until retired                                                                                                                                                                                                                                                                                                                  |

## Next steps

1. Escalate to Veeam's calculator team with this document + `probe.mjs` +
   fixtures as the bug report for **Issues 1 and 2 only** — the
   interleaving-omission result and the duplicate-window/Immutability Tax
   behavior are both resolved as "working as intended" and don't need
   escalating.
2. Decide escalate-only vs. escalate-plus-interim-workaround for Issues 1
   and 2. The two questions that were blocking this decision are now both
   answered (interleaving-omission: does not occur; duplicate-window:
   confirmed intended, Immutability Tax). This is a call for the user to
   make, not one resolved by this investigation.
3. If proceeding with the interim workaround: the completeness check only
   needs to confirm Archive received every `isGFS: true` point from the
   original response (day-set membership is fine now that the duplicate
   case is understood as expected Immutability Tax, not a failure signal);
   re-scope the implementation to `functions/api/vault-sizer.ts`; decide UI
   treatment (does the `moveDays` form field get rewritten, or does the
   user's input stay as typed with only a warning shown); decide exact
   fallback/disclaimer copy when detection fails.
4. Only once that design is complete, write the ADR for the Issues 1/2
   workaround.
5. Separately: decide whether to fix `getTotalStorageGB()` in
   `storage-tiers.ts` to include `performanceTierImmutabilityTaxGB` /
   `capacityTierImmutabilityTaxGB` in the reported total (see "Duplicate-
   window over-count" above) — a real, confirmed gap, unrelated to Issues
   1/2, not addressed as part of this investigation.
6. Re-run `node docs/evidence/sobr-archive-tier-no-capacity/probe.mjs`
   periodically (or once Veeam confirms a fix for Issues 1/2) — a change in
   its output means this document and any shipped workaround need to be
   revisited.

## Reproduce

```
node docs/evidence/sobr-archive-tier-no-capacity/probe.mjs                  # verify (exit 1 on drift)
node docs/evidence/sobr-archive-tier-no-capacity/probe.mjs --write-fixtures # refresh raw fixtures
```

Raw response bodies for the two confirmed bugs and the phantom-tier
mechanism check are captured alongside this file
(`issue1-*.json`, `issue2-*.json`, `mechanism-G-*.json`).
