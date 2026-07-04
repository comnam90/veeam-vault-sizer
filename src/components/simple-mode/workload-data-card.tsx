import { useId } from "react";
import { LoaderCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { validateWorkloadData } from "@/lib/simple-mode/validate-workload-data";
import type { WorkloadDataValues } from "@/types/simple-mode";

interface WorkloadDataCardProps {
  value: WorkloadDataValues;
  onChange: (value: WorkloadDataValues) => void;
}

interface WorkloadFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode: "decimal" | "numeric";
  error?: string;
  suffix?: string;
  hint?: string;
}

function WorkloadField({
  label,
  value,
  onChange,
  inputMode,
  error,
  suffix,
  hint,
}: WorkloadFieldProps) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Input
          id={inputId}
          value={value}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(suffix && "pr-8")}
        />
        {suffix ? (
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

interface GfsPointBoxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function GfsPointBox({ label, value, onChange, error }: GfsPointBoxProps) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-1 flex-col gap-1">
      <Input
        id={inputId}
        aria-label={`GFS Points ${label}`}
        value={value}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="text-center"
      />
      <span className="text-muted-foreground text-center text-xs tracking-wide uppercase">
        {label}
      </span>
      {error ? (
        <p id={errorId} className="text-destructive text-center text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface GfsPointsFieldProps {
  weekly: Omit<GfsPointBoxProps, "label">;
  monthly: Omit<GfsPointBoxProps, "label">;
  yearly: Omit<GfsPointBoxProps, "label">;
}

function GfsPointsField({ weekly, monthly, yearly }: GfsPointsFieldProps) {
  const groupId = useId();

  return (
    <div className="flex flex-col gap-2">
      <Label id={groupId}>GFS Points (W/M/Y)</Label>
      <div role="group" aria-labelledby={groupId} className="flex gap-2">
        <GfsPointBox label="Weekly" {...weekly} />
        <GfsPointBox label="Monthly" {...monthly} />
        <GfsPointBox label="Yearly" {...yearly} />
      </div>
    </div>
  );
}

export function WorkloadDataCard({ value, onChange }: WorkloadDataCardProps) {
  const errors = validateWorkloadData(value);

  function setField<K extends keyof WorkloadDataValues>(
    key: K,
    fieldValue: string,
  ) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <LoaderCircle aria-hidden="true" className="text-primary size-5" />
          Workload Data
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <WorkloadField
            label="Source Data Size (TB)"
            value={value.sourceSizeTB}
            onChange={(v) => setField("sourceSizeTB", v)}
            inputMode="decimal"
            error={errors.sourceSizeTB}
          />
          <WorkloadField
            label="Daily Change Rate (%)"
            value={value.dailyChangeRatePercent}
            onChange={(v) => setField("dailyChangeRatePercent", v)}
            inputMode="decimal"
            error={errors.dailyChangeRatePercent}
            suffix="%"
          />
          <WorkloadField
            label="Data Reduction (%)"
            value={value.dataReductionPercent}
            onChange={(v) => setField("dataReductionPercent", v)}
            inputMode="decimal"
            error={errors.dataReductionPercent}
            suffix="%"
            hint="Default 50%"
          />
          <WorkloadField
            label="Yearly Growth (%)"
            value={value.yearlyGrowthPercent}
            onChange={(v) => setField("yearlyGrowthPercent", v)}
            inputMode="decimal"
            error={errors.yearlyGrowthPercent}
            suffix="%"
          />
          <WorkloadField
            label="Short-term Retention (Days)"
            value={value.shortTermRetentionDays}
            onChange={(v) => setField("shortTermRetentionDays", v)}
            inputMode="numeric"
            error={errors.shortTermRetentionDays}
          />
          <GfsPointsField
            weekly={{
              value: value.gfsWeekly,
              onChange: (v) => setField("gfsWeekly", v),
              error: errors.gfsWeekly,
            }}
            monthly={{
              value: value.gfsMonthly,
              onChange: (v) => setField("gfsMonthly", v),
              error: errors.gfsMonthly,
            }}
            yearly={{
              value: value.gfsYearly,
              onChange: (v) => setField("gfsYearly", v),
              error: errors.gfsYearly,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
