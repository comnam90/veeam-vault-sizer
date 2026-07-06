# SOBR Tiering Compatibility Validation Design

Date: 2026-07-06

## Purpose

The SOBR Builder currently lets an SE pick any repo type for Performance Tier and any Capacity-Tier-eligible type for Capacity Tier, but nothing stops them from describing a tier combination that VBR itself can't build — most notably, a Google Cloud object storage tier feeding Archive Tier, which VBR explicitly disallows regardless of whether that Google Cloud tier is Performance or Capacity. This spec adds the missing compatibility check so Simple Mode stays true to its role as an "authoritative validation console" (CLAUDE.md) rather than silently accepting an architecture the SE couldn't actually deploy.

**Source of truth, and a correction made during review:** the initial draft of this spec relied on a repo-type support matrix supplied by the user, which listed Google Cloud as ✅ for "Offload to Archive Tier" and ❌ only for a separately-named "Direct Data to Archive" path. Verifying that matrix against Veeam's own docs directly (fetched live, not from training data) surfaced two things:

1. Veeam's [Limitations for Archive Tier](https://helpcenter.veeam.com/docs/vbr/userguide/limitations_archive_tier.html) page (updated 8/13/2025) states the narrower claim: _"Veeam Backup & Replication does not support direct data transfer from performance extents that consist of Google Cloud Object Storage to archive extents."_ But that page's own first bullet defers to [Archive Tier](https://helpcenter.veeam.com/docs/vbr/userguide/archive_tier.html)'s "Direct Data Transfer to Archive Tier" section as the actual authority — the limitations page is a shorthand index, not an independent rule.
2. That authoritative section states the broader claim: _"Veeam Backup & Replication does not support direct data transfer from the performance or capacity tier that consists of Google Cloud object storage to the archive tier."_ VBR doesn't actually distinguish a "direct" path from an "offload" path the way the original matrix did — it only cares which tier is immediately upstream of Archive Tier (Performance, if there's no Capacity Tier; otherwise Capacity), and Google Cloud is disqualified from that role unconditionally.

The matrix is corrected accordingly: **Google Cloud is ❌ for feeding Archive Tier, full stop** — not ✅ for one path and ❌ for another. The rest of this spec reflects that correction.

### Corrected repo-type support matrix

| Bucket        | Performance Tier | Capacity Tier | Feeds Archive Tier                      | Block Generation |
| ------------- | ---------------- | ------------- | --------------------------------------- | ---------------- |
| Vault         | ✅               | ✅            | ✅                                      | 10 days          |
| Block / File  | ✅               | ❌            | ✅ (Performance-only, no Capacity Tier) | N/A              |
| Azure Blob    | ✅               | ✅            | ✅                                      | 10 days          |
| AWS S3        | ✅               | ✅            | ✅                                      | 30 days          |
| Google Cloud  | ✅               | ✅            | ❌                                      | 30 days          |
| S3 Compatible | ✅               | ✅            | ✅                                      | 10 days          |

"Feeds Archive Tier" replaces the original matrix's separate "Offload to Archive Tier" / "Direct Data to Archive" columns — VBR applies one rule to whichever tier is immediately upstream of Archive Tier, not two.

## Scope

**In scope:**

- One new relational validation rule: whichever tier is immediately upstream of Archive Tier (Capacity Tier's type if Capacity Tier is enabled, otherwise Performance Tier's type) must support feeding Archive Tier. Today that means: if Archive Tier is enabled and the effective upstream type is Google Cloud, it's an error — whether Google Cloud is sitting in Performance Tier (with no Capacity Tier) or in Capacity Tier itself.
- New domain data in `types/simple-mode.ts`: which repo types can feed Archive Tier, and each type's Block Generation period (10 days / 30 days / not applicable).
- Surfacing the new error inline in `sobr-builder.tsx`, matching the existing inline-error visual pattern, with wording that names whichever tier (Performance or Capacity) is actually at fault.

**Out of scope:**

