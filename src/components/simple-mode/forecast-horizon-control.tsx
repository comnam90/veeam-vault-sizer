import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
  const capToggleId = useId();
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
          aria-label="Forecast Horizon slider"
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
      <div className="flex items-center gap-2">
        <Switch
          id={capToggleId}
          checked={value.capGfsToForecastHorizon}
          onCheckedChange={(checked) =>
            onChange({ ...value, capGfsToForecastHorizon: checked })
          }
        />
        <Label
          htmlFor={capToggleId}
          className="font-normal tracking-normal normal-case"
        >
          Cap GFS retention to Forecast Horizon
        </Label>
      </div>
    </div>
  );
}
