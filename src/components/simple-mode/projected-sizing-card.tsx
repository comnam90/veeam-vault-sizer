import { LoaderCircle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  type SizerResult,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

interface ProjectedSizingCardProps {
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
  data: SizerResult | null;
  isLoading: boolean;
  error: string | null;
  // Whether the Snapshot button may be used right now — computed by the
  // caller (which owns workloadData/repositoryConfig) from isLoading, error,
  // data, and current form validity. Kept as a single incoming boolean
  // rather than re-deriving loading/error/data/validation logic here.
  canSnapshot: boolean;
  onChange: (value: WorkloadDataValues) => void;
  onSnapshot: () => void;
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
  data,
  isLoading,
  error,
  canSnapshot,
  onChange,
  onSnapshot,
}: ProjectedSizingCardProps) {
  const initialFullRestore = calculateInitialFullBandwidth(
    workloadData.sourceSizeTB,
    workloadData.dataReductionPercent,
  );

  const directData = data?.mode === "direct" ? data.data : null;
  const copyData = data?.mode === "copy" ? data : null;
  const archiveTierNotice = data?.archiveTierNotice;

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

        {archiveTierNotice?.status === "adjusted" ? (
          <div className="border-border bg-muted/50 text-muted-foreground rounded-md border px-3 py-2 text-sm">
            Effective offload threshold adjusted internally to{" "}
            {archiveTierNotice.effectiveThresholdDays} days to match GFS chain
            offload requirements.
          </div>
        ) : null}

        {archiveTierNotice?.status === "failed" ? (
          <div
            role="alert"
            className="border-destructive text-destructive rounded-md border px-3 py-2 text-sm"
          >
            This configuration's Archive Tier sizing couldn't be fully verified
            due to a known calculator engine limitation. Try enabling Capacity
            Tier, or adjusting the Archive Tier offload threshold.
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
        <Button variant="outline" onClick={onSnapshot} disabled={!canSnapshot}>
          Snapshot current sizing
        </Button>
      </CardContent>
    </Card>
  );
}
