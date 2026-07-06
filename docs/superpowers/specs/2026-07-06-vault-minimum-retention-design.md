# Vault Minimum Retention Validation Design

Date: 2026-07-06

## Purpose

Veeam Data Cloud Vault enforces a minimum 30-day retention floor. Nothing in Simple Mode today stops an SE from describing a configuration where the numbers imply a Vault-typed location gets emptied out before that floor — e.g. a SOBR whose Capacity Tier is Vault-typed, set to move backups off Performance after 14 days, with a 30-day job retention and no downstream tier: the data would need to be gone from Capacity by day 30, having only lived there since day 14 — 16 days, short of the 30-day floor. This spec adds the missing validation so Simple Mode catches that class of contradiction, continuing the "authoritative validation console" role CLAUDE.md assigns it (the same role that motivated `2026-07-06-sobr-tiering-compatibility-design.md`'s archive-feed check).

## Origin and corrections

This spec went through several rounds of correction against Veeam's own documentation (`veeam-docs-vbr-dump`) and the user's worked examples. Recording them here because each one changed the shape of the final rule, and a future reader re-deriving this logic would hit the same wrong turns:

1. **Naive GFS lifetime (`N × period`) is wrong.** A first pass modeled a weekly GFS point's lifetime as `gfsWeekly × 7` days. Working through a day-by-day spreadsheet showed this misses that a GFS-flagged full can't be purged until _every_ restore point in its dependent incremental chain has also cleared short-term retention — for `gfsWeekly = 4` and 30-day retention, the oldest weekly point actually needs to survive 36 days, not 28, because its chain's last incremental (day 6) still needs a full 30-day retention window on top. The corrected formula is `max(N × P, (P − 1) + retentionDays)`.
2. **Monthly/Yearly don't have their own independent chain cadence.** A second pass assumed Monthly and Yearly GFS points spawn their own ~30-day / ~365-day chains. A further spreadsheet showed this is wrong: Veeam attaches Monthly/Yearly flags to whichever full is already being created on the _actual_ driving cadence (in the example, weekly) — it doesn't create a separate periodic full just to carry a Monthly or Yearly flag. So the `(P − 1)` chain-completion term uses one shared "driving cadence" (the shortest active GFS interval) for every class, not each class's own period. This doesn't flip any realistic pass/fail outcome for Monthly/Yearly (their `N × P` term dominates regardless), but it's the correct statement of the rule.
3. **Immutability auto-extension was a dead end, deliberately abandoned.** Object storage immutability reconciliation (`actual retention = max(job retention, immutability period) + Block Generation`, per `veeam_data_cloud_details.md` / `object_storage_block_generation.md`) was explored as a possible mechanism, since it initially looked like it could explain the 30-day figure. It doesn't apply here: immutability auto-extends deletion dates and never lets data leave early, so it can't produce the early-eviction failure mode the user's examples describe. This validation is a **retention/residency rule**, using a fixed `VAULT_MINIMUM_RETENTION_DAYS = 30` constant, independent of each tier's own configurable `immutableDays` field (a separate, already-validated concern).
4. **Multi-flag fulls don't rescue the check.** A full can carry Weekly, Monthly, and Yearly flags simultaneously (e.g. the very first backup of a job). This doesn't mean every weekly point is protected by a longer-lived flag — only the ones that happen to land on a month/year boundary do. Weekly-only points (the majority) get no such protection, so each class must still be checked using its own worst-case, single-flag lifetime. The per-class-independent model already does this correctly.
5. **Combined Copy+Move behavior, verified against two spreadsheets.** With `copyPolicy` on, data lands on Capacity Tier from day 0 regardless of `movePolicy`; Performance Tier independently loses its own copy once `movePolicy`'s age threshold passes, whether or not Copy already duplicated it. With `copyPolicy` off, data sits on Performance only until the move threshold, then Capacity only, with no overlap. Both match the entry/exit model below exactly, with no correction needed.

**Relationship to ADR-0011**: this is narrower than the Archive Tier minimum-storage-period guardrail ADR-0011 deferred, and doesn't reopen it. That deferral had two reasons: (a) no Archive Tier extent-type picker exists, so there's no field to gate a Glacier/Azure-Archive-specific floor on, and (b) `VmAgentRequest` has no parameter for it, so even Phase 3 sizing couldn't act on it. Reason (a) still blocks the Archive Tier case today and keeps it deferred. Reason (b) was specifically about the _sizing engine_ needing an API parameter to compute cost accounting for the floor — it was never actually a blocker for a pure UI _validation_ guardrail (this spec's kind), since validation never touches `VmAgentRequest` at all. The residency-check machinery this spec introduces (entry/exit day math, per-class lifetime, "does this land before the floor") is generic and reusable — once an Archive Tier extent-type field exists, adding its 180-day floor is one new lookup table and one more call into the same function, not a second system.

