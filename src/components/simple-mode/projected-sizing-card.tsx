import { LoaderCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCalculatedSizing } from "@/hooks/use-calculated-sizing";
import { calculateInitialFullBandwidth } from "@/lib/simple-mode/calculate-initial-full-bandwidth";
import { ForecastHorizonControl } from "./forecast-horizon-control";
import { StorageBreakdown } from "./storage-breakdown";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import { NetworkBandwidth } from "./network-bandwidth";
import type {
  RepositoryConfigValues,
  WorkloadDataValues,
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
        <StorageBreakdown data={data} />
        <InfrastructureTelemetry compute={data?.proxyCompute?.compute} />
        <NetworkBandwidth
          nightlyIncremental={data?.proxyCompute?.compute?.networkThroughput}
          initialFullRestore={initialFullRestore}
        />
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
