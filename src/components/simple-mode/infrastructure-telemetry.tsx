import type { ComputeRequirement, Throughput } from "@/types/vault-sizer-api";

function formatThroughput(throughput: Throughput | null | undefined): string {
  if (throughput == null) return "—";
  return `${throughput.inboundMBps.toFixed(1)} / ${throughput.outboundMBps.toFixed(1)} MB/s`;
}

interface InfrastructureTelemetryProps {
  compute: ComputeRequirement | null | undefined;
}

export function InfrastructureTelemetry({
  compute,
}: InfrastructureTelemetryProps) {
  const rows = [
    { label: "Cores", value: compute ? String(compute.cores) : "—" },
    { label: "RAM", value: compute ? `${compute.ram} GB` : "—" },
    {
      label: "Network Throughput",
      value: formatThroughput(compute?.networkThroughput),
    },
  ];

  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.label}
            className="border-border border-t first:border-t-0"
          >
            <td className="text-muted-foreground py-1.5 pr-2">{row.label}</td>
            <td className="py-1.5 text-right font-mono">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
