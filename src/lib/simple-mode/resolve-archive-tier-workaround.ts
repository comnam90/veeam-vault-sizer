import type {
  CVmAgentReturnObject,
  VmAgentInputs,
} from "@/types/vault-sizer-api";

const CAPACITY_TIER_DISK_PURPOSE = 13;

/**
 * True iff the request has Archive Tier enabled with neither Capacity Tier
 * policy on — the exact shape that triggers Issues 1 and 2 documented in
 * docs/evidence/sobr-archive-tier-no-capacity/README.md. Storage-type
 * agnostic: both issues are this one shape.
 */
export function detectsArchiveTierWithoutCapacity(
  inputs: VmAgentInputs,
): boolean {
  return (
    inputs.archiveTierEnabled === true &&
    inputs.moveCapacityTierEnabled !== true &&
    inputs.copyCapacityTierEnabled !== true
  );
}

/**
 * Builds the phantom, pass-through Capacity Tier substitution: Capacity
 * Tier "on" at a floor of max(archiveTierDays, immutablePerfDays), with
 * archiveTierDays zeroed so Capacity forwards everything into Archive
 * immediately. Returns a refined type guaranteeing capacityTierDays is
 * always a definite number (never the base type's optional undefined).
 */
export function buildPhantomCapacityInputs(
  inputs: VmAgentInputs,
): VmAgentInputs & { capacityTierDays: number } {
  const archiveTierDays = inputs.archiveTierDays ?? 0;
  const immutablePerfDays = inputs.immutablePerfDays ?? 0;
  return {
    ...inputs,
    moveCapacityTierEnabled: true,
    copyCapacityTierEnabled: false,
    capacityTierDays: Math.max(archiveTierDays, immutablePerfDays),
    archiveTierDays: 0,
  };
}

/**
 * True when the ghost Capacity Tier volume (diskPurpose 13) is non-zero —
 * the signal that the threshold in use was too low and stranded non-GFS
 * points there instead of leaving them in Performance.
 */
export function hasLeakedNonGfsPoints(response: CVmAgentReturnObject): boolean {
  const volumes = response.repoCompute?.compute?.volumes ?? [];
  const capacityVolume = volumes.find(
    (volume) => volume.diskPurpose === CAPACITY_TIER_DISK_PURPOSE,
  );
  return (capacityVolume?.diskGB ?? 0) > 0;
}

/**
 * One more than the maximum day among the response's own non-GFS restore
 * points. Only ever called after hasLeakedNonGfsPoints has returned true
 * for the same response, which implies at least one non-GFS point exists
 * — an empty non-GFS set (max of nothing) is not reachable from that call
 * site.
 */
export function computeCorrectedThreshold(
  response: CVmAgentReturnObject,
): number {
  const nonGfsDays = (response.restorePoints ?? [])
    .filter((point) => !point.isGFS)
    .map((point) => point.day);
  return Math.max(...nonGfsDays) + 1;
}

/**
 * Threshold-aware day-set membership: every isGFS:true day *older than the
 * threshold actually sent* (day > threshold) must appear (at least once)
 * tagged pointType "archiveTier". GFS days at or under the threshold
 * haven't crossed the phantom Capacity Tier's move boundary yet and
 * legitimately stay performanceTier-only — not a completeness failure.
 * Live-API repro: with the app's defaults (archiveTierDays 90), the first
 * distinct monthly GFS point sits at day 63 and correctly stays
 * unarchived; a plain (threshold-unaware) day-set check flagged every
 * archiveTierDays past 62 as a false failure. See
 * docs/evidence/sobr-archive-tier-no-capacity/README.md's "Threshold-aware
 * completeness" finding.
 *
 * `threshold` must be the exact capacityTierDays value used in the request
 * that produced `response` (finalThreshold in the caller) — the boundary
 * the engine actually moved against, not the user's raw archiveTierDays.
 */
export function isArchiveComplete(
  response: CVmAgentReturnObject,
  threshold: number,
): boolean {
  const points = response.restorePoints ?? [];
  const gfsDaysRequiringArchive = points
    .filter((point) => point.isGFS && point.day > threshold)
    .map((point) => point.day);
  const archivedDays = new Set(
    points
      .filter((point) => point.pointType === "archiveTier")
      .map((point) => point.day),
  );
  return gfsDaysRequiringArchive.every((day) => archivedDays.has(day));
}
