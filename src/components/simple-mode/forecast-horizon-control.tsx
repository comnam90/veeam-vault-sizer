import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { validateWorkloadData } from "@/lib/simple-mode/validate-workload-data";
import type { WorkloadDataValues } from "@/types/simple-mode";

const SLIDER_MIN = 1;
const SLIDER_MAX = 5;

function clampForSliderDisplay(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return SLIDER_MIN;
  return Math.min(Math.max(parsed, SLIDER_MIN), SLIDER_MAX);
}

interface ForecastHorizonControlProps {
  value: WorkloadDataValues;
  onChange: (value: WorkloadDataValues) => void;
}

export function ForecastHorizonControl({
  value,
  onChange,
}: ForecastHorizonControlProps) {
  const inputId = useId();
  const errorId = useId();
  const error = validateWorkloadData(value).projectLengthYears;

  function setProjectLengthYears(next: string) {
    onChange({ ...value, projectLengthYears: next });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Label htmlFor={inputId} className="shrink-0">
          Forecast Horizon
        </Label>
        <Slider
          value={[clampForSliderDisplay(value.projectLengthYears)]}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={1}
          onValueChange={([next]) => setProjectLengthYears(String(next))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="w-32"
        />
        <Input
          id={inputId}
          aria-label="Forecast Horizon (years)"
          value={value.projectLengthYears}
          inputMode="numeric"
          onChange={(event) => setProjectLengthYears(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="w-16 text-center font-mono"
        />
        <span className="text-muted-foreground text-sm">yrs</span>
      </div>
      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
