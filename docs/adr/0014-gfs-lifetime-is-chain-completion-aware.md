---
status: accepted
---

# GFS point lifetime is chain-completion-aware, not a naive count × period

A first pass at the Vault minimum-retention check (spec: `2026-07-06-vault-minimum-retention-design.md`) modeled a GFS class's lifetime as simply `count × period` — e.g. `gfsWeekly=4` on a 7-day cadence surviving 28 days. Worked spreadsheet examples from the SE showed this undercounts: a GFS-flagged full can't be purged until every restore point in its dependent incremental chain has also cleared short-term retention. For `gfsWeekly=4` and 30-day retention, the oldest weekly point's chain has its last incremental 6 days after the full; that point still needs a full 30-day retention window on top, pushing the real floor to 36 days, not 28.

A second correction: Monthly and Yearly GFS points don't spawn their own independently-paced chains at their own period (30 / 365 days). Veeam attaches a Monthly or Yearly flag to whichever full is already being created on the actual driving cadence — in a job with Weekly GFS enabled, that's the same weekly full, not a separate monthly one. So the chain-completion term uses one shared **Driving Cadence** (the shortest active GFS interval — see `CONTEXT.md`) across every class, not each class's own period.

**Decision**: `lifetime = max(count × period, (drivingCadence − 1) + retentionDays)` for each active GFS class. Plain Daily/short-term points are deliberately kept at a flat `lifetime = retentionDays`, not folded into the same chain-aware formula, even though the same chain-dependency logic arguably applies to them too — see "Why Daily stays flat."

**Why Daily stays flat**: two reasons, not an oversight. It reproduces the SE's own worked example arithmetic exactly (`30 − 14 = 16` days, not a chain-aware `36 − 14 = 22`). And it's the shorter, more conservative number for a tool whose entire purpose is catching early eviction — a flat Daily lifetime can only make the check fire _more_ readily, never mask a real violation.

**Consequences**: a future reader "fixing" the Daily/GFS asymmetry to be consistent (making Daily chain-aware too) will change displayed residency numbers in existing test cases (e.g. the 16-day example becomes 22) without changing any pass/fail outcome — expected, not a regression, if ever done deliberately. Monthly/Yearly's period uses round numbers (30/365 days) rather than calendar-exact month/year math, since their `count × period` term dominates the `max()` in virtually every realistic configuration regardless of which convention is used.
