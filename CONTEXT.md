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
The single user-facing time span (in years) the Projected Sizing canvas projects forward. It governs both how far ahead storage-tier sizing forecasts growth and how many years the proxy-compute sizing compounds its own growth rate over — two assumptions the calculator API otherwise treats as independently configurable, unified here into one control (ADR-0016).
_Avoid_: "growth horizon", "projection window" (both leave ambiguous whether storage, compute, or both are meant)

**Total Required Storage**:
The sum of every configured tier's sized capacity (Performance + Capacity + Archive) — the headline figure the Projected Sizing canvas shows. Distinct from the calculator API's `totalStorageTB` response value, which reports Performance Tier alone despite the name.
_Avoid_: "total storage" on its own (ambiguous — could mean the API's Performance-tier-only field instead)

**Vault Minimum Retention**:
The fixed 30-day floor Veeam Data Cloud Vault requires data to remain on any Vault-typed location before removal or move-out — a retention/residency rule, independent of a tier's own configurable "Immutable for (Days)" setting (ADR-0013).
_Avoid_: "immutability floor", "immutability minimum" (conflates with the separate, already-existing `immutableDays` field)
