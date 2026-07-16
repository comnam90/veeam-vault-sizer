import { StorageBreakdown } from "./storage-breakdown";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import { NetworkBandwidth } from "./network-bandwidth";
import type { TierLabels } from "@/lib/simple-mode/storage-tiers";
import type { CVmAgentReturnObject, Throughput } from "@/types/vault-sizer-api";

interface SiteSizingSectionProps {
  title: string;
  tierLabels: TierLabels;
  data: CVmAgentReturnObject | null;
  initialFullRestore: Throughput | null;
}

export function SiteSizingSection({
  title,
  tierLabels,
  data,
  initialFullRestore,
}: SiteSizingSectionProps) {
  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <StorageBreakdown data={data} tierLabels={tierLabels} />
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Proxy Compute
        </p>
        <InfrastructureTelemetry compute={data?.proxyCompute?.compute} />
        <NetworkBandwidth
          nightlyIncremental={data?.proxyCompute?.compute?.networkThroughput}
          initialFullRestore={initialFullRestore}
        />
      </div>
    </div>
  );
}
