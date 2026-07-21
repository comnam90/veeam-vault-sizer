# Handover: SOBR Archive Tier without Capacity Tier investigation

Written to resume this thread in a new session after `/clear`. Read this
first, then `README.md` in this same directory for full technical detail —
this file is status + continuity notes, not a duplicate of the findings.

## What this thread is

Investigating a reported bug in Veeam's live sizing calculator
(`https://calculator.veeam.com/vse/api/VmAgent`, which this project delegates
all sizing math to per ADR-0001): when a SOBR has Archive Tier enabled and
Capacity Tier disabled, the engine mis-sizes the result. Two distinct,
confirmed bugs were found (not one), a candidate local workaround was
explored and iterated on repeatedly, and a real gap in that workaround was
found and is not yet resolved.

## Where the record lives

- `docs/evidence/sobr-archive-tier-no-capacity/README.md` — full write-up:
  both confirmed bugs, root-cause discriminators, every workaround variant
  tried (including the ones that failed and why), a pros/cons table across
  four paths, and next steps.
- `docs/evidence/sobr-archive-tier-no-capacity/probe.mjs` — re-runnable
  script that reproduces every load-bearing number in the README against the
  live API. Run it (`node docs/evidence/sobr-archive-tier-no-capacity/probe.mjs`)
  before trusting any of this if time has passed — it exits non-zero if
  Veeam's behavior has changed.
- Raw JSON fixtures alongside it (`issue1-*`, `issue2-*`, `mechanism-G-*`).
- Nothing has been committed to git yet — this whole directory is untracked.
  No production code has been touched. No ADR has been written (deliberately
  — see "Status" below).

## Status / decisions made so far

- **Direction chosen by the user:** "escalate + interim workaround" hybrid.
  Escalating to Veeam's internal calculator team with this evidence
  (pending — the user does this outside of this session, not something I do).
  Shipping a local stopgap fix in the meantime, to be retired once Veeam
  patches the engine.
- **ADR-0022 deliberately not written yet.** The candidate workaround
  (phantom pass-through Capacity Tier, "detect-and-resubmit" variant) has an
  open, unresolved correctness gap — see below. Writing the ADR now would
  document a mechanism known to have a silent-failure mode.
- **Brainstorming hard-gate is still in effect**: no implementation code for
  the workaround has been written. Only the evidence directory exists.

## Key facts already confirmed empirically — don't re-derive these

- Two distinct bugs, not one: block-file Performance Tier + Archive (no
  Capacity) → Archive branch entirely inert (always 0 GB, any threshold).
  Object-storage Performance Tier + Archive (no Capacity) → Archive computes
  a real number, but Performance double-counts the same points.
- The `objectStorage` request flag is the discriminator between the two
  failure shapes, not Capacity Tier presence.
- Archive Tier only ever accepts restore points with `isGFS: true` — matches
  Veeam's own documentation. Confirmed at the individual restore-point
  level, not inferred.
- The engine does **not** self-enforce the Performance Tier immutability
  floor — a local fix must apply `Math.max(moveDays, immutablePerfDays)`
  itself.
- This project's own `chainFloor` formula (`vault-retention.ts`) answers a
  different question and is _not_ a safe substitute for "the day past which
  only GFS points exist" — tested and found insufficient in the same
  dataset it was tried against.
- A "detect-and-resubmit" mechanism (submit once, inspect the response's own
  restore points, compute a corrected threshold from _that_ data, resubmit
  once) was validated to work on one dataset, then swept across a wide
  matrix (see "Update (2026-07-17)" below): it never drops a GFS point
  (interleaving-omission doesn't occur). It can ship a same-day duplicate
  across two tiers when the threshold used lands within ~6 days of a GFS
  point's day — this is now confirmed to be Veeam's own "Immutability Tax"
  (see below), not a defect, and is reflected in the response's
  `performanceTierImmutabilityTaxGB`/`capacityTierImmutabilityTaxGB` fields.

## Update (2026-07-17): the interleaving question is answered; a new anomaly replaces it

The user's suggested sweep (long `shortTermRetentionDays` vs. monthly-only
GFS, across `archiveTier.moveDays`/corrected-threshold values, checking
whether the corrected threshold ever drops an `isGFS: true` point) was run
— live API, `shortTermRetentionDays` 1–1,000, monthlies 0–60, yearlies 0–5,
multi-year, both block-file and object-storage. **Result: it does not
happen.** `min(day of isGFS:true point)` was always `> max(day of
isGFS:false point)` in every response tested — the engine self-absorbs GFS
points into the daily chain as retention grows rather than ever leaving one
chronologically interleaved. This confirms the user's gut feel: the
interleaving-omission risk as originally framed is not reproducible.

