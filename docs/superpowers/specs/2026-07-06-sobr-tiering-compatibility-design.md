# SOBR Tiering Compatibility Validation Design

Date: 2026-07-06

## Purpose

The SOBR Builder currently lets an SE pick any repo type for Performance Tier and any Capacity-Tier-eligible type for Capacity Tier, but nothing stops them from describing a tier combination that VBR itself can't build — most notably, a Google Cloud performance extent sending data directly to Archive Tier with no Capacity Tier in between, which VBR explicitly disallows. This spec adds the missing compatibility check so Simple Mode stays true to its role as an "authoritative validation console" (CLAUDE.md) rather than silently accepting an architecture the SE couldn't actually deploy.

Source of truth for the rules: the repo-type support matrix supplied by the user, cross-referenced with Veeam's own [Limitations for Archive Tier](https://helpcenter.veeam.com/docs/vbr/userguide/limitations_archive_tier.html) and [Block Generation](https://helpcenter.veeam.com/docs/vbr/userguide/object_storage_block_generation.html) docs.

## Scope

**In scope:**

- One new relational validation rule: a Performance Tier repo type that doesn't support direct Performance→Archive transfer, combined with Archive Tier enabled and Capacity Tier disabled, is an error.
- New domain data in `types/simple-mode.ts`: which repo types support direct-to-archive, and each type's Block Generation period (10 days / 30 days / not applicable).
- Surfacing the new error inline in `sobr-builder.tsx`, matching the existing inline-error visual pattern.

**Out of scope:**

- Any change to which types the Performance/Capacity Tier pickers offer. Capacity Tier's picker already excludes Block/File entirely (`CAPACITY_TIER_TYPES`), which is what stops Block/File from ever reaching Capacity Tier — that's a structural, state-independent fact about the type, not a new rule. Every type capable of reaching Capacity Tier already supports offloading from Capacity to Archive, so no new rule is needed there.
- Modeling the Archive Tier extent's own type (Amazon S3 Glacier / S3 Compatible with archiving / Azure Archive Storage are the only real options). The app has no Archive Tier type picker today, and adding one is a separate, larger piece of work than this validation pass.
- Wiring `BLOCK_GENERATION_DAYS` into any API request payload — there's no API integration in this codebase yet (per ADR-0001, that's Phase 3). This spec only adds the lookup table as ready-to-use domain data.
- IBM Cloud, Wasabi, 11:11 Cloud Object Storage as distinct repo types — not modeled today, unchanged by this spec.

## Rule

The only new _stateful_ rule, derived from the matrix:

> If Archive Tier is enabled and Capacity Tier is **not** enabled, the data path is Performance → Archive directly. That path requires the Performance Tier repo type to support direct-to-archive. Google Cloud is the only type that doesn't.

Every other combination in the matrix is already either always valid (offloading from any possible Capacity Tier type to Archive) or already structurally prevented (Block/File can never be a Capacity Tier type, so it can never need the offload path).

## Data Model

New additions to `types/simple-mode.ts`, alongside the existing `REPO_TYPES_REQUIRING_IMMUTABILITY` / `repoTypeRequiresImmutability` pair:

```ts
// GCP is the only repo type VBR disallows for a direct Performance→Archive
// transfer (no Capacity Tier in between).
export const REPO_TYPES_UNSUPPORTED_FOR_DIRECT_ARCHIVE = new Set<RepoType>([
  "google-cloud",
]);

export function repoTypeSupportsDirectArchive(type: RepoType): boolean {
  return !REPO_TYPES_UNSUPPORTED_FOR_DIRECT_ARCHIVE.has(type);
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

`REPO_TYPES_UNSUPPORTED_FOR_DIRECT_ARCHIVE` is a denylist (currently one member) rather than an allowlist of the other nine types, so a future type defaults to "supported" unless explicitly added — matching how VBR's own default posture is permissive except for this one documented GCP limitation.

`RepositoryConfigErrors.sobr.archiveTier` gains one new optional field:

```ts
archiveTier?: {
  moveDays?: string;
  immutableDays?: string;
  directArchiveUnsupported?: string;
};
```

## Validation Logic

In `validate-repository-config.ts`, inside the existing `if (archiveTier.enabled)` block, alongside the current `moveDays`/`immutableDays` checks:

```ts
if (
  !capacityTier.enabled &&
  !repoTypeSupportsDirectArchive(values.sobr.performanceType)
) {
  const performanceLabel = REPO_TYPE_LABEL[values.sobr.performanceType];
  archiveErrors.directArchiveUnsupported =
    `${performanceLabel} doesn't support sending data directly to Archive ` +
    `Tier without a Capacity Tier in between. Add a Capacity Tier, or ` +
    `change the Performance Tier repository type.`;
}
```

The message is built from `REPO_TYPE_LABEL` rather than a hardcoded "Google Cloud" string, so if VBR's excluded set ever grows, the copy stays correct without a separate text change — `REPO_TYPES_UNSUPPORTED_FOR_DIRECT_ARCHIVE` remains the single source of truth for both the check and the message.

This condition is independent of the existing `moveDays`/`immutableDays` numeric checks in the same block — all three can coexist in `archiveErrors` at once if multiple things are wrong.

## UI Placement

Rendered once, in `sobr-builder.tsx`, at the top of the enabled Archive Tier block — right under the heading/Remove row, before the "Move GFS archives..." fields. Same `text-destructive text-xs` style used everywhere else in this card; not attached to a specific numeric input's `aria-invalid`, since the problem is the combination of fields, not a malformed number.

No new "banner" component is introduced — the existing inline-paragraph pattern already fits a whole-block-scoped message as well as a single-field one.

## Testing

- `validate-repository-config.test.ts` — new cases: GCP performance + Archive enabled + Capacity disabled → error present with the GCP-specific message; GCP performance + Archive enabled + Capacity enabled → no error (offload path is fine); non-GCP performance (e.g. Hardened Repository or Vault Azure) + Archive enabled + Capacity disabled → no error; Archive disabled entirely → no error regardless of performance type or Capacity state.
- `sobr-builder.test.tsx` — one rendering test passing a constructed `errors` prop (matching the existing pattern in `retention-override-block.test.tsx`) confirming the message renders when present.
- No dedicated unit test for `repoTypeSupportsDirectArchive` or `BLOCK_GENERATION_DAYS` — matches the existing convention where `repoTypeRequiresImmutability` and the `REPO_TYPE_LABEL`/`REPO_CATEGORY_LABEL` maps are exercised only through consumer tests (validator tests and component rendering tests), not tested directly. `BLOCK_GENERATION_DAYS` has no consumer yet, so there's nothing to exercise until the API integration lands.

## Explicitly deferred

- Consuming `BLOCK_GENERATION_DAYS` in an actual API request — Phase 3 work, per ADR-0001.
- An Archive Tier extent-type picker (Amazon S3 Glacier / S3 Compatible with archiving / Azure Archive Storage) — a separate, larger scope than this validation pass; noted here so it isn't lost.
- Any UI treatment beyond a single inline error message (e.g., a dismissible banner, a summary of all SOBR errors in one place) — not requested, and the existing per-field inline pattern already covers this case adequately.
