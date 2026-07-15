import { StorageBreakdown } from "./storage-breakdown";
import { InfrastructureTelemetry } from "./infrastructure-telemetry";
import { NetworkBandwidth } from "./network-bandwidth";
import type { CVmAgentReturnObject, Throughput } from "@/types/vault-sizer-api";

interface SiteSizingSectionProps {
  title: string;
  badge: string;
  data: CVmAgentReturnObject;
  initialFullRestore: Throughput | null;
}

export function SiteSizingSection({
  title,
  badge,
  data,
  initialFullRestore,
}: SiteSizingSectionProps) {
  return (
    <div className="border-border flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-muted-foreground ml-auto text-xs">{badge}</span>
      </div>
      <StorageBreakdown data={data} />
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Proxy Compute
        </p>
        <InfrastructureTelemetry compute={data.proxyCompute?.compute} />
        <NetworkBandwidth
          nightlyIncremental={data.proxyCompute?.compute?.networkThroughput}
          initialFullRestore={initialFullRestore}
        />
      </div>
    </div>
  );
}
