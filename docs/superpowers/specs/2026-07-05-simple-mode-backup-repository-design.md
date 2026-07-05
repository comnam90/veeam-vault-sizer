# Simple Mode: Backup Repository Configuration Card Design

Date: 2026-07-05

## Purpose

Build the second core slice of the Simple Mode calculator: the **Backup Repository Configuration** card. This completes Simple Mode's input footprint (Workload Data + Backup Repository Configuration), positioning the app for the sizing API integration in Phase 3.

This phase captures Veeam's real storage mechanics: independent per-tier immutability, multi-policy capacity-tier offloads (Copy and Move, independently toggleable), an archive tier that doesn't require a capacity tier, and — for Backup Copy jobs — two independent repositories that each need full sizing-relevant configuration, not just one primary pipeline with a presentational secondary.

## Origin and corrections

A UX collaborator drafted an initial version of this card (referenced in the brainstorming transcript). Two things surfaced during review that changed its shape:

1. **ADR-0001** commits this project to calling Veeam's real sizing API (`VmAgentRequest`) rather than computing sizing locally. That request is a single pipeline with one retention block and no primary/secondary distinction — which raised a real question: does Backup Copy mode need its own independent config, or is the primary side just presentational?
2. The sibling project `vdc-vault-readiness` (which already integrates the same API) confirmed the single-pipeline request shape, but doesn't have a manual repository builder to compare against.

The user resolved this directly: **Backup Copy mode has two independent sizing pipelines.** Primary On-Prem and Secondary Vault each need full configuration, because Phase 3 will size each one separately — either two frontend API calls, or a backend function that fans one request out into two upstream calls and combines the results. That single decision reshaped the data model, several UI details, and the validation matrix below. Everywhere this spec differs from the original draft, it's because of that correction or one of the smaller ones the user made alongside it (documented inline).

## Scope

**In scope:**

- The Backup Repository Configuration card, placed beneath the Workload Data card in the left column (`lg:col-span-8`).
- Backup Path toggle: Direct to Vault vs. Backup Copy to Vault.
- Turnkey target cards: Vault Azure, Vault AWS, SOBR Builder.
- Sequential track stacking: Primary On-Prem Repository above Secondary Vault/Cloud Repository, shown only in Backup Copy mode.
- The three-tier SOBR Builder (Performance, Capacity, Archive), each tier using a grouped repo-type picker.
- Independent Capacity Tier policies (Copy, Move) and an Archive Tier that doesn't depend on Capacity Tier being enabled.
- Per-repo-type immutability inputs, applied consistently across Primary, Performance Tier, and Capacity Tier.
- Symmetric retention inheritance: Primary and Secondary both default from Workload Data's existing retention/GFS fields, each independently overridable.
- Relational validation as a pure, independently testable function.

**Out of scope (deferred to Phase 3, per ADR-0001):**

- Mapping any of this card's values to `VmAgentRequest`, calling the sizing API, or rendering results in the Projected Sizing sidebar.
- Resolving _how_ Backup Copy's two pipelines become two API calls (two frontend calls vs. a backend fan-out) — this spec only guarantees the data model can support either approach later.
- Advanced Mode.
- Additional object-storage brand names beyond the project brief's list (e.g. Wasabi, MinIO) — deferred to a later polish pass.
- Vault edition distinctions (Advanced vs. Foundation) — real in the underlying product, not exposed in Simple Mode.

## Data Model

A single canonical repo-type enum, with per-context allowed subsets, replaces three separate ad hoc type unions. Vault, on-prem, and cloud-object types recur across Primary, Performance Tier, and Capacity Tier with the same category and immutability rules, so one type and two lookup tables cover all three:

```ts
type RepoType =
  | "vault-azure"
  | "vault-aws"
  | "refs-xfs"
  | "linux-hardened"
  | "nas"
  | "s3-compatible"
  | "aws-s3"
  | "azure-blob";

type RepoCategory = "vault" | "on-prem" | "cloud-object";

const REPO_TYPE_CATEGORY: Record<RepoType, RepoCategory> = {
  "vault-azure": "vault",
  "vault-aws": "vault",
  "refs-xfs": "on-prem",
  "linux-hardened": "on-prem",
  nas: "on-prem",
  "s3-compatible": "cloud-object",
  "aws-s3": "cloud-object",
  "azure-blob": "cloud-object",
};

// Vault types, Linux Hardened, and every cloud-object type support immutability.
// Plain ReFS/XFS and NAS don't.
const REPO_TYPES_REQUIRING_IMMUTABILITY = new Set<RepoType>([
  "vault-azure",
  "vault-aws",
  "linux-hardened",
  "s3-compatible",
  "aws-s3",
  "azure-blob",
]);

// Each context restricts the picker to a fixed subset of RepoType.
const PRIMARY_REPO_TYPES: RepoType[] = [
  "vault-azure",
  "vault-aws",
  "refs-xfs",
  "linux-hardened",
  "nas",
]; // no cloud-object — a Backup Copy source repo is never object storage in this model
const PERFORMANCE_TIER_TYPES: RepoType[] = [
  "vault-azure",
  "vault-aws",
  "refs-xfs",
  "linux-hardened",
  "nas",
  "s3-compatible",
  "aws-s3",
  "azure-blob",
]; // all 8
const CAPACITY_TIER_TYPES: RepoType[] = [
  "vault-azure",
  "vault-aws",
  "s3-compatible",
  "aws-s3",
  "azure-blob",
]; // no on-prem, no NAS — the brief never lists NAS as a valid Capacity Tier target
```

`PRIMARY_REPO_TYPES` includes Vault Azure/Vault AWS because Backup Copy jobs commonly copy Vault-to-Vault across regions, or from Vault Advanced (unlimited restores) to Vault Foundation (a 20%-restore-limit tier) for cost reasons — real scenarios the user described. Simple Mode doesn't expose the Advanced/Foundation distinction itself; it only needs Primary's repo type to include Vault as an option.

```ts
// Reused identically for Primary and Secondary.
interface RetentionOverride {
  customizeRetention: boolean;
  retentionDays: string;
  gfsWeekly: string;
  gfsMonthly: string;
  gfsYearly: string;
}

interface PrimaryRepositoryConfig {
  repoType: RepoType; // restricted to PRIMARY_REPO_TYPES in the UI
  immutableDays: string; // active iff REPO_TYPES_REQUIRING_IMMUTABILITY.has(repoType)
  retention: RetentionOverride;
}

interface CapacityTierConfig {
  enabled: boolean;
  type: RepoType; // restricted to CAPACITY_TIER_TYPES in the UI
  copyPolicy: boolean;
  movePolicy: boolean;
  moveDays: string; // active iff movePolicy
  immutableDays: string; // active whenever enabled — every Capacity Tier type requires immutability
}

interface ArchiveTierConfig {
  enabled: boolean; // independent of capacityTier.enabled
  moveDays: string;
  immutableDays: string;
  standaloneFullBackups: boolean; // VBR's "independent fulls, no shared blocks" setting
}

interface SobrConfig {
  performanceType: RepoType; // restricted to PERFORMANCE_TIER_TYPES in the UI
  performanceImmutableDays: string; // active iff REPO_TYPES_REQUIRING_IMMUTABILITY.has(performanceType)
  capacityTier: CapacityTierConfig;
  archiveTier: ArchiveTierConfig;
}

interface RepositoryConfigValues {
  backupPath: "direct" | "copy";
  targetRepository: "vault-azure" | "vault-aws" | "sobr";
  sobr: SobrConfig; // present always; only validated when targetRepository === 'sobr'
  primary: PrimaryRepositoryConfig; // present always; only validated when backupPath === 'copy'
  secondaryRetention: RetentionOverride; // present always; only validated when backupPath === 'copy'
}

type RepositoryConfigErrors = {
  primary?: {
    immutableDays?: string;
    retention?: Partial<Record<keyof RetentionOverride, string>>;
  };
  sobr?: {
    performanceImmutableDays?: string;
    capacityTier?: { moveDays?: string; immutableDays?: string };
    archiveTier?: { moveDays?: string; immutableDays?: string };
  };
  secondaryRetention?: Partial<Record<keyof RetentionOverride, string>>;
};
```