## Scope

**In scope:**

- New constant `VAULT_MINIMUM_RETENTION_DAYS = 30` in `types/simple-mode.ts`, applied to any location whose repo type is in the `vault` category (`REPO_TYPE_CATEGORY === "vault"`) — never enumerating `vault-azure`/`vault-aws` by name.
- A new pure module, `src/lib/simple-mode/vault-retention.ts`, computing per-class point lifetimes and tier residency, independently unit-testable.
- Four new relational validation checks, each firing only when that location's repo type is Vault:
  1. Turnkey target (`targetRepository` is `vault-azure`/`vault-aws`, no SOBR).
  2. Primary Repository in Copy mode (`primary.repoType` is Vault).
  3. SOBR Performance Tier.
  4. SOBR Capacity Tier.
- Threading `workloadData: WorkloadDataValues` into `validateRepositoryConfig` as a new required parameter — an explicit, noted reversal of `2026-07-05-simple-mode-backup-repository-design.md`'s "takes no workloadValues parameter" decision, made necessary because Direct mode's governing retention lives only in `workloadData`.
- New error fields and inline messaging, following the existing `archiveFeedUnsupported` precedent (contextual copy naming the tier and a concrete fix).

**Out of scope:**

- The Archive Tier 180-day mandated-minimum-retention guardrail for Glacier/Azure Archive (ADR-0011) — stays deferred; see "Relationship to ADR-0011" above.
- Any change to the `immutableDays` fields or their existing validation.
- Modeling actual calendar dates or configurable backup-job schedules. The "driving cadence" is derived from which GFS counts are non-zero, not a user-configurable schedule field (none exists in this app).
- Chain-aware lifetime for plain daily/short-term points — kept deliberately flat (`lifetime = retentionDays`); see Domain Model below.
- Wiring anything from this check into `VmAgentRequest` — this is UI-only validation (per ADR-0001, sizing itself is Phase 3's concern, and there's no parameter here to send regardless).

## Domain Model

### Driving cadence

The chain-completion term for every active GFS class shares one cadence: the shortest active GFS interval.

```ts
function drivingCadenceDays(retention: EffectiveRetention): number | null {
  if (retention.gfsWeekly > 0) return 7;
  if (retention.gfsMonthly > 0) return 30;
  if (retention.gfsYearly > 0) return 365;
  return null; // no GFS configured at all
}
```

### Point-class lifetimes

For a resolved `EffectiveRetention` (see below):

| Class   | Active when      | Lifetime (days)                                                 |
| ------- | ---------------- | --------------------------------------------------------------- |
| Daily   | always           | `retentionDays` — flat, deliberately not chain-aware (see note) |
| Weekly  | `gfsWeekly > 0`  | `max(gfsWeekly × 7, (drivingCadence − 1) + retentionDays)`      |
| Monthly | `gfsMonthly > 0` | `max(gfsMonthly × 30, (drivingCadence − 1) + retentionDays)`    |
| Yearly  | `gfsYearly > 0`  | `max(gfsYearly × 365, (drivingCadence − 1) + retentionDays)`    |

**Why Daily stays flat**: a plain daily incremental inside a GFS-flagged chain is arguably subject to the same chain-completion logic as its GFS-flagged full. Daily is kept flat anyway, for two reasons: it's what reproduces the user's own worked example (`30 − 14 = 16`, not a chain-aware `36 − 14 = 22`), and it's the shorter, more conservative number — correct for a tool whose job is catching early eviction, not modeling exact file-level chain mechanics.

