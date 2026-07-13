import { GFS_PERIOD_DAYS } from "@/types/simple-mode";

export interface GfsPoints {
  weeklies: number;
  monthlies: number;
  yearlies: number;
}

function capToHorizon(
  count: number,
  periodDays: number,
  horizonDays: number,
): number {
  return Math.min(count, Math.floor(horizonDays / periodDays));
}

/**
 * Caps each GFS class's count so its total duration (count × period) never
 * exceeds the Forecast Horizon — otherwise the official calculator sizes
 * GFS points as pre-existing "brownfield" data beyond the horizon, while
 * only growth gets scoped to it.
 */
export function capGfsToForecastHorizon(
  gfs: GfsPoints,
  projectLengthYears: number,
): GfsPoints {
  const horizonDays = projectLengthYears * GFS_PERIOD_DAYS.yearly;

  return {
    weeklies: capToHorizon(gfs.weeklies, GFS_PERIOD_DAYS.weekly, horizonDays),
    monthlies: capToHorizon(
      gfs.monthlies,
      GFS_PERIOD_DAYS.monthly,
      horizonDays,
    ),
    yearlies: capToHorizon(gfs.yearlies, GFS_PERIOD_DAYS.yearly, horizonDays),
  };
}
