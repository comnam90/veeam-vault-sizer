---
status: accepted
---

# Advanced Mode's data model is Jobs, Repos, and BackupCopyJobs — Simple Mode is the length-1 projection

Advanced Mode doesn't exist yet, but Simple Mode's export/save format needs to be forward-compatible with it once it does — changing a format people have already saved or shared files against is expensive in a way changing internal component state isn't. This ADR pins the shape of that shared data model now, while the only consumer is still Simple Mode, so the eventual Advanced Mode work (Repository Manager, Job Builder, Aggregate Projections per the project brief) isn't retrofitted onto a schema that assumed one job and one repo.

**Decision**: the data model has three first-class, independently-referenceable entities:

- **Repo** — a target repository definition (standalone or SOBR with tiers), matching today's `RepositoryConfigValues` shape. Many Jobs and BackupCopyJobs can reference the same Repo by ID.
- **BackupCopyJob** — a secondary backup-copy target: a `repoId` plus its own retention/GFS settings, referenced by ID. Many Jobs can point at the same BackupCopyJob, sharing its capacity and retention policy as a single thing.
- **Job** — one real VBR backup job: workload data (source size, change rate, growth, retention/GFS) plus a direct reference to a primary Repo, and optionally a reference to a BackupCopyJob.

Simple Mode is this same model with exactly one Job, one Repo, and (if Backup Copy is enabled) one BackupCopyJob — not a separate, simpler format that later needs converting. Promoting a sizing from Simple to Advanced Mode is dropping the length-1 constraint, not a data transformation.

**Evidence**: this mirrors Veeam's own official calculator API, not just VBR's management UI. `UnstructuredInputObject` (`docs/official-calculator-api-swagger.json`) — a multi-workload sizing schema — gives each workload a `backup` reference (`retentionId`/`repoId`/`backupWindowId`) and an optional `copies` reference of the same shape, both pointing at IDs shared elsewhere in the request. The `BackupOptions` enum (`0 = Backup: standalone job`, `1 = Copy: data arrives via a backup copy job — a secondary copy created elsewhere`) confirms Backup Copy is modeled as a distinct entity that multiple workloads can share, not a per-job inline setting. This is also consistent with real VBR: a backup copy job is created and managed as its own object in the VBR console, with its own retention/GFS policy, and can ingest from more than one source backup job (N:1).

**Considered and rejected**: tagging a job↔repo mapping with a bare `role: "primary" | "secondary"` field, with retention/GFS carried inline per job per role. Rejected because it would let two jobs that are supposed to share one backup copy job diverge on retention/GFS settings — something the real product and its own sizing API don't allow, since the copy job owns exactly one retention policy regardless of how many source jobs feed it.

**Also considered and rejected**: fully mirroring the swagger's normalization by making retention/GFS its own shared, referenceable entity (a `retentionId` pointing at a policy pool, matching `UnstructuredInputObject` exactly). Rejected for now because it implies a "Retention Policy Manager" UI alongside the brief's already-scoped Repository Manager and Job Builder — scope the brief doesn't ask for. Retention/GFS stays inline on Job and on BackupCopyJob. This can be revisited if Advanced Mode usage shows people frequently want one retention policy applied identically across many jobs.

**Explicitly open / not decided by this ADR**: the exact wire/export schema (field names, JSON shape, a `schemaVersion` field for forward compatibility) is not pinned here. No export or import feature exists yet — this ADR fixes the conceptual model (three entities, their reference relationships, Simple Mode as length-1 projection) so that whenever export/import/Advanced Mode UI work actually starts, it has a foundation to build the concrete format against rather than re-deriving the model from scratch. Don't treat the shape of any future serialization as decided until that work happens.