Monthly/Yearly use round-number periods (30 / 365 days), not calendar-exact month/year math (Veeam's own `N months + 1 day` / `N years + 1 day` flag-removal formulas) — consistent with how the rest of this app already approximates time (`dailyChangeRatePercent`, `yearlyGrowthPercent`), and immaterial here since Monthly/Yearly practically never bind against a 30-day floor under either convention.

### Governing retention resolution

`EffectiveRetention` — the `{ retentionDays, gfsWeekly, gfsMonthly, gfsYearly }` that actually governs a given pipeline — resolves differently per site:

| Pipeline                               | Source                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Direct mode (turnkey or SOBR target)   | `workloadData` directly                                                                               |
| Copy mode, Secondary (turnkey or SOBR) | `secondaryRetention`, effective (its own fields if `customizeRetention`, else mirrors `workloadData`) |
| Copy mode, Primary                     | `primary.retention`, effective, same resolution                                                       |

```ts
export interface EffectiveRetention {
  retentionDays: number;
  gfsWeekly: number;
  gfsMonthly: number;
  gfsYearly: number;
}

export function resolveEffectiveRetention(
  workloadData: WorkloadDataValues,
  override?: RetentionOverride,
): EffectiveRetention {
  const source = override?.customizeRetention ? override : workloadData;
  return {
    retentionDays: Number(
      "retentionDays" in source
        ? source.retentionDays
        : source.shortTermRetentionDays,
    ),
    gfsWeekly: Number(source.gfsWeekly),
    gfsMonthly: Number(source.gfsMonthly),
    gfsYearly: Number(source.gfsYearly),
  };
}
```

### Tier residency: entry flat, exit per-class

**Entry** into a tier is governed only by copy/move policy, never chain-aware:

- SOBR Performance Tier: always `0` (the first landing zone).
- SOBR Capacity Tier: `0` if `copyPolicy`; else `capacityTier.moveDays` if `movePolicy`; else the tier never receives data — skip entirely (matches the existing permissive "inert Capacity Tier" precedent).
- Turnkey target / Primary Repository: always `0` (flat, no tiering).

**Exit** per class depends on what's downstream:

- Turnkey target / Primary: `exit = lifetime` for every class (no tiering).
- Performance Tier:
  - If Capacity Tier is enabled and `movePolicy`: `exit = min(capacityTier.moveDays, lifetime)` for **every** class, including Daily — the operational-restore-window move takes the whole chain, GFS-flagged or not.
  - Else if Capacity Tier is disabled and Archive Tier is enabled: `exit = min(archiveTier.moveDays, lifetime)` for GFS classes only (Archive Tier only ever takes GFS fulls, never plain dailies); Daily's exit stays `lifetime`.
  - Else (Capacity enabled with only `copyPolicy`, or nothing downstream): `exit = lifetime` for every class — nothing removes data from Performance early.
- Capacity Tier:
  - Daily: `exit = lifetime` (never archived; Capacity is terminal for Daily).
  - GFS classes: `archiveTier.enabled ? min(archiveTier.moveDays, lifetime) : lifetime`.

A class only counts toward a tier's check if it actually reaches that tier: `lifetime > entry`. A class that would already be fully deleted before the entry threshold never lands there, and isn't a violation.

**Violation**: `exit − entry < 30` (strict; exactly 30 passes — this is what makes "enable Copy immediately" a real, working fix, since it sets entry to 0).

Each site reports **one message**, naming whichever active, tier-reaching class has the smallest residency (the binding constraint) — not always Daily; a GFS class pulled out early by Archive Tier can bind tighter.

## Verification against worked examples

- **App defaults** (Direct mode, turnkey Vault Azure, `retentionDays=30`, `gfsWeekly=4/monthly=12/yearly=3`): Daily residency `30 − 0 = 30` (passes, not `< 30`). Weekly lifetime `max(28, 6+30=36) = 36`, residency `36`(passes). No violation — confirms the corrected formula doesn't flag the app's own bundled defaults.
- **User's example 1** (SOBR: Performance = ReFS/XFS, Capacity = Vault Azure, `movePolicy` only, `moveDays=14`, no Archive, `retentionDays=30`, `gfsWeekly=4`): Capacity entry `= 14`. Daily: lifetime `30`, exit `30` (terminal), residency `16` → **violates**, binding class. Weekly: lifetime `36`, residency `22` → also violates, but less severe. Reported message binds on Daily, "16 days" — matches the user's own arithmetic exactly.
- **Copy-immediate fix** (same as above, `copyPolicy=true`): Capacity entry `= 0`. Daily residency `30 − 0 = 30` → passes. Confirms "enable Copy immediately" is a real fix, not just intuition.
- **User's example 2 shape** (SOBR: Capacity = Vault, `moveDays=5`, `retentionDays=40`, `gfsWeekly=4`, Archive enabled with `moveDays=20`): Capacity entry `= 5`. Daily: exit `= 40` (terminal, Archive doesn't take Daily), residency `35` → passes. Weekly: lifetime `max(28, 6+40=46) = 46`, exit `min(20, 46) = 20`, residency `20 − 5 = 15` → **violates**. Isolates the case where Archive Tier's early move-out is specifically what causes the violation, independent of Daily.

