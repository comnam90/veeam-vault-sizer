import type {
  RepositoryConfigErrors,
  RepositoryConfigValues,
  RetentionOverride,
  RetentionOverrideErrors,
  WorkloadDataValues,
} from "@/types/simple-mode";
import {
  REPO_TYPE_CATEGORY,
  REPO_TYPE_LABEL,
  repoTypeCanFeedArchiveTier,
  repoTypeRequiresImmutability,
  VAULT_MINIMUM_RETENTION_DAYS,
} from "@/types/simple-mode";
import {
  computeClassLifetimes,
  findVaultResidencyViolation,
  resolveEffectiveRetention,
  type ClassLifetime,
  type EffectiveRetention,
  type PointClass,
  type VaultResidencyViolation,
} from "./vault-retention";
import { validateWorkloadData } from "./validate-workload-data";

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

const POINT_CLASS_LABEL: Record<PointClass, string> = {
  daily: "Daily backups",
  weekly: "Weekly GFS points",
  monthly: "Monthly GFS points",
  yearly: "Yearly GFS points",
};

function formatVaultRetentionMessage(
  violation: VaultResidencyViolation,
  locationLabel: string,
  suggestion: string,
): string {
  return (
    `${POINT_CLASS_LABEL[violation.class]} would only remain on this ${locationLabel} ` +
    `for ${violation.residencyDays} days before being removed — Veeam Data Cloud Vault ` +
    `requires backups to remain for at least ${VAULT_MINIMUM_RETENTION_DAYS} days. ${suggestion}`
  );
}

// Resolves the retention that governs a pipeline, or undefined if the
// inputs it would depend on already have a validation error of their own
// (an empty/invalid field parses to a misleading number rather than NaN,
// e.g. Number("") === 0 — so this is an explicit skip, not a NaN check).
function effectiveRetentionOrSkip(
  workloadData: WorkloadDataValues,
  workloadRetentionValid: boolean,
  override: RetentionOverride | undefined,
): EffectiveRetention | undefined {
  if (override?.customizeRetention) {
    if (validateRetentionOverride(override)) return undefined;
    return resolveEffectiveRetention(workloadData, override);
  }
  return workloadRetentionValid
    ? resolveEffectiveRetention(workloadData, override)
    : undefined;
}

const FLAT_EXIT = (lifetime: ClassLifetime) => lifetime.lifetimeDays;

