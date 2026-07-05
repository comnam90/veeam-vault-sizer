---
status: accepted
---

# Archive Tier's "standalone" setting means independent full backups, not bypassing Capacity Tier

`VmAgentRequest.archiveTierStandalone` sits alongside `archiveTierEnabled` and `archiveTierDays`, and the name reads naturally as "can Archive Tier run standalone, i.e. without a Capacity Tier in between Performance and Archive?" That reading is wrong, and specifically wrong enough that it was assumed at least once during this project's own design process before being corrected.

**Decision**: `archiveTierStandalone` — surfaced in Simple Mode as the "Standalone full backups (no shared blocks)" checkbox inside the Archive Tier row — models a real VBR setting: whether backups offloaded to Archive Tier are created as fully independent backups with no shared blocks, versus the default synthetic-full behavior where each backup shares common blocks with the previous backups in its chain. It has no relationship to whether Capacity Tier exists.

Separately, but easily conflated with the above: Archive Tier's availability is **not** gated behind Capacity Tier being enabled. A pipeline that goes Performance Tier → Archive Tier directly, with no Capacity Tier at all, is a valid, real configuration — confirmed against actual product behavior, not inferred from the API shape.

**Consequences**: the "+ Add Archive Tier" affordance in `sobr-builder.tsx` is enabled regardless of Capacity Tier's `enabled` state, and `standaloneFullBackups` is its own independent checkbox with no connection to Capacity Tier's enabled/disabled logic anywhere in `validate-repository-config.ts` or the UI. Don't "simplify" this by re-coupling the two — that reintroduces the exact misreading this ADR exists to prevent.