## Data Model

New additions to `types/simple-mode.ts`:

```ts
export const VAULT_MINIMUM_RETENTION_DAYS = 30;
```

New module `src/lib/simple-mode/vault-retention.ts`:

```ts
export interface EffectiveRetention {
  retentionDays: number;
  gfsWeekly: number;
  gfsMonthly: number;
  gfsYearly: number;
}

export type PointClass = "daily" | "weekly" | "monthly" | "yearly";

export interface ClassLifetime {
  class: PointClass;
  lifetimeDays: number;
}

export function resolveEffectiveRetention(
  workloadData: WorkloadDataValues,
  override?: RetentionOverride,
): EffectiveRetention;

export function computeClassLifetimes(
  retention: EffectiveRetention,
): ClassLifetime[]; // always includes "daily"; GFS classes included only if their count > 0

export interface VaultResidencyViolation {
  class: PointClass;
  residencyDays: number;
}

// entryDays: fixed per tier. exitFor: per-class exit day, computed by the caller
// per the rules above (differs between Performance and Capacity Tier call sites).
export function findVaultResidencyViolation(
  lifetimes: ClassLifetime[],
  entryDays: number,
  exitFor: (lifetime: ClassLifetime) => number,
): VaultResidencyViolation | undefined;
```

`findVaultResidencyViolation` skips any class where `lifetimeDays <= entryDays` (never reaches the tier), computes `residencyDays = exitFor(class) - entryDays` for the rest, and returns whichever violating class has the smallest `residencyDays` — or `undefined` if none violate. Callers (Performance Tier, Capacity Tier, and the two flat sites) each supply their own `entryDays` and `exitFor` per the rules above; the function itself has no knowledge of tier position, copy/move policy, or Archive Tier — that logic stays in `validate-repository-config.ts`, keeping this module a pure, generic residency calculator.

New error fields on `RepositoryConfigErrors` (`types/simple-mode.ts`):

```ts
export interface RepositoryConfigErrors {
  targetRepositoryImmutableDays?: string;
  targetRepositoryVaultRetention?: string; // new
  primary?: {
    immutableDays?: string;
    retention?: RetentionOverrideErrors;
    vaultRetention?: string; // new
  };
  sobr?: {
    performanceImmutableDays?: string;
    performanceVaultRetention?: string; // new
    capacityTier?: {
      moveDays?: string;
      immutableDays?: string;
      vaultRetention?: string; // new
    };
    archiveTier?: {
      moveDays?: string;
      immutableDays?: string;
      archiveFeedUnsupported?: string;
    };
  };
  secondaryRetention?: RetentionOverrideErrors;
}
```

## Validation Logic

