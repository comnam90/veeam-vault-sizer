import {
  BLOCK_GENERATION_DAYS,
  REPO_TYPE_CATEGORY,
  repoTypeRequiresImmutability,
  repoTypeSupportsBlockCloning,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { VmAgentInputs } from "@/types/vault-sizer-api";
import { capGfsToForecastHorizon } from "./cap-gfs-to-forecast-horizon";

// Fixed sizing assumptions with no corresponding UI field yet.
const BACKUP_WINDOW_HOURS = 8;

export function buildVmAgentRequest(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): VmAgentInputs {
  if (repositoryConfig.backupPath === "copy") {
    throw new Error(
      "Backup Copy sizing isn't implemented yet — it needs two independent " +
        "VmAgentInputs requests (Primary and Secondary), per ADR-0007, not " +
        "a single request.",
    );
  }

  const rawGfs = {
    weeklies: Number(workloadData.gfsWeekly),
    monthlies: Number(workloadData.gfsMonthly),
    yearlies: Number(workloadData.gfsYearly),
  };
  const gfs = workloadData.capGfsToForecastHorizon
    ? capGfsToForecastHorizon(rawGfs, Number(workloadData.projectLengthYears))
    : rawGfs;

  const base: VmAgentInputs = {
    productVersion: 0,
    calculatorMode: 0,
    hyperVisor: 0,
    backupType: 0,
    copiesEnabled: false,

    sourceTB: Number(workloadData.sourceSizeTB),
    changeRate: Number(workloadData.dailyChangeRatePercent),
    reduction: Number(workloadData.dataReductionPercent),
    growthRatePercent: Number(workloadData.yearlyGrowthPercent),
    growthFactor: Number(workloadData.yearlyGrowthPercent),
    growthRateScopeYears: Number(workloadData.projectLengthYears),
    projectLength: Number(workloadData.projectLengthYears),
    days: Number(workloadData.shortTermRetentionDays),
    weeklies: gfs.weeklies,
    monthlies: gfs.monthlies,
    yearlies: gfs.yearlies,

    largeBlock: false,
    backupWindowHours: BACKUP_WINDOW_HOURS,
    showPoints: true,

    moveCapacityTierEnabled: false,
    copyCapacityTierEnabled: false,
    capacityTierDays: 0,
    immutableCap: false,
    immutableCapDays: 0,

    archiveTierEnabled: false,
    archiveTierDays: 0,
    archiveTierStandalone: false,

    blockGenerationDays: 0,
  };

  if (repositoryConfig.targetRepository !== "sobr") {
    // Direct-to-Vault, no SOBR: targetRepository is always a Vault type,
    // which never supports Fast Clone.
    return {
      ...base,
      objectStorage: true,
      storageType: "object",
      immutablePerf: true,
      immutablePerfDays: Number(repositoryConfig.targetRepositoryImmutableDays),
      blockGenerationDays:
        BLOCK_GENERATION_DAYS[repositoryConfig.targetRepository] ?? 0,
      blockCloning: false,
    };
  }

  const { sobr } = repositoryConfig;
  const { capacityTier, archiveTier } = sobr;
  const performanceIsObjectStorage =
    REPO_TYPE_CATEGORY[sobr.performanceType] !== "block-file";
  const performanceImmutable = repoTypeRequiresImmutability(
    sobr.performanceType,
  );

  const result: VmAgentInputs = {
    ...base,
    objectStorage: performanceIsObjectStorage,
    storageType: performanceIsObjectStorage ? "object" : null,
    immutablePerf: performanceImmutable,
    immutablePerfDays: performanceImmutable
      ? Number(sobr.performanceImmutableDays)
      : 0,
    blockCloning: repoTypeSupportsBlockCloning(sobr.performanceType),
  };

  if (capacityTier.enabled) {
    result.copyCapacityTierEnabled = capacityTier.copyPolicy;
    result.moveCapacityTierEnabled = capacityTier.movePolicy;
    result.capacityTierDays = Number(capacityTier.moveDays);
    result.immutableCap = true;
    result.immutableCapDays = Number(capacityTier.immutableDays);
  }

  if (archiveTier.enabled) {
    result.archiveTierEnabled = true;
    result.archiveTierDays = Number(archiveTier.moveDays);
    result.archiveTierStandalone = archiveTier.standaloneFullBackups;
  }

  if (capacityTier.enabled) {
    result.blockGenerationDays = BLOCK_GENERATION_DAYS[capacityTier.type] ?? 0;
  } else if (performanceImmutable) {
    result.blockGenerationDays =
      BLOCK_GENERATION_DAYS[sobr.performanceType] ?? 0;
  }

  return result;
}
