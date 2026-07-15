---
status: accepted
---

# Vault AWS's Block Generation is 30 days, not 10

The 2026-07-06 SOBR tiering compatibility spec's support matrix collapsed Vault into a single row — "Vault: 10 days" — applying one Block Generation value to both the Vault Azure and Vault AWS repo types, on the assumption both variants shared the same batching window. `BLOCK_GENERATION_DAYS` (`types/simple-mode.ts`) was implemented to match: `"vault-azure": 10, "vault-aws": 10`.

Confirmed with the user that this was wrong: Vault AWS's Block Generation window is 30 days, matching AWS S3's object-storage batching window rather than Vault Azure's. The two Vault variants don't share a value just because they share the "Vault" label — each follows its own underlying cloud storage backend's batching cadence (Azure-backed types at 10 days, AWS/GCP-backed types at 30 days), the same pattern the spec's matrix already applied correctly to the non-Vault object-storage types (Azure Blob 10, AWS S3 30, Google Cloud 30).

**Decision**: `BLOCK_GENERATION_DAYS["vault-aws"]` is `30`, not `10`. `vault-azure` remains `10`.

**Consequences**: don't re-derive a single "Vault = 10 days" shortcut from memory or from the July spec doc (which is left as a historical record, not corrected in place) — the two Vault variants now diverge like every other Azure-vs-AWS/GCP pair in the table. If a future repo type is added that's Vault-branded but backed by a third cloud, its Block Generation value should be derived from its actual storage backend, not assumed to match either existing Vault entry.
