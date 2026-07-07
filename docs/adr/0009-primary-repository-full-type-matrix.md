---
status: accepted
---

# Primary Repository's allowed types span Vault, on-prem, and cloud-object storage

The Backup Repository Configuration card's UX draft named Backup Copy mode's first track "Primary On-Prem Repository," with a type picker limited to ReFS/XFS, Linux Hardened, and Windows/NAS — the assumption being that in a Backup Copy pipeline, "primary" always means existing on-premises hardware, and only the copy target is Vault/cloud.

**Decision**: Primary's repo-type picker allows the same full `RepoType` matrix as Performance Tier — Vault Azure, Vault AWS, and cloud-object storage types, in addition to the original on-prem set.

**Why**: two real architectures make the on-prem-only assumption wrong. First, Vault-to-Vault backup copy is a real scenario — copying across regions, or copying from Vault Advanced (unlimited restores) down to Vault Foundation (a 20%-restore-limit tier) for cost reasons. Second, the industry shift toward Direct-to-Object primary backup architectures means the primary landing zone is itself commonly an on-prem object platform (MinIO, Ceph, an NVMe object appliance) or a public cloud bucket, not classic filesystem-based storage. Excluding either case would leave Simple Mode unable to model increasingly common customer setups.

**Consequences**: the card's "Primary On-Prem Repository" label is "Primary Repository" throughout the design spec and implementation — the old name actively misleads a future reader into re-imposing the on-prem-only restriction this ADR removes. `PRIMARY_REPO_TYPES` and `PERFORMANCE_TIER_TYPES` (in `src/types/simple-mode.ts`) share one `ALL_REPO_TYPES` array by reference rather than being maintained as two separate lists that could silently drift apart.
