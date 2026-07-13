import { GFS_PERIOD_DAYS } from "@/types/simple-mode";

export interface GfsPoints {
  weeklies: number;
  monthlies: number;
  yearlies: number;
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
    weeklies: Math.min(
      gfs.weeklies,
      Math.floor(horizonDays / GFS_PERIOD_DAYS.weekly),
    ),
    monthlies: Math.min(
      gfs.monthlies,
      Math.floor(horizonDays / GFS_PERIOD_DAYS.monthly),
    ),
    yearlies: Math.min(
      gfs.yearlies,
      Math.floor(horizonDays / GFS_PERIOD_DAYS.yearly),
    ),
  };
}