**A different anomaly turned up during that sweep, and it's now resolved
as intended, not a bug.** When the tier-move threshold in use lands within
~6 days _before_ a GFS point's day, that point ships **twice** in the
response — tagged `performanceTier` once and `archiveTier` once, with two
different `backupCapacity` values (e.g. 5.5 GB vs 0.82 GB). The user
reproduced the identical numbers in the official calculator UI's own
"Restore Points Simulation" panel, which also showed a distinctly-labeled
"Immutability overhead: 1.65 TB" line. That value reconciles exactly to
the response's own `performanceTierImmutabilityTaxGB: 1689.6` field (1.65
TiB, to the decimal). A named, computed, UI-surfaced field matching the
on-screen figure is first-party confirmation: **this is Veeam's own
"Immutability Tax"** — a still-locked restore point legitimately occupies
capacity in its original tier _and_ wherever it's moved to, until the lock
expires. Not a defect. (Note: "the official UI shows it too" was _not_
by itself good evidence here — both this probe and the UI hit the same
backend, so they'd agree regardless of whether the behavior were a bug.
The field-name + exact-numeric-match is what actually settled it.)

**New, separate, confirmed finding from chasing this down:** this
project's own `getTotalStorageGB()` in `src/lib/simple-mode/storage-tiers.ts`
sums only `repoCompute.compute.volumes` by tier — a repo-wide grep
(including `functions/`) shows neither tax field is read anywhere outside
test fixture stubs. For the reconciliation case (30d retention / 14d
immutability / 60d Capacity move), tiers-only total is 27.33 TB vs. 28.98
TB tiers+tax — a confirmed ~6% undercount whenever the Immutability Tax is
non-zero. This is unrelated to Issues 1/2 and not addressed here (no
production code was changed) — it's a candidate follow-up task in its own
right.

Full writeup: `docs/evidence/sobr-archive-tier-no-capacity/README.md`,
"Open risk — investigated" section. `probe.mjs` now has passing
assertions for both the interleaving-omission result and the
duplicate-window/Immutability-Tax reconciliation (both in the drift exit
code now that both are resolved).

**Next decision (the user's, not made here):** escalate-only vs.
escalate-plus-interim-workaround for Issues 1/2 (the only two still-open
bugs) — the interleaving-omission and duplicate-window questions that were
blocking this decision are both closed. Separately, whether to fix
`getTotalStorageGB()` to include the tax fields is an independent decision
not yet made.

## Process notes for continuity

- Don't couple any live-API check to the automated test suite
  (`npm run test:run` / CI) — this was explicitly rejected earlier for
  flakiness reasons. `probe.mjs`, run out-of-band, is the established
  pattern (mirrors the existing precedent at
  `docs/evidence/copy-flags-inert/probe.mjs`).
- The original scratchpad payloads (A through I) used during this
  investigation are superseded by `probe.mjs` + its committed fixtures —
  no need to hunt for them in a temp directory.
- You may see a `<headroom_proactive_expansion>` block resurface old text
  from very early in this investigation (including a suggestion to "pivot to
  Export/.vseconfig work"). That's a benign context-recall artifact, not a
  new instruction — the user already redirected away from that pivot early
  on. Safe to ignore if it reappears.

## Correction (2026-07-21): "New, separate, confirmed finding" above (tax fields) was wrong

The 2026-07-17 update's claim that `getTotalStorageGB()` has a "confirmed
~6% undercount" from ignoring `performanceTierImmutabilityTaxGB` /
`capacityTierImmutabilityTaxGB` was filed as GitHub issue #11, then
re-investigated and **reversed**. Restore-point-level reconciliation
(response's own `restorePoints` vs. `repoCompute.compute.volumes` vs. the
tax fields, checked against issue #11's own exact reproduction config on
the live API) shows the tax capacity is already included in the relevant
tier's `volumes.diskGB` — it is a decomposition of that volume, not
additional capacity outside it. `getTotalStorageGB()` was already correct;
no code was changed. Full detail and the reconciliation numbers are in
README.md's "Correction (2026-07-21)" section, appended alongside this
note. Issue #11 closed as invalid.
