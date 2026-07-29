import { calculateInitialFullBandwidth } from "./calculate-initial-full-bandwidth";
import { formatThroughputMbps } from "./format-throughput";
import { getTierStorageRows, getTotalStorageGB } from "./storage-tiers";
import {
  REPO_TYPE_LABEL,
  type ArchiveTierConfig,
  type CapacityTierConfig,
  type RepositoryConfigValues,
  type RetentionOverride,
  type SizerResult,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

export interface CompareEntry {
  label: string;
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
  data: SizerResult | null;
}

export interface ComparisonRow {
  label: string;
  values: (string | null)[];
}

function getPrimaryData(data: SizerResult | null): CVmAgentReturnObject | null {
  if (data === null) return null;
  return data.mode === "direct" ? data.data : data.primary;
}

function getSecondaryData(
  data: SizerResult | null,
): CVmAgentReturnObject | null {
  if (data === null || data.mode === "direct") return null;
  return data.secondary;
}

function formatTB(gb: number): string {
  return `${(gb / 1024).toFixed(1)} TB`;
}

export function getTotalRequiredStorageTB(
  data: SizerResult | null,
): number | null {
  if (data === null) return null;
  const primaryGB = getTotalStorageGB(getPrimaryData(data));
  const secondaryGB =
    data.mode === "copy" ? getTotalStorageGB(data.secondary) : 0;
  return (primaryGB + secondaryGB) / 1024;
}

const TIER_KEYS = ["performance", "capacity", "archive"] as const;
const TIER_ROW_LABELS: Record<(typeof TIER_KEYS)[number], string> = {
  performance: "Performance",
  capacity: "Capacity",
  archive: "Archive",
};

function getTierRowsForRole(
  roleLabel: "Primary" | "Secondary",
  entries: CompareEntry[],
  getRoleData: (entry: CompareEntry) => CVmAgentReturnObject | null,
): ComparisonRow[] {
  return TIER_KEYS.map((key) => ({
    label: `${roleLabel} — ${TIER_ROW_LABELS[key]}`,
    values: entries.map((entry) => {
      const tierRow = getTierStorageRows(getRoleData(entry)).find(
        (tier) => tier.key === key,
      );
      return tierRow ? formatTB(tierRow.diskGB) : null;
    }),
  })).filter((row) => row.values.some((value) => value !== null));
}

// Derived from workloadData alone — genuinely role-independent, not a bug.
// This means a copy-mode entry's Primary and Secondary "Initial Full /
// Restore" rows will show the identical figure twice; that matches
// projected-sizing-card.tsx's existing behavior today (it passes this same
// `initialFullRestore` value to both SiteSizingSections), which is what the
// spec's "reproduces every figure SiteSizingSection shows today" commits to.
// Don't "fix" this into two independently-computed numbers without a
// separate design decision — there's no per-role bandwidth split to derive it from.
function getEntryInitialFullRestore(entry: CompareEntry) {
  return calculateInitialFullBandwidth(
    entry.workloadData.sourceSizeTB,
    entry.workloadData.dataReductionPercent,
  );
}

function getComputeAndBandwidthRowsForRole(
  roleLabel: "Primary" | "Secondary",
  entries: CompareEntry[],
  getRoleData: (entry: CompareEntry) => CVmAgentReturnObject | null,
): ComparisonRow[] {
  const compute = entries.map(
    (entry) => getRoleData(entry)?.proxyCompute?.compute,
  );

  const rows: ComparisonRow[] = [
    {
      label: `${roleLabel} — Cores`,
      values: compute.map((c) => (c ? String(c.cores) : null)),
    },
    {
      label: `${roleLabel} — RAM`,
      values: compute.map((c) => (c ? `${c.ram} GB` : null)),
    },
    {
      label: `${roleLabel} — Nightly Incremental (8h)`,
      values: compute.map((c) =>
        c?.networkThroughput ? formatThroughputMbps(c.networkThroughput) : null,
      ),
    },
    {
      label: `${roleLabel} — Initial Full / Restore (24h)`,
      values: entries.map((entry, index) => {
        if (!compute[index]) return null;
        const throughput = getEntryInitialFullRestore(entry);
        return throughput ? formatThroughputMbps(throughput) : null;
      }),
    },
  ];

  return rows.filter((row) => row.values.some((value) => value !== null));
}

export function getSizingComparisonRows(
  entries: CompareEntry[],
): ComparisonRow[] {
  return [
    {
      label: "Total Required Storage",
      values: entries.map((entry) => {
        const totalTB = getTotalRequiredStorageTB(entry.data);
        return totalTB === null ? null : `${totalTB.toFixed(1)} TB`;
      }),
    },
    ...getTierRowsForRole("Primary", entries, (entry) =>
      getPrimaryData(entry.data),
    ),
    ...getComputeAndBandwidthRowsForRole("Primary", entries, (entry) =>
      getPrimaryData(entry.data),
    ),
    ...getTierRowsForRole("Secondary", entries, (entry) =>
      getSecondaryData(entry.data),
    ),
    ...getComputeAndBandwidthRowsForRole("Secondary", entries, (entry) =>
      getSecondaryData(entry.data),
    ),
  ];
}

const WORKLOAD_DATA_FIELDS: {
  label: string;
  get: (w: WorkloadDataValues) => string;
}[] = [
  { label: "Source Size (TB)", get: (w) => w.sourceSizeTB },
  { label: "Daily Change Rate (%)", get: (w) => w.dailyChangeRatePercent },
  { label: "Data Reduction (%)", get: (w) => w.dataReductionPercent },
  { label: "Yearly Growth (%)", get: (w) => w.yearlyGrowthPercent },
  {
    label: "Short-Term Retention (Days)",
    get: (w) => w.shortTermRetentionDays,
  },
  { label: "GFS Weekly", get: (w) => w.gfsWeekly },
  { label: "GFS Monthly", get: (w) => w.gfsMonthly },
  { label: "GFS Yearly", get: (w) => w.gfsYearly },
  { label: "Forecast Horizon (Years)", get: (w) => w.projectLengthYears },
  {
    label: "Cap GFS to Forecast Horizon",
    get: (w) => (w.capGfsToForecastHorizon ? "On" : "Off"),
  },
];

export function getWorkloadDataComparisonRows(
  entries: CompareEntry[],
): ComparisonRow[] {
  return WORKLOAD_DATA_FIELDS.map(({ label, get }) => ({
    label,
    values: entries.map((entry) => get(entry.workloadData)),
  }));
}

function formatCapacityTierPolicy(tier: CapacityTierConfig): string {
  // copyPolicy and movePolicy are independent booleans (two separate
  // checkboxes in sobr-builder.tsx) — Veeam SOBR allows Copy and Move to
  // run together, and DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.capacityTier
  // ships with both true. A policy?"Copy":policy?"Move":"—" ternary would
  // silently drop "Move" whenever both are set, which is the common case,
  // not an edge case — so all four combinations are named explicitly.
  if (tier.copyPolicy && tier.movePolicy) return "Copy + Move";
  if (tier.copyPolicy) return "Copy";
  if (tier.movePolicy) return "Move";
  return "—";
}

function formatCapacityTier(tier: CapacityTierConfig): string {
  const policy = formatCapacityTierPolicy(tier);
  return `${REPO_TYPE_LABEL[tier.type]}, ${policy}, move at ${tier.moveDays}d, immutable ${tier.immutableDays}d`;
}

function formatArchiveTier(tier: ArchiveTierConfig): string {
  const standalone = tier.standaloneFullBackups ? ", standalone fulls" : "";
  return `move at ${tier.moveDays}d, immutable ${tier.immutableDays}d${standalone}`;
}

function formatRetentionOverride(retention: RetentionOverride): string | null {
  if (!retention.customizeRetention) return null;
  return `${retention.retentionDays}d + ${retention.gfsWeekly}w / ${retention.gfsMonthly}m / ${retention.gfsYearly}y`;
}

function getPrimaryTargetConfigRows(entries: CompareEntry[]): ComparisonRow[] {
  const rows: ComparisonRow[] = [
    {
      label: "Primary — Repository Type",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        const repoType =
          repositoryConfig.backupPath === "copy"
            ? repositoryConfig.primary.repoType
            : repositoryConfig.targetRepository === "sobr"
              ? repositoryConfig.sobr.performanceType
              : repositoryConfig.targetRepository;
        return REPO_TYPE_LABEL[repoType];
      }),
    },
    {
      label: "Primary — Immutable (Days)",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        return repositoryConfig.backupPath === "copy"
          ? repositoryConfig.primary.immutableDays
          : repositoryConfig.targetRepository === "sobr"
            ? repositoryConfig.sobr.performanceImmutableDays
            : repositoryConfig.targetRepositoryImmutableDays;
      }),
    },
    {
      label: "Primary — Capacity Tier",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath === "copy") return null;
        if (repositoryConfig.targetRepository !== "sobr") return null;
        if (!repositoryConfig.sobr.capacityTier.enabled) return null;
        return formatCapacityTier(repositoryConfig.sobr.capacityTier);
      }),
    },
    {
      label: "Primary — Archive Tier",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath === "copy") return null;
        if (repositoryConfig.targetRepository !== "sobr") return null;
        if (!repositoryConfig.sobr.archiveTier.enabled) return null;
        return formatArchiveTier(repositoryConfig.sobr.archiveTier);
      }),
    },
    {
      label: "Primary — Retention Override",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        return formatRetentionOverride(repositoryConfig.primary.retention);
      }),
    },
  ];

  return rows.filter((row) => row.values.some((value) => value !== null));
}