In `validate-repository-config.ts`, `validateRepositoryConfig` gains a required second parameter: `validateRepositoryConfig(values: RepositoryConfigValues, workloadData: WorkloadDataValues): RepositoryConfigErrors`.

Each of the four checks:

1. Resolves the site's `EffectiveRetention` (per the governing-retention table).
2. Guards on the site's repo type being Vault (`REPO_TYPE_CATEGORY[type] === "vault"`).
3. Guards on the inputs it depends on already passing their own numeric validation (`retentionDays`, `gfsWeekly/Monthly/Yearly`, `moveDays`, as applicable) — if any are invalid/non-numeric, skip the vault-retention check for that site rather than compute against `NaN`.
4. Calls `computeClassLifetimes`, then `findVaultResidencyViolation` with the site's `entryDays`/`exitFor`.
5. On a violation, sets the corresponding new error field to a composed message naming the binding class, its residency, and a site-specific fix, e.g.:

> "Daily backups would only remain on this Vault Capacity Tier for 16 days before being removed — Veeam Data Cloud Vault requires backups to remain for at least 30 days. Increase the move threshold, increase retention, enable 'Copy backups as soon as they are created,' or choose a non-Vault Capacity Tier type."

Fix suggestions branch per site (flat target/Primary: adjust retention/GFS or repo type; Performance: adjust the move threshold, enable Capacity Copy, or repo type; Capacity: adjust the Archive move threshold, enable Copy, or repo type) — mirroring how `archiveFeedUnsupported`'s message already branches on which tier is at fault.

This is independent of, and can coexist with, the existing `moveDays`/`immutableDays`/`archiveFeedUnsupported` checks in the same blocks.

## UI Placement

- `targetRepositoryVaultRetention`: rendered in `backup-repository-card.tsx`, beneath the turnkey target's `targetRepositoryImmutableDays` field.
- `primary.vaultRetention`: rendered in `backup-repository-card.tsx`, in the Primary Repository block, beneath `primary.immutableDays`/retention fields.
- `sobr.performanceVaultRetention`: rendered in `sobr-builder.tsx`, in the Performance Tier row.
- `sobr.capacityTier.vaultRetention`: rendered in `sobr-builder.tsx`, in the Capacity Tier row.

All use the existing `text-destructive text-xs` inline pattern — no new banner component, matching the precedent set by `archiveFeedUnsupported`.

## Testing

- `vault-retention.test.ts` (new) — pure unit tests for `resolveEffectiveRetention`, `computeClassLifetimes` (including the app-defaults case, the `gfsWeekly=4`/`retentionDays=30` → `36` case, and a class being omitted when its count is 0), and `findVaultResidencyViolation` (binding-class selection, classes that never reach the tier being skipped, exact-30 passing).
- `validate-repository-config.test.ts` — new cases per the four sites, reproducing each "Verification against worked examples" scenario above by name, plus: disabling a tier clears its Vault-retention error; a non-Vault type at any of the four sites never triggers this check regardless of the numbers; an inert Capacity Tier (`copyPolicy=false`, `movePolicy=false`) with a Vault type produces no violation.
- `sobr-builder.test.tsx` / `backup-repository-card.test.tsx` — one rendering test each confirming the new message renders when present, matching the existing `archiveFeedUnsupported` rendering-test pattern.

## Documentation

Following the precedent set by the Archive-Feed Source / Block Generation work (`CONTEXT.md`, ADR-0012): implementation should add `CONTEXT.md` entries for **Driving Cadence** and **Vault Minimum Retention**, and a new ADR (`0013-...`) recording the immutability-was-a-dead-end correction (point 3 under "Origin and corrections") — a future contributor tempted to reconnect this check to `immutableDays` should find that reasoning already written down.

## Explicitly deferred

- Archive Tier's own 180-day mandated-minimum-retention floor (ADR-0011) — see "Relationship to ADR-0011" above.
- Calendar-exact Monthly/Yearly cadence math.
- Chain-aware lifetime for plain Daily/short-term points.
- Any wiring into `VmAgentRequest` (Phase 3, per ADR-0001) — moot here regardless, since this is validation-only.
