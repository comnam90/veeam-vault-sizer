import type { CVmAgentReturnObject, Volume } from "@/types/vault-sizer-api";

export interface TierStorageRow {
  key: "performance" | "capacity" | "archive";
  label: string;
  diskGB: number;
  colorClassName: string;
}

// diskPurpose codes: 2 = RepoLocal, 3 = RepoObject (both Performance Tier);
// 13 = Capacity Tier; 4 = Archive Tier. See vault-sizer-api.ts.
const TIERS = [
  {
    key: "performance",
    label: "Performance",
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
): number {
  return (
    volumes.find((volume) => diskPurposes.includes(volume.diskPurpose))
      ?.diskGB ?? 0
  );
}

export function getTierStorageRows(
  data: CVmAgentReturnObject | null,
): TierStorageRow[] {
  const volumes = data?.repoCompute?.compute?.volumes ?? [];
  return TIERS.map((tier) => ({
    key: tier.key,
    label: tier.label,
    colorClassName: tier.colorClassName,
    diskGB: findTierDiskGB(volumes, tier.diskPurposes),
  })).filter((tier) => tier.diskGB > 0);
}

export function getTotalStorageGB(data: CVmAgentReturnObject | null): number {
  return getTierStorageRows(data).reduce((sum, tier) => sum + tier.diskGB, 0);
}
