---
status: accepted
---

# Vault's minimum retention floor is a fixed constant, independent of `immutableDays`

While designing the Vault minimum-retention validation (spec: `2026-07-06-vault-minimum-retention-design.md`), the most natural first hypothesis was that Vault's 30-day floor _is_ the `immutableDays` field already present on every Vault-typed tier — object storage immutability reconciliation (`veeam_data_cloud_details.md`: "actual retention = max(job retention, immutability period) + Block Generation period") looked like it could be the mechanism producing an early-eviction failure.

It isn't. Immutability reconciliation only ever _extends_ the actual deletion date to satisfy the lock — it never lets data leave a tier early. Applying it to the SE's worked example (Capacity Tier arrival on day 14, default 30-day immutability) means the block can't be deleted before day 44, not day 30 as the example assumed. The mechanism can't produce the "moved out / deleted too early" failure this validation exists to catch.

**Decision**: the Vault minimum-retention check uses a fixed `VAULT_MINIMUM_RETENTION_DAYS = 30` constant, entirely independent of each tier's own configurable `immutableDays` field. The two are separate concerns: `immutableDays` governs a hard technical delete-lock (already separately validated); this constant governs whether the SE's configured retention/move-day numbers imply a tier gets emptied before Vault's minimum retention floor, regardless of what immutability is doing underneath.

**Consequences**: don't derive or cross-check this floor from `immutableDays` — they're allowed to diverge (an SE could set `immutableDays` to 60 on a Vault tier; the residency check still only enforces 30). If a future requirement genuinely needs residency to also respect a tier's own `immutableDays` value, that's an additional rule layered on top, not a replacement for this one.
