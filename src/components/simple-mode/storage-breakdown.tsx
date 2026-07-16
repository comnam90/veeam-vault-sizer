import { Progress } from "@/components/ui/progress";
import {
  getTierStorageRows,
  getTotalStorageGB,
  type TierLabels,
} from "@/lib/simple-mode/storage-tiers";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

interface StorageBreakdownProps {
  data: CVmAgentReturnObject | null;
  tierLabels?: TierLabels;
}

export function StorageBreakdown({ data, tierLabels }: StorageBreakdownProps) {
  const tierRows = getTierStorageRows(data);
  const totalTB = getTotalStorageGB(data) / 1024;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Total Required Storage
        </p>
        <p className="font-mono text-3xl font-semibold">
          {data === null ? "—" : `${totalTB.toFixed(1)} TB`}
        </p>
      </div>
      {data !== null && tierRows.length > 0 ? (
        <div className="flex flex-col gap-3">
          {tierRows.map((tier) => {
            const tierTB = tier.diskGB / 1024;
            const percent = totalTB > 0 ? (tierTB / totalTB) * 100 : 0;
            return (
              <div key={tier.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {tierLabels?.[tier.key]
                      ? `${tier.label} — ${tierLabels[tier.key]}`
                      : tier.label}
                  </span>
                  <span className="font-mono">{tierTB.toFixed(1)} TB</span>
                </div>
                <Progress
                  value={percent}
                  indicatorClassName={tier.colorClassName}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
