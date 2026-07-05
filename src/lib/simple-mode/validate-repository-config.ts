import type {
  RepositoryConfigErrors,
  RepositoryConfigValues,
  RetentionOverride,
  RetentionOverrideErrors,
} from "@/types/simple-mode";
import { repoTypeRequiresImmutability } from "@/types/simple-mode";

interface NumberRules {
  integer?: boolean;
  min?: number;
}

function requireNumber(raw: string, rules: NumberRules): string | undefined {
  if (raw.trim() === "") {
    return "Required";
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return "Must be a number";
  }

  if (rules.integer && !Number.isInteger(value)) {
    return "Must be a whole number";
  }

  if (rules.min !== undefined && value < rules.min) {
    return `Must be ${rules.min} or greater`;
  }

  return undefined;
}

function validateRetentionOverride(
  override: RetentionOverride,
): RetentionOverrideErrors | undefined {
  if (!override.customizeRetention) return undefined;

  const errors: RetentionOverrideErrors = {};

  const retentionDaysError = requireNumber(override.retentionDays, {
    integer: true,
    min: 1,
  });
  if (retentionDaysError) errors.retentionDays = retentionDaysError;

  for (const key of ["gfsWeekly", "gfsMonthly", "gfsYearly"] as const) {
    const error = requireNumber(override[key], { integer: true, min: 0 });
    if (error) errors[key] = error;
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}

export function validateRepositoryConfig(
  values: RepositoryConfigValues,
): RepositoryConfigErrors {
  const errors: RepositoryConfigErrors = {};

  if (values.targetRepository !== "sobr") {
    const error = requireNumber(values.targetRepositoryImmutableDays, {
      integer: true,
      min: 1,
    });
    if (error) errors.targetRepositoryImmutableDays = error;
  }

  if (values.backupPath === "copy") {
    const primaryErrors: NonNullable<RepositoryConfigErrors["primary"]> = {};

    if (repoTypeRequiresImmutability(values.primary.repoType)) {
      const error = requireNumber(values.primary.immutableDays, {
        integer: true,
        min: 1,
      });
      if (error) primaryErrors.immutableDays = error;
    }

    const retentionErrors = validateRetentionOverride(values.primary.retention);
    if (retentionErrors) primaryErrors.retention = retentionErrors;

    if (Object.keys(primaryErrors).length > 0) errors.primary = primaryErrors;

    const secondaryRetentionErrors = validateRetentionOverride(
      values.secondaryRetention,
    );
    if (secondaryRetentionErrors) {
      errors.secondaryRetention = secondaryRetentionErrors;
    }
  }

  if (values.targetRepository === "sobr") {
    const sobrErrors: NonNullable<RepositoryConfigErrors["sobr"]> = {};
    const { capacityTier, archiveTier } = values.sobr;

    if (repoTypeRequiresImmutability(values.sobr.performanceType)) {
      const error = requireNumber(values.sobr.performanceImmutableDays, {
        integer: true,
        min: 1,
      });
      if (error) sobrErrors.performanceImmutableDays = error;
    }

    if (capacityTier.enabled) {
      const capacityErrors: { moveDays?: string; immutableDays?: string } = {};

      if (capacityTier.movePolicy) {
        const error = requireNumber(capacityTier.moveDays, {
          integer: true,
          min: 1,
        });
        if (error) capacityErrors.moveDays = error;
      }

      const immutableError = requireNumber(capacityTier.immutableDays, {
        integer: true,
        min: 1,
      });
      if (immutableError) capacityErrors.immutableDays = immutableError;

      if (Object.keys(capacityErrors).length > 0) {
        sobrErrors.capacityTier = capacityErrors;
      }
    }

    if (archiveTier.enabled) {
      const archiveErrors: { moveDays?: string; immutableDays?: string } = {};

      const moveDaysError = requireNumber(archiveTier.moveDays, {
        integer: true,
        min: 1,
      });
      if (moveDaysError) {
        archiveErrors.moveDays = moveDaysError;
      } else if (capacityTier.enabled && capacityTier.movePolicy) {
        const capacityMoveDays = Number(capacityTier.moveDays);
        if (
          Number.isFinite(capacityMoveDays) &&
          Number(archiveTier.moveDays) <= capacityMoveDays
        ) {
          archiveErrors.moveDays = `Must be greater than ${capacityTier.moveDays}`;
        }
      }

      const immutableError = requireNumber(archiveTier.immutableDays, {
        integer: true,
        min: 1,
      });
      if (immutableError) archiveErrors.immutableDays = immutableError;

      if (Object.keys(archiveErrors).length > 0) {
        sobrErrors.archiveTier = archiveErrors;
      }
    }

    if (Object.keys(sobrErrors).length > 0) errors.sobr = sobrErrors;
  }

  return errors;
}