- Any change to which types the Performance/Capacity Tier pickers offer. Capacity Tier's picker already excludes Block/File entirely (`CAPACITY_TIER_TYPES`), which is what stops Block/File from ever reaching Capacity Tier — that's a structural, state-independent fact about the type, not a new rule.
- Modeling the Archive Tier extent's own type (Amazon S3 Glacier / S3 Compatible with archiving / Azure Archive Storage are the only real options). The app has no Archive Tier type picker today, and adding one is a separate, larger piece of work than this validation pass.
- Wiring `BLOCK_GENERATION_DAYS` into any API request payload — there's no API integration in this codebase yet (per ADR-0001, that's Phase 3). This spec only adds the lookup table as ready-to-use domain data.
- IBM Cloud, Wasabi, 11:11 Cloud Object Storage as distinct repo types — not modeled today, unchanged by this spec.

## Rule

The only new _stateful_ rule, derived from the corrected matrix above:

> Whichever tier is immediately upstream of Archive Tier must support feeding it. That upstream tier is Capacity Tier's type if Capacity Tier is enabled; otherwise it's Performance Tier's type (the no-Capacity-Tier, Performance-direct case). Google Cloud is the only repo type that can never hold that role — not because of _which_ tier it sits in, but because VBR flatly excludes Google Cloud object storage from feeding Archive Tier at all.

This is a correction from an earlier draft of this spec, which modeled "Direct Data to Archive" (Performance-only) and "Offload to Archive Tier" (via Capacity) as two separately-gated paths, with Google Cloud blocked on only the first. That distinction doesn't exist in VBR's own docs and doesn't hold up: `CAPACITY_TIER_TYPES` already allows `"google-cloud"` as a Capacity Tier type today, and per Veeam's Archive Tier documentation, a Google Cloud Capacity Tier can't feed Archive Tier either. One condition, evaluated against whichever type is actually upstream, replaces both.

