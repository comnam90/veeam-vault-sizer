---
status: accepted
---

# Vault minimum-retention validation doesn't reopen ADR-0011's Archive Tier deferral

ADR-0011 deferred Archive Tier's own minimum-storage-period guardrail (early-deletion penalties on Glacier/Azure Archive's mandated retention floors, e.g. 180 days) for two stated reasons: no Archive Tier extent-type picker exists to gate the check on, and `VmAgentRequest` has no parameter for it, so Phase 3 sizing couldn't act on it anyway.

Building the Vault minimum-retention check (spec: `2026-07-06-vault-minimum-retention-design.md`) raised the question of whether to bring the Archive Tier guardrail in now, since the new check's residency machinery (entry/exit day math, per-class lifetime) is structurally reusable for exactly that case.

**Decision**: keep deferring the Archive Tier guardrail. The SE chose this explicitly when offered the alternative (a minimal Archive extent-type flag scoped into this same pass). The blocking reason still holds: there's no Archive Tier extent-type field today, so there's nothing to gate a Glacier/Azure-Archive-specific floor on, and different extent types carry different (or no) mandated minimums.

**Correction to ADR-0011's stated reasoning**: its second reason — no `VmAgentRequest` parameter — was specifically about the _sizing engine_ needing an API field to compute cost accounting for the floor. It was never actually a blocker for a pure UI _validation_ guardrail like the Vault check, since validation never touches `VmAgentRequest` at all. Don't cite "no API field" as a reason to avoid _validating_ something in the future — that reasoning only applies when the goal is feeding a value into the sizing request itself.

**Consequences**: when an Archive Tier extent-type picker eventually gets built, wiring in its mandated-minimum floor (e.g. 180 days for Glacier/Azure Archive) is a small addition — one lookup table keyed by extent type, plus one more call into the residency-check module the sibling spec introduces — not a second validation system. This ADR and ADR-0011 should be read together; neither supersedes the other.
