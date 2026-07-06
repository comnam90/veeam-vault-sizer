# Veeam Vault Sizer

A sizing and validation tool for Veeam Data Cloud Vault and Scale-Out Backup Repository (SOBR) configurations. It delegates the actual storage/compute math to Veeam's calculator API (ADR-0001) — its own job is making sure a described SOBR tier configuration is one VBR could actually deploy.

## Language

**Archive-Feed Source**:
The repository type immediately upstream of Archive Tier — Capacity Tier's type if Capacity Tier is enabled, otherwise Performance Tier's type. Determines whether Archive Tier can receive data at all, independent of which tier position that type happens to occupy (ADR-0012).
_Avoid_: "archive source type" (a code variable name, not the canonical term), "upstream repo type"

**Block Generation**:
VBR's immutability batching window for object-storage repository types — how many days of writes get grouped under a single object-lock extension (10 or 30 days, depending on the storage type). Distinct from a tier's own "Immutable for (Days)" setting, which is the user-configured immutability retention length, not the batching cadence.
_Avoid_: "immutability window" (conflates with the immutable-days field), "batching period"
