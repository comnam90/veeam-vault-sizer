---
status: accepted
---

# Google Cloud's Archive Tier exclusion is one rule, not two separately-gated paths

An earlier draft of the SOBR tiering compatibility work (spec: `2026-07-06-sobr-tiering-compatibility-design.md`) modeled Google Cloud's Archive Tier restriction as two distinct cases: a "Direct Data to Archive" path (Performance Tier feeding Archive Tier with no Capacity Tier in between) and an "Offload to Archive Tier" path (via Capacity Tier), with Google Cloud blocked only on the first. That reading came from a user-supplied support matrix and is the natural way to interpret `VmAgentRequest`'s flat `archiveTierEnabled`/`archiveTierStandalone`/`archiveTierDays` shape, which draws no such distinction itself.

Verifying against Veeam's live documentation (not training data) showed this was wrong. [Archive Tier's "Direct Data Transfer to Archive Tier" section](https://helpcenter.veeam.com/docs/vbr/userguide/archive_tier.html) states VBR "does not support direct data transfer from the performance **or capacity** tier that consists of Google Cloud object storage to the archive tier" — one rule, evaluated against whichever tier is immediately upstream of Archive Tier, not two independently-gated scenarios.

**Decision**: `repoTypeCanFeedArchiveTier` (`types/simple-mode.ts`) and its caller in `validate-repository-config.ts` model this as a single check against one `archiveSourceType` — Capacity Tier's type if Capacity Tier is enabled, otherwise Performance Tier's type. There is no separate "standalone/direct" code path and there should never be one for this rule.

**Consequences**: don't reintroduce a Performance-vs-Capacity distinction for this specific rule (e.g. "allow Google Cloud in Capacity Tier since it's not feeding Archive directly") — that's the exact error this ADR exists to prevent. If a future repo type needs an asymmetric restriction (blocked in one tier position but not the other), that's a genuinely new rule shape, not evidence this one was wrong.
