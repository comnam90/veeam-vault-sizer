import type { Throughput } from "@/types/vault-sizer-api";
import { FULL_BACKUP_WINDOW_HOURS } from "./backup-windows";

/**
 * Bandwidth needed to move the entire source dataset within the fixed
 * FULL_BACKUP_WINDOW_HOURS window — sizes both the initial full backup and,
 * with inbound/outbound reversed, a full machine restore. Mirrors the
 * vendor API's own nightly-incremental formula (sourceTB × changeRate% ÷
 * BACKUP_WINDOW_HOURS), just against the whole sourceTB and a 24h window
 * instead of a daily delta and an 8h window — the vendor API has no
 * equivalent field for this scenario, so it's derived locally.
 */
export function calculateInitialFullBandwidth(
  sourceSizeTB: string,
  dataReductionPercent: string,
): Throughput | null {
  const sourceTB = Number(sourceSizeTB);
  const reduction = Number(dataReductionPercent);

  if (!Number.isFinite(sourceTB) || sourceTB <= 0) return null;
  if (!Number.isFinite(reduction) || reduction < 0 || reduction > 100) {
    return null;
  }

  const inboundMBps =
    (sourceTB * 1_048_576) / (FULL_BACKUP_WINDOW_HOURS * 3600);
  return { inboundMBps, outboundMBps: inboundMBps * (1 - reduction / 100) };
}