function getSecondaryConfigRows(entries: CompareEntry[]): ComparisonRow[] {
  const rows: ComparisonRow[] = [
    {
      label: "Secondary — Repository Type",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        return REPO_TYPE_LABEL[
          repositoryConfig.targetRepository === "sobr"
            ? repositoryConfig.sobr.performanceType
            : repositoryConfig.targetRepository
        ];
      }),
    },
    {
      label: "Secondary — Immutable (Days)",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        return repositoryConfig.targetRepository === "sobr"
          ? repositoryConfig.sobr.performanceImmutableDays
          : repositoryConfig.targetRepositoryImmutableDays;
      }),
    },
    {
      label: "Secondary — Capacity Tier",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        if (repositoryConfig.targetRepository !== "sobr") return null;
        if (!repositoryConfig.sobr.capacityTier.enabled) return null;
        return formatCapacityTier(repositoryConfig.sobr.capacityTier);
      }),
    },
    {
      label: "Secondary — Archive Tier",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        if (repositoryConfig.targetRepository !== "sobr") return null;
        if (!repositoryConfig.sobr.archiveTier.enabled) return null;
        return formatArchiveTier(repositoryConfig.sobr.archiveTier);
      }),
    },
    {
      label: "Secondary — Retention Override",
      values: entries.map((entry) => {
        const { repositoryConfig } = entry;
        if (repositoryConfig.backupPath !== "copy") return null;
        return formatRetentionOverride(repositoryConfig.secondaryRetention);
      }),
    },
  ];

  return rows.filter((row) => row.values.some((value) => value !== null));
}

export function getRepositoryConfigComparisonRows(
  entries: CompareEntry[],
): ComparisonRow[] {
  return [
    {
      label: "Backup Path",
      values: entries.map((entry) =>
        entry.repositoryConfig.backupPath === "copy" ? "Copy" : "Direct",
      ),
    },
    ...getPrimaryTargetConfigRows(entries),
    ...getSecondaryConfigRows(entries),
  ];
}
