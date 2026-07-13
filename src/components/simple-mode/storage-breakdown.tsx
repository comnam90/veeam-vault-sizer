import { Progress } from "@/components/ui/progress";
import type { CVmAgentReturnObject, Volume } from "@/types/vault-sizer-api";

const TIERS = [
  {
    key: "performance",
    label: "Performance",
    // RepoLocal (block/file repo types, e.g. Hardened Repository) or
    // RepoObject (vault/object-storage repo types) — exactly one applies,
    // depending on the selected Performance Tier repo type.
    diskPurposes: [2, 3],
    colorClassName: "bg-tier-performance",
  },
  {
    key: "capacity",
    label: "Capacity",
    diskPurposes: [13],
    colorClassName: "bg-tier-capacity",
  },
  {
    key: "archive",
    label: "Archive",
    diskPurposes: [4],
    colorClassName: "bg-tier-archive",
  },
] as const;

function findTierDiskGB(
  volumes: Volume[],
  diskPurposes: readonly number[],
): number | undefined {
  return volumes.find((volume) => diskPurposes.includes(volume.diskPurpose))
    ?.diskGB;
}

interface StorageBreakdownProps {
  data: CVmAgentReturnObject | null;
}

export function StorageBreakdown({ data }: StorageBreakdownProps) {
  const volumes = data?.repoCompute?.compute?.volumes ?? [];
  const tierRows = TIERS.map((tier) => ({
    ...tier,
    diskGB: findTierDiskGB(volumes, tier.diskPurposes),
  })).filter((tier) => tier.diskGB !== undefined);

  const totalGB = tierRows.reduce((sum, tier) => sum + (tier.diskGB ?? 0), 0);
  const totalTB = totalGB / 1024;

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
            const tierTB = (tier.diskGB ?? 0) / 1024;
            const percent = totalTB > 0 ? (tierTB / totalTB) * 100 : 0;
            return (
              <div key={tier.key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{tier.label}</span>
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
