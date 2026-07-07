import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  RetentionOverride,
  RetentionOverrideErrors,
  WorkloadDataValues,
} from "@/types/simple-mode";

interface RetentionOverrideBlockProps {
  context: string;
  checkboxLabel: string;
  value: RetentionOverride;
  workloadData: WorkloadDataValues;
  errors?: RetentionOverrideErrors;
  onChange: (value: RetentionOverride) => void;
}

export function RetentionOverrideBlock({
  context,
  checkboxLabel,
  value,
  workloadData,
  errors,
  onChange,
}: RetentionOverrideBlockProps) {
  const checkboxId = useId();
  const retentionDaysId = useId();
  const gfsWeeklyId = useId();
  const gfsMonthlyId = useId();
  const gfsYearlyId = useId();

  function handleCheckedChange(checked: boolean | "indeterminate") {
    if (checked === true) {
      onChange({
        customizeRetention: true,
        retentionDays: workloadData.shortTermRetentionDays,
        gfsWeekly: workloadData.gfsWeekly,
        gfsMonthly: workloadData.gfsMonthly,
        gfsYearly: workloadData.gfsYearly,
      });
    } else {
      onChange({ ...value, customizeRetention: false });
    }
  }

  function setField<K extends keyof RetentionOverride>(
    key: K,
    fieldValue: RetentionOverride[K],
  ) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={value.customizeRetention}
          onCheckedChange={handleCheckedChange}
        />
        <Label
          htmlFor={checkboxId}
          className="text-muted-foreground font-normal tracking-normal normal-case"
        >
          {checkboxLabel} (currently mirroring Workload Data)
        </Label>
      </div>

      {value.customizeRetention ? (
        <div className="grid grid-cols-4 gap-3 pl-6">
          <div className="flex flex-col gap-1">
            <Label htmlFor={retentionDaysId}>Retention (Days)</Label>
            <Input
              id={retentionDaysId}
              aria-label={`${context} retention (days)`}
              value={value.retentionDays}
              inputMode="numeric"
              onChange={(e) => setField("retentionDays", e.target.value)}
              aria-invalid={errors?.retentionDays ? true : undefined}
            />
            {errors?.retentionDays ? (
              <p className="text-destructive text-xs">{errors.retentionDays}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={gfsWeeklyId}>GFS Weekly</Label>
            <Input
              id={gfsWeeklyId}
              aria-label={`${context} GFS Weekly`}
              value={value.gfsWeekly}
              inputMode="numeric"
              onChange={(e) => setField("gfsWeekly", e.target.value)}
              aria-invalid={errors?.gfsWeekly ? true : undefined}
            />
            {errors?.gfsWeekly ? (
              <p className="text-destructive text-xs">{errors.gfsWeekly}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={gfsMonthlyId}>GFS Monthly</Label>
            <Input
              id={gfsMonthlyId}
              aria-label={`${context} GFS Monthly`}
              value={value.gfsMonthly}
              inputMode="numeric"
              onChange={(e) => setField("gfsMonthly", e.target.value)}
              aria-invalid={errors?.gfsMonthly ? true : undefined}
            />
            {errors?.gfsMonthly ? (
              <p className="text-destructive text-xs">{errors.gfsMonthly}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={gfsYearlyId}>GFS Yearly</Label>
            <Input
              id={gfsYearlyId}
              aria-label={`${context} GFS Yearly`}
              value={value.gfsYearly}
              inputMode="numeric"
              onChange={(e) => setField("gfsYearly", e.target.value)}
              aria-invalid={errors?.gfsYearly ? true : undefined}
            />
            {errors?.gfsYearly ? (
              <p className="text-destructive text-xs">{errors.gfsYearly}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground pl-6 text-sm">
          ↳ Retaining {workloadData.shortTermRetentionDays} Dailies +{" "}
          {workloadData.gfsWeekly}W / {workloadData.gfsMonthly}M /{" "}
          {workloadData.gfsYearly}Y
        </p>
      )}
    </div>
  );
}
