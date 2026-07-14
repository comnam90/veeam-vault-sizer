import type { Throughput } from "@/types/vault-sizer-api";
import {
  BACKUP_WINDOW_HOURS,
  FULL_BACKUP_WINDOW_HOURS,
} from "@/lib/simple-mode/backup-windows";

function formatThroughput(throughput: Throughput | null | undefined): string {
  if (throughput == null) return "—";
  return `${throughput.outboundMBps.toFixed(1)} MB/s`;
}

interface NetworkBandwidthProps {
  nightlyIncremental: Throughput | null | undefined;
  initialFullRestore: Throughput | null | undefined;
}

export function NetworkBandwidth({
  nightlyIncremental,
  initialFullRestore,
}: NetworkBandwidthProps) {
  const rows = [
    {
      label: `Nightly Incremental (${BACKUP_WINDOW_HOURS}h)`,
      value: formatThroughput(nightlyIncremental),
    },
    {
      label: `Initial Full / Restore (${FULL_BACKUP_WINDOW_HOURS}h)`,
      value: formatThroughput(initialFullRestore),
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
