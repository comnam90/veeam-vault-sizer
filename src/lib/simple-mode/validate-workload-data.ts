import type {
  WorkloadDataErrors,
  WorkloadDataValues,
} from "@/types/simple-mode";

interface NumberRules {
  integer?: boolean;
  min?: number;
  max?: number;
  exclusiveMin?: number;
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

  if (rules.exclusiveMin !== undefined && value <= rules.exclusiveMin) {
    return `Must be greater than ${rules.exclusiveMin}`;
  }

  if (rules.min !== undefined && rules.max !== undefined) {
    if (value < rules.min || value > rules.max) {
      return `Must be between ${rules.min} and ${rules.max}`;
    }
    return undefined;
  }

  if (rules.min !== undefined && value < rules.min) {
    return `Must be ${rules.min} or greater`;
  }

  return undefined;
}

export function validateWorkloadData(
  values: WorkloadDataValues,
): WorkloadDataErrors {
  const errors: WorkloadDataErrors = {};

  const sourceSizeTBError = requireNumber(values.sourceSizeTB, {
    exclusiveMin: 0,
  });
  if (sourceSizeTBError) errors.sourceSizeTB = sourceSizeTBError;

  const dailyChangeRatePercentError = requireNumber(
    values.dailyChangeRatePercent,
    { min: 0, max: 100 },
  );
  if (dailyChangeRatePercentError)
    errors.dailyChangeRatePercent = dailyChangeRatePercentError;

  const dataReductionPercentError = requireNumber(values.dataReductionPercent, {
    min: 0,
    max: 100,
  });
  if (dataReductionPercentError)
    errors.dataReductionPercent = dataReductionPercentError;

  const yearlyGrowthPercentError = requireNumber(values.yearlyGrowthPercent, {
    min: 0,
  });
  if (yearlyGrowthPercentError)
    errors.yearlyGrowthPercent = yearlyGrowthPercentError;

  const shortTermRetentionDaysError = requireNumber(
    values.shortTermRetentionDays,
    { integer: true, min: 1 },
  );
  if (shortTermRetentionDaysError)
    errors.shortTermRetentionDays = shortTermRetentionDaysError;

  const gfsWeeklyError = requireNumber(values.gfsWeekly, {
    integer: true,
    min: 0,
  });
  if (gfsWeeklyError) errors.gfsWeekly = gfsWeeklyError;

  const gfsMonthlyError = requireNumber(values.gfsMonthly, {
    integer: true,
    min: 0,
  });
  if (gfsMonthlyError) errors.gfsMonthly = gfsMonthlyError;

  const gfsYearlyError = requireNumber(values.gfsYearly, {
    integer: true,
    min: 0,
  });
  if (gfsYearlyError) errors.gfsYearly = gfsYearlyError;

  return errors;
}
