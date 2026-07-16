import { LoaderCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
import { calculateInitialFullBandwidth } from "@/lib/simple-mode/calculate-initial-full-bandwidth";
import {
  getTargetTierLabels,
  getTotalStorageGB,
} from "@/lib/simple-mode/storage-tiers";
import { ForecastHorizonControl } from "./forecast-horizon-control";
import { SiteSizingSection } from "./site-sizing-section";
import {
  REPO_TYPE_LABEL,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

interface ProjectedSizingCardProps {
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
  onChange: (value: WorkloadDataValues) => void;
}

// Rounded once here so the headline and subline always sum consistently
// (D14) — the subline's secondary figure is a residual against the rounded
// combined/primary figures, not independently rounded from raw GB.
function computeCopyModeTotals(copyData: {
  primary: CVmAgentReturnObject | null;
  secondary: CVmAgentReturnObject | null;
}) {
  const combinedTB =
    (getTotalStorageGB(copyData.primary) +
      getTotalStorageGB(copyData.secondary)) /
    1024;
  const primaryTB = getTotalStorageGB(copyData.primary) / 1024;
  const combinedTBDisplay = combinedTB.toFixed(1);
  const primaryTBDisplay = primaryTB.toFixed(1);
  const secondaryTBDisplay = (
    Number(combinedTBDisplay) - Number(primaryTBDisplay)
  ).toFixed(1);
  return { combinedTBDisplay, primaryTBDisplay, secondaryTBDisplay };
}

export function ProjectedSizingCard({
  workloadData,
  repositoryConfig,
  onChange,
}: ProjectedSizingCardProps) {
  const { data, isLoading, error } = useCalculatedSizing(
    workloadData,
    repositoryConfig,
  );
  const initialFullRestore = calculateInitialFullBandwidth(
    workloadData.sourceSizeTB,
    workloadData.dataReductionPercent,
  );

  const directData = data?.mode === "direct" ? data.data : null;
  const copyData = data?.mode === "copy" ? data : null;

  // Shared by Direct mode's single target and Copy mode's Secondary — both
  // dispatch on the same targetRepository/sobr shape.
  const targetTierLabels = getTargetTierLabels(
    repositoryConfig.targetRepository,
    repositoryConfig.sobr,
  );

  const { combinedTBDisplay, primaryTBDisplay, secondaryTBDisplay } = copyData
    ? computeCopyModeTotals(copyData)
    : { combinedTBDisplay: "", primaryTBDisplay: "", secondaryTBDisplay: "" };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-xl">
          <span className="flex items-center gap-2">
            <TrendingUp aria-hidden="true" className="text-primary size-5" />
            Projected Sizing
          </span>
          {isLoading ? (
            <LoaderCircle
              aria-label="Recalculating"
              className="text-muted-foreground size-4 animate-spin"
            />
          ) : null}
        </CardTitle>
        <ForecastHorizonControl value={workloadData} onChange={onChange} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <div
            role="alert"
            className="border-destructive text-destructive rounded-md border px-3 py-2 text-sm"
          >
            {error}
          </div>
        ) : null}

        {copyData ? (
          <>
            <div>
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Combined Required Storage
              </p>
              <p className="font-mono text-3xl font-semibold">
                {combinedTBDisplay} TB
              </p>
              <p className="text-muted-foreground text-xs">
                Primary {primaryTBDisplay} TB{" + "}
                Secondary {secondaryTBDisplay} TB
              </p>
            </div>
            <SiteSizingSection
              title="Primary Repository"
              tierLabels={{
                performance: REPO_TYPE_LABEL[repositoryConfig.primary.repoType],
              }}
              data={copyData.primary}
              initialFullRestore={initialFullRestore}
            />
            <SiteSizingSection
              title="Secondary Repository"
              tierLabels={targetTierLabels}
              data={copyData.secondary}
              initialFullRestore={initialFullRestore}
            />
          </>
        ) : (
          <SiteSizingSection
            title="Primary Repository"
            tierLabels={targetTierLabels}
            data={directData}
            initialFullRestore={initialFullRestore}
          />
        )}

        <div
          data-testid="projected-sizing-assumptions-placeholder"
          className="border-border h-16 rounded-lg border border-dashed"
        />
        <div
          data-testid="projected-sizing-actions-placeholder"
          className="border-border h-20 rounded-lg border border-dashed"
        />
      </CardContent>
    </Card>
  );
}
