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

// capGfsToForecastHorizon is a boolean Switch, not a numeric text field —
// excluded from this validator's key type.
type NumericFieldKey = Exclude<
  keyof WorkloadDataValues,
  "capGfsToForecastHorizon"
>;

const FIELD_RULES: { key: NumericFieldKey; rules: NumberRules }[] = [
  { key: "sourceSizeTB", rules: { exclusiveMin: 0 } },
  { key: "dailyChangeRatePercent", rules: { min: 0, max: 100 } },
  { key: "dataReductionPercent", rules: { min: 0, max: 100 } },
  { key: "yearlyGrowthPercent", rules: { min: 0 } },
  { key: "shortTermRetentionDays", rules: { integer: true, min: 1 } },
  { key: "gfsWeekly", rules: { integer: true, min: 0 } },
  { key: "gfsMonthly", rules: { integer: true, min: 0 } },
  { key: "gfsYearly", rules: { integer: true, min: 0 } },
  { key: "projectLengthYears", rules: { integer: true, min: 1, max: 100 } },
];

export function validateWorkloadData(
  values: WorkloadDataValues,
): WorkloadDataErrors {
  const errors: WorkloadDataErrors = {};

  for (const { key, rules } of FIELD_RULES) {
    const error = requireNumber(values[key], rules);
    if (error) errors[key] = error;
  }

  return errors;
}
