import {
  GFS_PERIOD_DAYS,
  VAULT_MINIMUM_RETENTION_DAYS,
  type RetentionOverride,
  type WorkloadDataValues,
} from "@/types/simple-mode";

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

export interface VaultResidencyViolation {
  class: PointClass;
  residencyDays: number;
}

/**
 * Resolves which retention/GFS values actually govern a pipeline: the
 * override's own fields when it's customized, otherwise workloadData
 * directly.
 */
export function resolveEffectiveRetention(
  workloadData: WorkloadDataValues,
  override?: RetentionOverride,
): EffectiveRetention {
  if (override?.customizeRetention) {
    return {
      retentionDays: Number(override.retentionDays),
      gfsWeekly: Number(override.gfsWeekly),
      gfsMonthly: Number(override.gfsMonthly),
      gfsYearly: Number(override.gfsYearly),
    };
  }
  return {
    retentionDays: Number(workloadData.shortTermRetentionDays),
    gfsWeekly: Number(workloadData.gfsWeekly),
    gfsMonthly: Number(workloadData.gfsMonthly),
    gfsYearly: Number(workloadData.gfsYearly),
  };
}

// The shortest active GFS interval — shared across every class as the
// chain-completion reference (ADR-0014). Veeam attaches Monthly/Yearly
// flags to whichever full is already being created on this cadence, rather
// than spawning an independently-paced chain per class.
function drivingCadenceDays(retention: EffectiveRetention): number | undefined {
  if (retention.gfsWeekly > 0) return GFS_PERIOD_DAYS.weekly;
  if (retention.gfsMonthly > 0) return GFS_PERIOD_DAYS.monthly;
  if (retention.gfsYearly > 0) return GFS_PERIOD_DAYS.yearly;
  return undefined;
}

export function computeClassLifetimes(
  retention: EffectiveRetention,
): ClassLifetime[] {
  const lifetimes: ClassLifetime[] = [
    { class: "daily", lifetimeDays: retention.retentionDays },
  ];

  const cadence = drivingCadenceDays(retention);
  if (cadence === undefined) return lifetimes;

  const chainFloor = cadence - 1 + retention.retentionDays;

  if (retention.gfsWeekly > 0) {
    lifetimes.push({
      class: "weekly",
      lifetimeDays: Math.max(
        retention.gfsWeekly * GFS_PERIOD_DAYS.weekly,
        chainFloor,
      ),
    });
  }
  if (retention.gfsMonthly > 0) {
    lifetimes.push({
      class: "monthly",
      lifetimeDays: Math.max(
        retention.gfsMonthly * GFS_PERIOD_DAYS.monthly,
        chainFloor,
      ),
    });
  }
  if (retention.gfsYearly > 0) {
    lifetimes.push({
      class: "yearly",
      lifetimeDays: Math.max(
        retention.gfsYearly * GFS_PERIOD_DAYS.yearly,
        chainFloor,
      ),
    });
  }

  return lifetimes;
}

/**
 * Finds the most severe Vault minimum-retention violation among a tier's
 * reachable classes. `entryDays` is when data arrives at the tier;
 * `exitFor` computes when a given class leaves it (the caller supplies
 * this — it differs by tier position and Archive Tier/Capacity Tier
 * policy, none of which this function knows about).
 */
export function findVaultResidencyViolation(
  lifetimes: ClassLifetime[],
  entryDays: number,
  exitFor: (lifetime: ClassLifetime) => number,
): VaultResidencyViolation | undefined {
  let binding: VaultResidencyViolation | undefined;

  for (const lifetime of lifetimes) {
    if (lifetime.lifetimeDays <= entryDays) continue;

    const exitDays = exitFor(lifetime);
    if (exitDays <= entryDays) continue;

    const residencyDays = exitDays - entryDays;
    if (residencyDays >= VAULT_MINIMUM_RETENTION_DAYS) continue;

    if (!binding || residencyDays < binding.residencyDays) {
      binding = { class: lifetime.class, residencyDays };
    }
  }

  return binding;
}
