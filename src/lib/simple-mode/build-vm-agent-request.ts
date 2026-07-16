import {
  BLOCK_GENERATION_DAYS,
  REPO_TYPE_CATEGORY,
  repoTypeRequiresImmutability,
  repoTypeSupportsBlockCloning,
  type RepositoryConfigValues,
  type RepoType,
  type TargetRepository,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { VmAgentInputs } from "@/types/vault-sizer-api";
import { BACKUP_WINDOW_HOURS } from "./backup-windows";
import { capGfsToForecastHorizon } from "./cap-gfs-to-forecast-horizon";
import {
  resolveEffectiveRetention,
  type EffectiveRetention,
} from "./vault-retention";

// Workload-level fields come from workloadData (shared across both pipelines);
// retention days + GFS come from the per-pipeline EffectiveRetention. GFS is
// capped to the Forecast Horizon here, gated by the workload-level toggle.
function buildBaseInputs(
  workloadData: WorkloadDataValues,
  retention: EffectiveRetention,
): VmAgentInputs {
  const rawGfs = {
    weeklies: retention.gfsWeekly,
    monthlies: retention.gfsMonthly,
    yearlies: retention.gfsYearly,
  };
  const gfs = workloadData.capGfsToForecastHorizon
    ? capGfsToForecastHorizon(rawGfs, Number(workloadData.projectLengthYears))
    : rawGfs;

  return {
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
    days: retention.retentionDays,
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
}

// One standalone repository of any RepoType — the direct Vault target and the
// Copy-mode Primary both use this. Block/file types are non-object with Fast
// Clone; vault/object types are immutable object storage with a block-generation
// window.
function buildStandaloneRepoInputs(
  base: VmAgentInputs,
  repoType: RepoType,
  immutableDays: string,
): VmAgentInputs {
  const isObjectStorage = REPO_TYPE_CATEGORY[repoType] !== "block-file";
  const immutable = repoTypeRequiresImmutability(repoType);

  return {
    ...base,
    objectStorage: isObjectStorage,
    storageType: isObjectStorage ? "object" : null,
    immutablePerf: immutable,
    immutablePerfDays: immutable ? Number(immutableDays) : 0,
    blockCloning: repoTypeSupportsBlockCloning(repoType),
    blockGenerationDays: immutable ? (BLOCK_GENERATION_DAYS[repoType] ?? 0) : 0,
  };
}

// A full SOBR: Performance Tier type logic, plus optional Capacity and Archive
// tiers. Capacity Tier's type wins Block Generation over Performance Tier's.
function buildSobrInputs(
  base: VmAgentInputs,
  sobr: RepositoryConfigValues["sobr"],
): VmAgentInputs {
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

// Shared target/SOBR routing — both buildVmAgentRequest's target dispatch and
// buildCopyVmAgentRequests's Secondary allocation use this (D15).
function buildTargetInputs(
  base: VmAgentInputs,
  targetRepository: TargetRepository,
  immutableDays: string,
  sobr: RepositoryConfigValues["sobr"],
): VmAgentInputs {
  return targetRepository !== "sobr"
    ? buildStandaloneRepoInputs(base, targetRepository, immutableDays)
    : buildSobrInputs(base, sobr);
}

// Direct mode only. Backup Copy needs two requests — use
// buildCopyVmAgentRequests (ADR-0007).
export function buildVmAgentRequest(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): VmAgentInputs {
  if (repositoryConfig.backupPath === "copy") {
    throw new Error(
      "buildVmAgentRequest handles Direct mode only; Backup Copy needs two " +
        "requests via buildCopyVmAgentRequests (ADR-0007).",
    );
  }

  const base = buildBaseInputs(
    workloadData,
    resolveEffectiveRetention(workloadData),
  );

  return buildTargetInputs(
    base,
    repositoryConfig.targetRepository,
    repositoryConfig.targetRepositoryImmutableDays,
    repositoryConfig.sobr,
  );
}

// Backup Copy mode: two independent VmAgentInputs (ADR-0007). Primary is a
// standalone repo of any type with its own retention; Secondary uses the same
// target/SOBR dispatch as direct, with its own retention.
export function buildCopyVmAgentRequests(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): { primary: VmAgentInputs; secondary: VmAgentInputs } {
  const primaryConfig = repositoryConfig.primary;
  const primaryBase = buildBaseInputs(
    workloadData,
    resolveEffectiveRetention(workloadData, primaryConfig.retention),
  );
  const primary = buildStandaloneRepoInputs(
    primaryBase,
    primaryConfig.repoType,
    primaryConfig.immutableDays,
  );

  const secondaryBase = buildBaseInputs(
    workloadData,
    resolveEffectiveRetention(
      workloadData,
      repositoryConfig.secondaryRetention,
    ),
  );
  const secondary = buildTargetInputs(
    secondaryBase,
    repositoryConfig.targetRepository,
    repositoryConfig.targetRepositoryImmutableDays,
    repositoryConfig.sobr,
  );

  return { primary, secondary };
}
