# Veeam Vault Sizer

A sizing and validation tool for Veeam Data Cloud Vault and Scale-Out Backup Repository (SOBR) configurations. It delegates the actual storage/compute math to Veeam's calculator API (ADR-0001) — its own job is making sure a described SOBR tier configuration is one VBR could actually deploy.

## Language

**Archive-Feed Source**:
The repository type immediately upstream of Archive Tier — Capacity Tier's type if Capacity Tier is enabled, otherwise Performance Tier's type. Determines whether Archive Tier can receive data at all, independent of which tier position that type happens to occupy (ADR-0012).
_Avoid_: "archive source type" (a code variable name, not the canonical term), "upstream repo type"

**Block Generation**:
VBR's immutability batching window for object-storage repository types — how many days of writes get grouped under a single object-lock extension (10 or 30 days, depending on the storage type). Distinct from a tier's own "Immutable for (Days)" setting, which is the user-configured immutability retention length, not the batching cadence.
_Avoid_: "immutability window" (conflates with the immutable-days field), "batching period"

**Driving Cadence**:
The shortest active GFS interval (7/30/365 days for Weekly/Monthly/Yearly, whichever non-zero count is most frequent) — the shared chain-completion reference used when computing every GFS class's lifetime. Veeam attaches Monthly/Yearly flags to whichever full is already being created on this cadence rather than spawning an independently-paced chain per class (ADR-0014).
_Avoid_: "chain interval", "backup frequency" (implies a configurable schedule this app doesn't model)

**Forecast Horizon**:
The single user-facing time span (in years) the Projected Sizing canvas projects forward. It governs how far ahead storage-tier sizing forecasts growth, how many years the proxy-compute sizing compounds its own growth rate over, and — when the "Cap GFS retention to Forecast Horizon" toggle is on (the default) — the maximum count sent for each GFS class, so a class's total duration (count × period) never exceeds it. These are assumptions the calculator API otherwise treats as independently configurable, unified here into one control (ADR-0016, ADR-0019).
_Avoid_: "growth horizon", "projection window" (both leave ambiguous whether storage, compute, GFS retention, or all three are meant)

**Immutability Tax**:
Capacity a still-immutability-locked restore point occupies in its original tier _in addition to_ wherever it's been moved, because the lock prevents reclaiming that space until it expires. Reported per-tier via `performanceTierImmutabilityTaxGB`/`capacityTierImmutabilityTaxGB` on the calculator API response; the official calculator UI labels the same figure "Immutability overhead." Distinct from Block Generation (a batching _window_, not an occupied-capacity figure) and Vault Minimum Retention (a residency _floor_, not a transitional double-occupancy cost).
_Avoid_: "immutability overhead" (the UI's label — keep code/docs consistent with the API field name instead), "duplicate-window" (an earlier, since-resolved working name for the same phenomenon, from before the field was found)

**Total Required Storage**:
The sum of every configured tier's sized capacity (Performance + Capacity + Archive) — the headline figure the Projected Sizing canvas shows. Distinct from the calculator API's `totalStorageTB` response value, which reports Performance Tier alone despite the name.
_Avoid_: "total storage" on its own (ambiguous — could mean the API's Performance-tier-only field instead)

**Vault Minimum Retention**:
The fixed 30-day floor Veeam Data Cloud Vault requires data to remain on any Vault-typed location before removal or move-out — a retention/residency rule, independent of a tier's own configurable "Immutable for (Days)" setting (ADR-0013).
_Avoid_: "immutability floor", "immutability minimum" (conflates with the separate, already-existing `immutableDays` field)

### Advanced Mode Data Model

**Workload Data**:
The data profile a Job sizes from — source size, daily change rate, data reduction, yearly growth, and its own retention/GFS points (`WorkloadDataValues`). Describes only the data being protected; a Job is Workload Data plus where it lands.
_Avoid_: "workload" alone as if it already includes target/repo wiring

**Job**:
One real VBR backup job — a Workload Data profile plus a reference to the single Repo it backs up to and, optionally, a reference to a BackupCopyJob (ADR-0023). The "job-to-repository mapping" the project brief describes is this reference itself, not a separate join entity.
_Avoid_: "primary target" for the Job's own Repo (ADR-0007's "Primary" is Simple Mode's Copy-mode-specific label for this same Repo — the general model needs no adjective, since a Job has exactly one); "mapping" as if it names a distinct object

**Repo**:
A target repository definition (standalone, or SOBR with Performance/Capacity/Archive tiers) that Jobs and BackupCopyJobs reference by ID (ADR-0023). Distinct from `RepoType`, the storage backend/media type — Vault Azure, Hardened Repository, etc. — which is one ingredient in a Repo's tiers, not the whole configured target.
_Avoid_: "repository" alone when `RepoType` specifically is meant

**BackupCopyJob**:
A secondary backup-copy target — a Repo reference plus its own retention/GFS policy, referenced by ID so multiple Jobs can share one and have their data sized together under a single capacity/retention policy (ADR-0023). Generalizes ADR-0007's per-job "Secondary" into a shareable entity; mirrors how VBR itself manages backup copy jobs as their own objects, separate from the source jobs that feed them.
_Avoid_: "secondary target", "copy target" alone (both obscure that it's a shareable, independently-identified entity, not a per-job flag)

**Length-1 Projection**:
Simple Mode's data is exactly one Job, one Repo, and (if Backup Copy is enabled) one BackupCopyJob — the same three entities Advanced Mode uses, just held to a count of one each (ADR-0023). Promoting a sizing to Advanced Mode means lifting that count constraint, not converting between two different formats.
_Avoid_: "simple format", "simplified schema" (both imply Simple Mode uses a lesser/different shape rather than the same model at length one)