Every other combination in the matrix is already either always valid (every non-Google-Cloud type that's capable of reaching Capacity Tier can feed Archive from there) or already structurally prevented (Block/File can never be a Capacity Tier type, so its only route to Archive Tier is the Performance-direct one, which it supports).

## Data Model

New additions to `types/simple-mode.ts`, alongside the existing `REPO_TYPES_REQUIRING_IMMUTABILITY` / `repoTypeRequiresImmutability` pair:

```ts
// Google Cloud is the only repo type VBR disallows from feeding Archive Tier
// — whether it's the Performance Tier type (no Capacity Tier in between) or
// the Capacity Tier type itself. VBR draws no distinction between those two
// paths; this set applies to whichever type is immediately upstream.
export const REPO_TYPES_CANNOT_FEED_ARCHIVE_TIER = new Set<RepoType>([
  "google-cloud",
]);

export function repoTypeCanFeedArchiveTier(type: RepoType): boolean {
  return !REPO_TYPES_CANNOT_FEED_ARCHIVE_TIER.has(type);
}

// Object-storage-only immutability batching window (Block Generation).
// Block/File types are absent — they enforce immutability natively, no
// Block Generation concept applies.
export const BLOCK_GENERATION_DAYS: Partial<Record<RepoType, number>> = {
  "vault-azure": 10,
  "vault-aws": 10,
  "azure-blob": 10,
  "s3-compatible": 10,
  "aws-s3": 30,
  "google-cloud": 30,
};
```

`REPO_TYPES_CANNOT_FEED_ARCHIVE_TIER` is a denylist (currently one member) rather than an allowlist of the other nine types, so a future type defaults to "supported" unless explicitly added — matching how VBR's own default posture is permissive except for this one documented GCP limitation.

`RepositoryConfigErrors.sobr.archiveTier` gains one new optional field:

```ts
archiveTier?: {
  moveDays?: string;
  immutableDays?: string;
  archiveFeedUnsupported?: string;
};
```

## Validation Logic

In `validate-repository-config.ts`, inside the existing `if (archiveTier.enabled)` block, alongside the current `moveDays`/`immutableDays` checks:

```ts
if (archiveTier.enabled) {
  const archiveSourceType = capacityTier.enabled
    ? capacityTier.type
    : values.sobr.performanceType;

  if (!repoTypeCanFeedArchiveTier(archiveSourceType)) {
    const sourceLabel = REPO_TYPE_LABEL[archiveSourceType];
    archiveErrors.archiveFeedUnsupported = capacityTier.enabled
      ? `${sourceLabel} Capacity Tier can't send data to Archive Tier. ` +
        `Change the Capacity Tier repository type.`
      : `${sourceLabel} doesn't support sending data directly to Archive ` +
        `Tier without a Capacity Tier in between. Add a Capacity Tier ` +
        `(with a non-Google-Cloud type), or change the Performance Tier ` +
        `repository type.`;
  }
}
```

`archiveSourceType` is Capacity Tier's type when Capacity Tier is enabled, otherwise Performance Tier's type — matching VBR's own framing of "whichever tier is immediately upstream of Archive Tier," not two separately-gated paths. The message branches on which tier is actually at fault: telling an SE to "add a Capacity Tier" when the Capacity Tier they already added is the problem would be actively wrong advice.

The message is built from `REPO_TYPE_LABEL` rather than a hardcoded "Google Cloud" string, so if VBR's excluded set ever grows, the copy stays correct without a separate text change — `REPO_TYPES_CANNOT_FEED_ARCHIVE_TIER` remains the single source of truth for both the check and the message.

This condition is independent of the existing `moveDays`/`immutableDays` numeric checks in the same block — all three can coexist in `archiveErrors` at once if multiple things are wrong.

## UI Placement

Rendered once, in `sobr-builder.tsx`, at the top of the enabled Archive Tier block — right under the heading/Remove row, before the "Move GFS archives..." fields. Same `text-destructive text-xs` style used everywhere else in this card; not attached to a specific numeric input's `aria-invalid`, since the problem is the combination of fields, not a malformed number.

No new "banner" component is introduced — the existing inline-paragraph pattern already fits a whole-block-scoped message as well as a single-field one.

## Testing

- `validate-repository-config.test.ts` — new cases:
  - Performance `google-cloud` + Archive enabled + Capacity disabled → error, with the Performance-Tier-flavored message.
  - Performance `google-cloud` + Archive enabled + Capacity enabled **with a non-Google-Cloud capacity type** (e.g. the default `s3-compatible`) → no error. One test, two things it must make explicit in its name/setup: this is the tightened version of an ambiguous earlier case (it passes only because Capacity Tier's type is what matters once Capacity Tier exists, not because Google Cloud is categorically fine), and it's simultaneously the sanity check confirming Performance Tier's type is irrelevant once Capacity Tier is the tier actually feeding Archive. Not two separate tests — same setup, same assertion, both rationales belong in one test's description.
  - Capacity Tier type `google-cloud` + Archive enabled, regardless of Performance Tier's type → error, with the Capacity-Tier-flavored message ("change the Capacity Tier repository type").
  - Non-GCP performance (e.g. Hardened Repository or Vault Azure) + Archive enabled + Capacity disabled → no error.
  - Archive disabled entirely → no error regardless of performance type, capacity type, or Capacity Tier's enabled state.
- `sobr-builder.test.tsx` — one rendering test passing a constructed `errors` prop (matching the existing pattern in `retention-override-block.test.tsx`) confirming the message renders when present.
- No dedicated unit test for `repoTypeCanFeedArchiveTier` or `BLOCK_GENERATION_DAYS` — matches the existing convention where `repoTypeRequiresImmutability` and the `REPO_TYPE_LABEL`/`REPO_CATEGORY_LABEL` maps are exercised only through consumer tests (validator tests and component rendering tests), not tested directly. `BLOCK_GENERATION_DAYS` has no consumer yet, so there's nothing to exercise until the API integration lands.

## Explicitly deferred

- Consuming `BLOCK_GENERATION_DAYS` in an actual API request — Phase 3 work, per ADR-0001.
- An Archive Tier extent-type picker (Amazon S3 Glacier / S3 Compatible with archiving / Azure Archive Storage) — a separate, larger scope than this validation pass; noted here so it isn't lost.
- Any UI treatment beyond a single inline error message (e.g., a dismissible banner, a summary of all SOBR errors in one place) — not requested, and the existing per-field inline pattern already covers this case adequately.
