---
date: 2026-07-16
status: Approved (brainstorm), pending implementation plan
branch: frontend-integration-sizing-canvas
supersedes: 2026-07-15-backup-copy-dual-pipeline-and-canvas-cleanup-design.md (D5 titles, D8 badges)
implements: ADR-0021
---

# Topological site labels + Projected Sizing canvas DRY refactor — design

## Problem

Three follow-ups after `2026-07-15-backup-copy-dual-pipeline-and-canvas-cleanup.md` shipped (PR #9):

1. **Geographic site titles overclaim.** "Primary — On-Premises Landing Zone" / "Secondary — Offsite Cloud Vault" assume a topology the domain model doesn't guarantee (ADR-0021).
2. **`ProjectedSizingCard` duplicates the direct-mode layout** instead of reusing `SiteSizingSection`, and `build-vm-agent-request.ts`'s Secondary/direct dispatch (`targetRepository !== "sobr" ? buildStandaloneRepoInputs(...) : buildSobrInputs(...)`) is written out twice.
3. **Copy-mode responses have no test coverage** in `vault-sizer-client.test.ts` or `use-calculated-sizing.test.ts` — both files only ever mock `mode: "direct"`.

## Decisions

- **D11 — Topological titles, per-tier tech labels (supersedes D5/D8).** See ADR-0021. Direct mode: one `SiteSizingSection` titled "Primary Repository". Copy mode: two sections, "Primary Repository" / "Secondary Repository". No section-level badge; instead each tier row in `StorageBreakdown` gets an optional suffix — `"Performance — Hardened Repository"`, `"Capacity — Vault Azure"`, bare `"Archive"` (Archive Tier has no user-selectable `RepoType` in `ArchiveTierConfig`, so it never gets a suffix).

- **D12 — Tier-label derivation is one shared function, reused by Direct's target and Copy's Secondary** (they already share the same `targetRepository`/`sobr` dispatch): standalone (`targetRepository !== "sobr"`) → `{ performance: REPO_TYPE_LABEL[targetRepository] }` only. SOBR → `{ performance: REPO_TYPE_LABEL[sobr.performanceType], capacity: sobr.capacityTier.enabled ? REPO_TYPE_LABEL[sobr.capacityTier.type] : undefined }` (no `archive` key — ever). Copy's Primary is always standalone (any `RepoType`) → `{ performance: REPO_TYPE_LABEL[primary.repoType] }`.

- **D13 — `SiteSizingSection` becomes the universal rendering engine, `data` becomes nullable.** Direct mode's `data` is `null` until the first response lands; `SiteSizingSection` must render the same "—" placeholder state `StorageBreakdown` already handles for `null`, and must not dereference `data.proxyCompute` when `data` is `null`. `ProjectedSizingCard`'s direct branch collapses to a single `<SiteSizingSection title="Primary Repository" tierLabels={...} data={directData} .../>` call; the duplicate flat-layout JSX block is deleted entirely.

- **D14 — Combined-header subline drops geographic wording and its independent-rounding bug.** "On-Premises X TB + Offsite Vault Y TB" becomes "Primary X TB + Secondary Y TB", and — since this line is being rewritten anyway — the second figure is computed as `combinedTB - primaryTB` from the same single rounding pass as the headline, not as its own independent `getTotalStorageGB(secondary)/1024` rounding. This removes the cosmetic inconsistency the final code review on the prior PR flagged (headline and subline could disagree by 0.1 TB at certain boundary values). D6 (combined total = sum of both sites' tier storage) is unchanged.

- **D15 — `buildTargetInputs` extracts the repeated target/SOBR dispatch.** Pure helper, typed against `TargetRepository` (not `string`, to keep the exhaustiveness the rest of the module relies on):

  ```ts
  function buildTargetInputs(
    base: VmAgentInputs,
    targetRepository: TargetRepository,
    immutableDays: string,
    sobr: RepositoryConfigValues["sobr"],
  ): VmAgentInputs {
    return targetRepository !== "sobr"
      ? buildStandaloneRepoInputs(base, targetRepository, immutableDays)
      : buildSobrInputs(base, sobr);
  }
  ```

  Both `buildVmAgentRequest`'s SOBR/standalone branch and `buildCopyVmAgentRequests`'s Secondary allocation call this instead of repeating the ternary. Pure refactor — output is unchanged; the existing direct-mode and copy-mode test suites are the regression guard.

- **D16 — Close the copy-mode test gap.** `vault-sizer-client.test.ts` gets a test asserting a `mode: "copy"` response maps to `{ mode: "copy", primary, secondary }` unmutated. `use-calculated-sizing.test.ts` gets a test asserting a copy-mode payload settles into hook state with `isLoading`/`error` behaving the same as the existing direct-mode tests.

## Architecture (unchanged from the prior spec)

The BFF fan-out, discriminated `SizerBffResponse`/`SizerResult` union, and fail-whole worker logic are untouched by this pass — this is a presentation-layer relabeling plus an internal DRY refactor, not a contract change.

## Section 1 — Request builder consolidation

`src/lib/simple-mode/build-vm-agent-request.ts`: add `buildTargetInputs` (D15) above `buildVmAgentRequest`. `buildVmAgentRequest`'s body becomes:

```ts
const base = buildBaseInputs(
  workloadData,
  resolveEffectiveRetention(workloadData),
);
return buildTargetInputs(
  base,
  repositoryConfig.targetRepository,
  repositoryConfig.targetRepositoryImmutableDays,
  repositoryConfig.sobr,
);
```

`buildCopyVmAgentRequests`'s Secondary allocation becomes:

```ts
const secondary = buildTargetInputs(
  secondaryBase,
  repositoryConfig.targetRepository,
  repositoryConfig.targetRepositoryImmutableDays,
  repositoryConfig.sobr,
);
```

`buildStandaloneRepoInputs` and `buildSobrInputs` are unchanged and stay module-private (not exported) — only `buildTargetInputs`'s two callers change.

## Section 2 — Tier-label mapping

New export from `src/lib/simple-mode/storage-tiers.ts` (it already owns `TierStorageRow`'s `key` union, so the label-key type and its consumer helper belong together):

```ts
export type TierLabels = Partial<Record<TierStorageRow["key"], string>>;

export function getTargetTierLabels(
  targetRepository: TargetRepository,
  sobr: RepositoryConfigValues["sobr"],
): TierLabels {
  if (targetRepository !== "sobr") {
    return { performance: REPO_TYPE_LABEL[targetRepository] };
  }
  const labels: TierLabels = {
    performance: REPO_TYPE_LABEL[sobr.performanceType],
  };
  if (sobr.capacityTier.enabled) {
    labels.capacity = REPO_TYPE_LABEL[sobr.capacityTier.type];
  }
  return labels;
}
```

Copy's Primary needs no helper — it's always standalone: `{ performance: REPO_TYPE_LABEL[repositoryConfig.primary.repoType] }` inline at the call site.

`StorageBreakdown` takes a new optional `tierLabels?: TierLabels` prop; each tier row renders `tierLabels?.[tier.key] ? `${tier.label} — ${tierLabels[tier.key]}`` : tier.label`instead of bare`tier.label`.

## Section 3 — `SiteSizingSection` becomes universal, nullable `data`

`SiteSizingSectionProps` changes `data: CVmAgentReturnObject` → `data: CVmAgentReturnObject | null`, drops `badge: string`, adds `tierLabels: TierLabels`. Every `data.proxyCompute` access becomes `data?.proxyCompute` (matching how `StorageBreakdown` and the old direct-mode branch already handled `null`).

`ProjectedSizingCard`:

- Direct/null branch → one `<SiteSizingSection title="Primary Repository" tierLabels={getTargetTierLabels(repositoryConfig.targetRepository, repositoryConfig.sobr)} data={directData} initialFullRestore={initialFullRestore} />`. The old flat-layout JSX block (`StorageBreakdown` + `InfrastructureTelemetry` + `NetworkBandwidth` inline) is deleted.
- Copy branch → two `SiteSizingSection`s titled `"Primary Repository"` / `"Secondary Repository"`, `tierLabels` from `{ performance: REPO_TYPE_LABEL[repositoryConfig.primary.repoType] }` and `getTargetTierLabels(...)` respectively (same helper as direct's Secondary-equivalent dispatch).
- Combined-header subline (D14): `Primary {primaryTB.toFixed(1)} TB + Secondary {(combinedTB - primaryTB).toFixed(1)} TB` where `combinedTB`/`primaryTB` are the already-rounded figures used for the headline.

## Test plan

- **`build-vm-agent-request.test.ts`** — no new cases required (existing direct + copy suites already cover every branch `buildTargetInputs` now routes through); just confirm the full file stays green after the extraction.
- **`storage-tiers.test.ts`** — add `getTargetTierLabels` cases: standalone target, SOBR with Capacity off, SOBR with Capacity on (confirms no `archive` key ever appears).
- **`storage-breakdown.test.tsx`** — add a case asserting a tier row renders `"Performance — Vault Azure"` when `tierLabels` is passed, and plain `"Performance"` when it's omitted (backward-compatible default).
- **`site-sizing-section.test.tsx`** — update for the `badge` → `tierLabels` prop change; add a `data={null}` case asserting it renders the placeholder state without throwing.
- **`projected-sizing-card.test.tsx`** — update title assertions ("Primary Repository" / "Secondary Repository", no geographic wording); update the combined-header subline assertion for the new wording and rounding.
- **`vault-sizer-client.test.ts`**, **`use-calculated-sizing.test.ts`** — new copy-mode tests per D16.
