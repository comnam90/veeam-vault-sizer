---
status: accepted
---

# Compare-table Immutable Days rows reuse the live form's requires-immutability gate, not raw values

An early draft of the in-session compare feature (plan: `2026-07-29-in-session-compare.md`, Task 5) rendered each entry's "Immutable (Days)" row directly from `repositoryConfig.primary.immutableDays` / `sobr.performanceImmutableDays` / `targetRepositoryImmutableDays`, unconditionally. That reproduces the stored value for every repo type, including ones — NAS, ReFS/XFS, Dedup Appliance — where the live form never shows an Immutable Days input at all (`repoTypeRequiresImmutability` gates its visibility there), so the value is a leftover default with no live-form meaning.

Caught during code-quality review before the value was ever exposed to a user. Escalated as a product decision rather than fixed silently: showing the stale default risks reading as a real, user-set immutability period for a repo type that has none, but suppressing it means the row can go blank in some columns of an otherwise-populated table — neither answer was obviously correct from the code alone.

**Decision**: gate every Immutable Days compare row through the same `repoTypeRequiresImmutability` predicate the live form (`backup-repository-card.tsx`, `sobr-builder.tsx`) already uses to decide whether to render the field, returning "—" when the type doesn't require immutability. Implemented in `compare-sizings.ts`'s `getPrimaryTargetConfigRows`/`getSecondaryConfigRows`.

**Consequences**: any future compare row sourced from a `RepositoryConfigValues` field the live form conditionally shows must be gated the same way — read the value only when the live form would have shown the input that produced it. Don't assume a stored field is meaningful just because it holds a value; `DEFAULT_REPOSITORY_CONFIG_VALUES` ships pre-populated defaults for fields the form may never surface.
