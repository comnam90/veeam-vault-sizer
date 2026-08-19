# Roadmap

This is a sequencing document — what ships when, and why that order. It does not define architecture or data models; those decisions live in `docs/adr/` (e.g. [ADR-0023](docs/adr/0023-advanced-mode-data-model-is-jobs-repos-backup-copy-jobs.md) for the Job/Repo/BackupCopyJob data model). This file should stay easy to reorder as priorities shift — if a section here starts restating _why_ something must be a certain shape rather than _when_ it ships, that content belongs in an ADR instead.

## MVP — share for feedback

Goal: validate that the sizing logic and UX are trustworthy to an SE, over a screen-share or a live link. No persistence — closing the tab loses the sizing.

- [x] Simple Mode: Workload Data card, Backup Repository Configuration card
- [x] Projected Sizing canvas (live sizing preview)
- [x] In-session, ephemeral compare — hold the current sizing alongside a tweaked one within the same browser session; does not survive a reload

## Phase 2 — Sizing details + persisted save

Can run in parallel; sizing details view has no data-model dependency.

- [ ] Sizing details view: restore points, sizing breakdown, trending/growth graphs
- [ ] Persisted save (browser-local storage): named configs that survive a reload, upgrading in-session compare to cross-session compare

Save is the first place a sizing gets serialized to a stored representation. That serialization is what Phase 3's export/import reuses — it should follow the data model fixed in ADR-0023 (Simple Mode saves as a length-1 Job/Repo/BackupCopyJob set), not invent a parallel shape.

## Phase 3 — JSON export / import

- [ ] Export the current sizing to a downloadable JSON file
- [ ] Import a JSON file back in

Reuses Phase 2's serialization. Import must accept both Simple Mode-shaped files (today) and Advanced Mode-shaped files (once Advanced Mode exists) without a format change, per ADR-0023.

## Phase 4 — XLSX export

- [ ] Human-readable spreadsheet export, suitable for handing to a customer

Built on the sizing details view's breakdown content (Phase 2) and the export plumbing (Phase 3). Closes out beta scope — see note below.

## Public Beta

Ships after Phase 4. Scope is Simple Mode only — a polished single-job, single-repo sizing workbench (sizing + compare + sizing details view + save + JSON export/import + XLSX export). Advanced Mode is explicitly **not** a beta gate; it's the fast-follow after beta ships.

_(Where exactly XLSX lands relative to the beta cutoff hasn't been separately confirmed — this roadmap places it inside beta scope, closing out the Simple Mode feature set before Advanced Mode work starts. Easy to move if that's wrong — flag it if XLSX should ship post-beta instead.)_

## Post-Beta — Advanced Mode (fast follow)

- [ ] Repository Manager: define multiple SOBR/standalone targets (Repos)
- [ ] Job Builder: tabular job-to-repository mapping (Jobs referencing Repos/BackupCopyJobs)
- [ ] Aggregate Projections: total front-end capacity vs. required back-end storage, broken down by tier
- [ ] Simple → Advanced promotion: open a Simple Mode sizing in Advanced Mode — dropping the length-1 constraint per ADR-0023, not a data transformation
- [ ] Import/export extended to genuinely multi-job/multi-repo files (the schema already supports this per ADR-0023; Simple Mode only ever exercises the length-1 case)

## Beyond / unscoped

Ideas not yet placed in a phase. Add here first; promote to a numbered phase once prioritized.

-
