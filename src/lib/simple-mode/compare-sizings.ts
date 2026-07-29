import { calculateInitialFullBandwidth } from "./calculate-initial-full-bandwidth";
import { formatThroughputMbps } from "./format-throughput";
import { getTierStorageRows, getTotalStorageGB } from "./storage-tiers";
import type {
  RepositoryConfigValues,
  SizerResult,
  WorkloadDataValues,
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