Fields stay present regardless of which mode is active — the same string-values-always-present precedent Workload Data set (ADR-0004) — so toggling `backupPath` or `targetRepository` back and forth never discards a track's entered values. Only validation is conditional.

### Why `RetentionOverride` is symmetric

Workload Data already owns "Short-term Retention (Days)" and "GFS Points (W/M/Y)" as top-level fields. In Backup Copy mode, both Primary and Secondary default from those values, and each can independently override them — not just Secondary, as first drafted. Both tracks render the same UI: an unchecked "Customize retention (currently mirroring Workload Data)" line with an inherited-values summary, or, when checked, the full retention-days-plus-GFS grid. One `RetentionOverride` shape, reused twice, is what makes that symmetry hold in the data as well as the UI.

### Why Capacity Tier's immutability field has no per-type condition

Every type in `CAPACITY_TIER_TYPES` is in `REPO_TYPES_REQUIRING_IMMUTABILITY`. So `capacityTier.immutableDays` is simply active whenever the tier is enabled — no type check needed. Performance Tier and Primary still need the type check, because their allowed sets mix immutable and non-immutable types (`refs-xfs` and `nas` don't require it).

## Component Structure

```
src/components/simple-mode/
├── simple-mode-page.tsx          # updated — adds RepositoryConfigValues state
├── backup-repository-card.tsx    # new — Backup Path toggle, turnkey/SOBR target cards, orchestrates Primary + Secondary
├── repo-type-picker.tsx          # new — shared grouped-toggle picker (category row -> type row)
├── retention-override-block.tsx  # new — shared "Customize retention" hatch + inherited display + GFS grid
└── sobr-builder.tsx              # new — Performance/Capacity/Archive tier rows, shown when targetRepository === 'sobr'
```

- **`simple-mode-page.tsx`**: adds `RepositoryConfigValues` state (`useState`, defaults below) alongside the existing `WorkloadDataValues` state. Renders `<BackupRepositoryCard>` beneath `WorkloadDataCard` in the same `lg:col-span-8` region, passing `workloadData` down read-only so retention blocks can render the inherited-values summary.
- **`backup-repository-card.tsx`**: controlled `{ value: RepositoryConfigValues; workloadData: WorkloadDataValues; onChange }`. Renders the Backup Path toggle and the three target cards. Stacks the Primary track above the Secondary block only when `backupPath === 'copy'`. Delegates repo-type selection to `repo-type-picker.tsx`, retention hatches to `retention-override-block.tsx`, and the tier pipeline to `sobr-builder.tsx` when `targetRepository === 'sobr'`.
- **`repo-type-picker.tsx`**: controlled `{ value: RepoType; allowedTypes: RepoType[]; onChange }`. Renders a category row derived from `REPO_TYPE_CATEGORY`, filtered to whatever categories `allowedTypes` touches, then a row of that category's specific type buttons. The active category is local UI state — it defaults to the category containing `value` and changes only how the picker displays; only the chosen `RepoType` is ever lifted through `onChange`. Used for Primary, Performance Tier, and Capacity Tier, each passing a different `allowedTypes` array.
- **`retention-override-block.tsx`**: controlled `{ value: RetentionOverride; workloadData: WorkloadDataValues; label: string; onChange }`. `label` distinguishes "Customize retention" (Primary) from "Customize copy retention" (Secondary); both otherwise render identically.
- **`sobr-builder.tsx`**: controlled `{ value: SobrConfig; onChange }`. Performance Tier row: `repo-type-picker` plus a conditional immutability field. Capacity Tier row: enable toggle, `repo-type-picker`, independent Copy/Move checkboxes, conditional move-days field, always-on immutability field. Archive Tier row: a dashed empty state ("+ Add Archive Tier") that expands, on click, to move-days, immutability, and the new standalone-full-backups checkbox — its expand affordance is enabled regardless of Capacity Tier's state.

Validation is a pure function, independently unit-testable, matching the Workload Data precedent:

```
src/lib/simple-mode/validate-repository-config.ts
  validateRepositoryConfig(values: RepositoryConfigValues): RepositoryConfigErrors
```

Unlike the original draft, this takes no `workloadValues` parameter. Inherited-value _display_ ("currently mirroring Workload Data: 30 Dailies + 4W/12M/3Y") is the component's job; validation only ever inspects a `RetentionOverride`'s own fields, and only when its `customizeRetention` flag is on.

## Visual & Interaction Design

Persistent Inline, as originally proposed: every option stays visible and reachable without modals or pagination, so an SE never loses their place mid-demo.

- **Backup Path toggle** and the three target cards (Vault Azure, Vault AWS, SOBR Builder) render as in the reference mockup — a segmented toggle and emerald-bordered selectable cards with a check indicator.
- **Sequential track stacking**: switching to Copy mode stacks Primary On-Prem above Secondary Vault/Cloud inside the card. Each track is self-contained: its own repo-type picker and its own retention block.
- **SOBR Design Block**: Performance Tier's picker shows all three categories (Vault, On-Prem, Cloud Object Storage — 8 types total). Capacity Tier's picker shows two categories (Vault, Cloud Object Storage — 5 types, no NAS). Archive Tier's `+ Add` affordance is always clickable, independent of Capacity Tier's enabled state.
- **Grouped repo-type picker**: a category row, then a row of that category's specific types — chosen over a flat button row (too wide at 8 options) or a plain dropdown (hides the option set at rest, undermining the "no black box" goal). Individual type names (Vault Azure, Vault AWS, S3 Compatible, AWS S3, Azure Blob, etc.) are never collapsed into a generic label — SEs need to see the exact type they expect, even though only three categories affect the underlying calculation.
- **Retention inheritance**: both Primary and Secondary default to an unchecked "Customize retention (currently mirroring Workload Data)" line with an inherited summary (e.g. "↳ Retaining 30 Dailies + 4W/12M/3Y"). Checking it reveals the full retention-days-plus-GFS grid, pre-seeded with Workload Data's current values so toggling the checkbox off and back on doesn't lose a sane starting point.

## Defaults

Matching `screen.png` wherever it shows a value:

| Field                                   | Default                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `backupPath`                            | `'direct'`                                                               |
| `targetRepository`                      | `'sobr'`                                                                 |
| `sobr.performanceType`                  | `'refs-xfs'` (no immutability field shown — ReFS/XFS doesn't require it) |
| `sobr.capacityTier.enabled`             | `true`                                                                   |
| `sobr.capacityTier.type`                | `'s3-compatible'`                                                        |
| `sobr.capacityTier.copyPolicy`          | `false`                                                                  |
| `sobr.capacityTier.movePolicy`          | `true`                                                                   |
| `sobr.capacityTier.moveDays`            | `'14'`                                                                   |
| `sobr.capacityTier.immutableDays`       | `'30'` (not shown in the mockup; a reasonable starting value)            |
| `sobr.archiveTier.enabled`              | `false`                                                                  |
| `primary.repoType`                      | `'refs-xfs'`                                                             |
| `primary.retention.customizeRetention`  | `false`                                                                  |
| `secondaryRetention.customizeRetention` | `false`                                                                  |

## Validation Matrix

Hidden fields bypass validation entirely — disabling a tier clears its errors along with its visibility.

| Field                                                       | Trigger                                                                                | Rule                                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `primary.retention.retentionDays`                           | `backupPath === 'copy'` AND `primary.retention.customizeRetention`                     | integer ≥ 1                                                                                                                                                                                                                                |
| `primary.retention.gfsWeekly` / `gfsMonthly` / `gfsYearly`  | same                                                                                   | integer ≥ 0                                                                                                                                                                                                                                |
| `primary.immutableDays`                                     | `backupPath === 'copy'` AND `primary.repoType` requires immutability                   | integer ≥ 1                                                                                                                                                                                                                                |
| `sobr.performanceImmutableDays`                             | `targetRepository === 'sobr'` AND `sobr.performanceType` requires immutability         | integer ≥ 1                                                                                                                                                                                                                                |
| `sobr.capacityTier.moveDays`                                | `targetRepository === 'sobr'` AND `capacityTier.enabled` AND `capacityTier.movePolicy` | integer ≥ 0                                                                                                                                                                                                                                |
| `sobr.capacityTier.immutableDays`                           | `targetRepository === 'sobr'` AND `capacityTier.enabled`                               | integer ≥ 1 (unconditional on type — every Capacity Tier type requires it)                                                                                                                                                                 |
| `sobr.archiveTier.moveDays`                                 | `targetRepository === 'sobr'` AND `archiveTier.enabled`                                | integer ≥ 1; additionally, must be greater than `capacityTier.moveDays` **only if** `capacityTier.enabled` AND `capacityTier.movePolicy` are both true — an archive-only or archive-with-copy-only pipeline has nothing to compare against |
| `sobr.archiveTier.immutableDays`                            | `targetRepository === 'sobr'` AND `archiveTier.enabled`                                | integer ≥ 1                                                                                                                                                                                                                                |
| `secondaryRetention.retentionDays`                          | `backupPath === 'copy'` AND `secondaryRetention.customizeRetention`                    | integer ≥ 1                                                                                                                                                                                                                                |
| `secondaryRetention.gfsWeekly` / `gfsMonthly` / `gfsYearly` | same                                                                                   | integer ≥ 0                                                                                                                                                                                                                                |

**Explicitly permissive, by decision**: enabling Capacity Tier with both `copyPolicy` and `movePolicy` unchecked is a valid (if inert) state — no rule forces at least one policy on. This matches the Phase 1 precedent (ADR-0004's reasoning: a rule that rejects a legitimate-if-unusual value mid-demo costs more than a rule that's slightly loose).

## Testing

- `validate-repository-config.test.ts` — one test per validation-matrix row above, plus: disabling a tier clears its errors; the archive-move-vs-capacity-move guard fires only when capacity-move is actually active, not for archive-only or archive-with-copy-only configurations.
- `repo-type-picker.test.tsx` — renders only the categories and types present in `allowedTypes`; clicking a category switches the visible type row; selecting a type calls `onChange` with that type.
- `retention-override-block.test.tsx` — unchecked state shows the inherited display computed from `workloadData`; checking the box reveals the grid pre-seeded with `workloadData`'s current values.
- `sobr-builder.test.tsx` — Archive Tier's expand affordance works independent of Capacity Tier's enabled state; Capacity Tier's Copy and Move checkboxes toggle independently of each other.
- `backup-repository-card.test.tsx` — switching `backupPath` from `direct` to `copy` stacks the Primary track above the Secondary block; switching `targetRepository` to `sobr` reveals the SOBR Design Block.
- `simple-mode-page.test.tsx` — composition test: `BackupRepositoryCard` renders beneath `WorkloadDataCard`, receives `workloadData`, and updates page-level state on change.

All controlled-component interaction tests use the stateful-harness pattern from ADR-0005, not a bare `vi.fn()` mock, for any test driving multi-character `user.type()` input.

## Explicitly deferred to the implementation plan

- **Flagged inference, not confirmed**: `PRIMARY_REPO_TYPES` excludes the three cloud-object types (S3 Compatible, AWS S3, Azure Blob) on the reasoning that a Backup Copy source repository is conventionally fast/local storage, not generic object storage. This wasn't asked directly — only Vault Azure/Vault AWS were explicitly confirmed as additions to Primary's original three on-prem options. Worth a direct check during spec review, since the same kind of inference (Primary being on-prem-only) was wrong once already in this design's history.
- Exact display copy for Primary's on-prem-style repo type labels (e.g. whether the third `nas` option reads "NAS" or "Windows/NAS" in Primary's context vs. Performance Tier's) — a presentation detail, not a data-model one.
- Whether `repo-type-picker.tsx`'s category row hides itself entirely when `allowedTypes` spans only one category (not applicable to any current context, but worth deciding once implemented).
- Exact spacing/animation treatment for the stacking transition between Direct and Copy modes.
