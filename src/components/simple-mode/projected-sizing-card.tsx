import { LoaderCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
import { calculateInitialFullBandwidth } from "@/lib/simple-mode/calculate-initial-full-bandwidth";
import { getTotalStorageGB } from "@/lib/simple-mode/storage-tiers";
import { ForecastHorizonControl } from "./forecast-horizon-control";
import { StorageBreakdown } from "./storage-breakdown";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import { NetworkBandwidth } from "./network-bandwidth";
import { SiteSizingSection } from "./site-sizing-section";
import {
  REPO_TYPE_LABEL,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";

interface ProjectedSizingCardProps {
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
  onChange: (value: WorkloadDataValues) => void;
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

  const secondaryBadge =
    repositoryConfig.targetRepository === "sobr"
      ? `SOBR · ${REPO_TYPE_LABEL[repositoryConfig.sobr.performanceType]}`
      : REPO_TYPE_LABEL[repositoryConfig.targetRepository];

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
                {(
                  (getTotalStorageGB(copyData.primary) +
                    getTotalStorageGB(copyData.secondary)) /
                  1024
                ).toFixed(1)}{" "}
                TB
              </p>
              <p className="text-muted-foreground text-xs">
                On-Premises{" "}
                {(getTotalStorageGB(copyData.primary) / 1024).toFixed(1)} TB
                {" + "}
                Offsite Vault{" "}
                {(getTotalStorageGB(copyData.secondary) / 1024).toFixed(1)} TB
              </p>
            </div>
            <SiteSizingSection
              title="Primary — On-Premises Landing Zone"
              badge={REPO_TYPE_LABEL[repositoryConfig.primary.repoType]}
              data={copyData.primary}
              initialFullRestore={initialFullRestore}
            />
            <SiteSizingSection
              title="Secondary — Offsite Cloud Vault"
              badge={secondaryBadge}
              data={copyData.secondary}
              initialFullRestore={initialFullRestore}
            />
          </>
        ) : (
          <>
            <StorageBreakdown data={directData} />
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Proxy Compute
              </p>
              <InfrastructureTelemetry
                compute={directData?.proxyCompute?.compute}
              />
              <NetworkBandwidth
                nightlyIncremental={
                  directData?.proxyCompute?.compute?.networkThroughput
                }
                initialFullRestore={initialFullRestore}
              />
            </div>
          </>
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