export function validateRepositoryConfig(
  values: RepositoryConfigValues,
  workloadData: WorkloadDataValues,
): RepositoryConfigErrors {
  const errors: RepositoryConfigErrors = {};

  const workloadDataErrors = validateWorkloadData(workloadData);
  const workloadRetentionValid =
    !workloadDataErrors.shortTermRetentionDays &&
    !workloadDataErrors.gfsWeekly &&
    !workloadDataErrors.gfsMonthly &&
    !workloadDataErrors.gfsYearly;

  // The retention governing the SOBR/turnkey target: secondaryRetention in
  // Backup Copy mode, workloadData directly in Direct mode. Shared by the
  // turnkey, Performance Tier, and Capacity Tier checks below.
  const targetRetention = effectiveRetentionOrSkip(
    workloadData,
    workloadRetentionValid,
    values.backupPath === "copy" ? values.secondaryRetention : undefined,
  );

  if (values.targetRepository !== "sobr") {
    const error = requireNumber(values.targetRepositoryImmutableDays, {
      integer: true,
      min: 1,
    });
    if (error) errors.targetRepositoryImmutableDays = error;

    if (targetRetention) {
      const violation = findVaultResidencyViolation(
        computeClassLifetimes(targetRetention),
        0,
        FLAT_EXIT,
      );
      if (violation) {
        errors.targetRepositoryVaultRetention = formatVaultRetentionMessage(
          violation,
          `${REPO_TYPE_LABEL[values.targetRepository]} repository`,
          `Increase retention (or the relevant GFS count) to at least ${VAULT_MINIMUM_RETENTION_DAYS} days, or choose a non-Vault repository type.`,
        );
      }
    }
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

    if (REPO_TYPE_CATEGORY[values.primary.repoType] === "vault") {
      const primaryRetention = effectiveRetentionOrSkip(
        workloadData,
        workloadRetentionValid,
        values.primary.retention,
      );
      if (primaryRetention) {
        const violation = findVaultResidencyViolation(
          computeClassLifetimes(primaryRetention),
          0,
          FLAT_EXIT,
        );
        if (violation) {
          primaryErrors.vaultRetention = formatVaultRetentionMessage(
            violation,
            "Vault Primary Repository",
            `Increase retention (or the relevant GFS count) to at least ${VAULT_MINIMUM_RETENTION_DAYS} days, or choose a non-Vault repository type.`,
          );
        }
      }
    }

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

    if (
      REPO_TYPE_CATEGORY[values.sobr.performanceType] === "vault" &&
      targetRetention
    ) {
      const performanceUsesCapacityExit =
        capacityTier.enabled && capacityTier.movePolicy;
      const performanceUsesArchiveExit =
        !capacityTier.enabled && archiveTier.enabled;

      const capacityMoveDaysValid =
        !performanceUsesCapacityExit ||
        requireNumber(capacityTier.moveDays, { integer: true, min: 1 }) ===
          undefined;
      const archiveMoveDaysValid =
        !performanceUsesArchiveExit ||
        requireNumber(archiveTier.moveDays, { integer: true, min: 1 }) ===
          undefined;

      if (capacityMoveDaysValid && archiveMoveDaysValid) {
        const performanceExit = (lifetime: ClassLifetime): number => {
          if (performanceUsesCapacityExit) {
            return Math.min(
              Number(capacityTier.moveDays),
              lifetime.lifetimeDays,
            );
          }
          if (performanceUsesArchiveExit && lifetime.class !== "daily") {
            return Math.min(
              Number(archiveTier.moveDays),
              lifetime.lifetimeDays,
            );
          }
          return lifetime.lifetimeDays;
        };

        const violation = findVaultResidencyViolation(
          computeClassLifetimes(targetRetention),
          0,
          performanceExit,
        );
        if (violation) {
          sobrErrors.performanceVaultRetention = formatVaultRetentionMessage(
            violation,
            "Vault Performance Tier",
            `Increase the move threshold to at least ${VAULT_MINIMUM_RETENTION_DAYS} days, enable "Copy backups as soon as they are created" on Capacity Tier, or choose a non-Vault Performance Tier type.`,
          );
        }
      }
    }

    if (capacityTier.enabled) {
      const capacityErrors: {
        moveDays?: string;
        immutableDays?: string;
        vaultRetention?: string;
      } = {};

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

      if (
        REPO_TYPE_CATEGORY[capacityTier.type] === "vault" &&
        targetRetention &&
        !capacityErrors.moveDays
      ) {
        const entryDays = capacityTier.copyPolicy
          ? 0
          : capacityTier.movePolicy
            ? Number(capacityTier.moveDays)
            : undefined;

        const archiveMoveDaysValid =
          !archiveTier.enabled ||
          requireNumber(archiveTier.moveDays, { integer: true, min: 1 }) ===
            undefined;

        if (entryDays !== undefined && archiveMoveDaysValid) {
          const capacityExit = (lifetime: ClassLifetime): number => {
            if (lifetime.class === "daily") return lifetime.lifetimeDays;
            return archiveTier.enabled
              ? Math.min(Number(archiveTier.moveDays), lifetime.lifetimeDays)
              : lifetime.lifetimeDays;
          };

          const violation = findVaultResidencyViolation(
            computeClassLifetimes(targetRetention),
            entryDays,
            capacityExit,
          );
          if (violation) {
            capacityErrors.vaultRetention = formatVaultRetentionMessage(
              violation,
              "Vault Capacity Tier",
              `Increase the move threshold, increase retention, enable "Copy backups as soon as they are created," or choose a non-Vault Capacity Tier type.`,
            );
          }
        }
      }

      if (Object.keys(capacityErrors).length > 0) {
        sobrErrors.capacityTier = capacityErrors;
      }
    }

    if (archiveTier.enabled) {
      const archiveErrors: {
        moveDays?: string;
        immutableDays?: string;
        archiveFeedUnsupported?: string;
      } = {};

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

      if (Object.keys(archiveErrors).length > 0) {
        sobrErrors.archiveTier = archiveErrors;
      }
    }

    if (Object.keys(sobrErrors).length > 0) errors.sobr = sobrErrors;
  }

  return errors;
}
