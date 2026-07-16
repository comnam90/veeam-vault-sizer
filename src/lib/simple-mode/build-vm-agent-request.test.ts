import { describe, expect, it } from "vitest";
import {
  buildCopyVmAgentRequests,
  buildVmAgentRequest,
} from "./build-vm-agent-request";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";

describe("buildVmAgentRequest", () => {
  it("throws for Backup Copy, naming ADR-0007", () => {
    const copyValues: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
    };

    expect(() =>
      buildVmAgentRequest(DEFAULT_WORKLOAD_DATA_VALUES, copyValues),
    ).toThrow(/ADR-0007/);
  });

  it("maps workload fields and fixed defaults for the Direct-to-Vault path", () => {
    const result = buildVmAgentRequest(
      DEFAULT_WORKLOAD_DATA_VALUES,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(result.sourceTB).toBe(10);
    expect(result.changeRate).toBe(3);
    expect(result.reduction).toBe(50);
    expect(result.growthRatePercent).toBe(10);
    expect(result.days).toBe(30);
    expect(result.weeklies).toBe(4);
    expect(result.monthlies).toBe(12);
    // Capped from 3 to 1: gfsYearly=3 (3yr) exceeds the default 1yr Forecast
    // Horizon, and capGfsToForecastHorizon defaults to true.
    expect(result.yearlies).toBe(1);

    expect(result.productVersion).toBe(0);
    expect(result.calculatorMode).toBe(0);
    expect(result.hyperVisor).toBe(0);
    expect(result.backupType).toBe(0);
    expect(result.copiesEnabled).toBe(false);
    // Default targetRepository is vault-azure — a Vault type, which doesn't
    // support VBR's ReFS/XFS-only Fast Clone feature.
    expect(result.blockCloning).toBe(false);
    expect(result.largeBlock).toBe(false);
    expect(result.showPoints).toBe(true);
    expect(result.growthRateScopeYears).toBe(1); // DEFAULT_WORKLOAD_DATA_VALUES.projectLengthYears = "1"
    expect(result.backupWindowHours).toBe(8);
    expect(result.growthFactor).toBe(10); // same source as growthRatePercent
    expect(result.projectLength).toBe(1); // same source as growthRateScopeYears
  });

  it("derives growthRateScopeYears and projectLength from the same projectLengthYears field", () => {
    const values: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      projectLengthYears: "5",
    };

    const result = buildVmAgentRequest(
      values,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(result.growthRateScopeYears).toBe(5);
    expect(result.projectLength).toBe(5);
  });

  it("derives growthFactor from the same yearlyGrowthPercent field as growthRatePercent", () => {
    const values: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      yearlyGrowthPercent: "25",
    };

    const result = buildVmAgentRequest(
      values,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(result.growthRatePercent).toBe(25);
    expect(result.growthFactor).toBe(25);
  });

  it("caps GFS Monthly and Weekly to the Forecast Horizon by default", () => {
    const values: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      gfsWeekly: "60",
      gfsMonthly: "24",
      gfsYearly: "1",
      projectLengthYears: "1",
    };

    const result = buildVmAgentRequest(
      values,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(result.weeklies).toBe(52); // floor(365/7)
    expect(result.monthlies).toBe(12); // floor(365/30)
    expect(result.yearlies).toBe(1); // unchanged, already within horizon
  });

  it("leaves GFS counts unmodified when capGfsToForecastHorizon is false", () => {
    const values: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      gfsYearly: "7",
      projectLengthYears: "1",
      capGfsToForecastHorizon: false,
    };

    const result = buildVmAgentRequest(
      values,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(result.yearlies).toBe(7);
  });

  it("maps a plain Vault target (no SOBR) as immutable object storage with no capacity/archive tiers", () => {
    const values: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "vault-aws",
      targetRepositoryImmutableDays: "45",
    };

    const result = buildVmAgentRequest(DEFAULT_WORKLOAD_DATA_VALUES, values);

    expect(result.objectStorage).toBe(true);
    expect(result.storageType).toBe("object");
    expect(result.immutablePerf).toBe(true);
    expect(result.immutablePerfDays).toBe(45);
    expect(result.blockGenerationDays).toBe(30); // vault-aws
    expect(result.moveCapacityTierEnabled).toBe(false);
    expect(result.copyCapacityTierEnabled).toBe(false);
    expect(result.archiveTierEnabled).toBe(false);
  });

  it("gates Performance Tier immutability by repo type for SOBR, unlike the plain Vault case", () => {
    const values: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        performanceType: "nas",
        performanceImmutableDays: "30",
      },
    };

    const result = buildVmAgentRequest(DEFAULT_WORKLOAD_DATA_VALUES, values);

    expect(result.objectStorage).toBe(false);
    expect(result.storageType).toBe(null);
    expect(result.immutablePerf).toBe(false);
    expect(result.immutablePerfDays).toBe(0);
    expect(result.blockGenerationDays).toBe(0);
    // NAS is block/file but not ReFS/XFS-backed — no Fast Clone support.
    expect(result.blockCloning).toBe(false);
  });

  it.each([
    ["refs-xfs", true],
    ["hardened-repository", true],
    ["nas", false],
    ["dedup-appliance", false],
    ["vault-azure", false],
    ["aws-s3", false],
  ] as const)(
    "for SOBR Performance Tier type %s, sets blockCloning=%s",
    (performanceType, expected) => {
      const values: RepositoryConfigValues = {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES,
        targetRepository: "sobr",
        sobr: {
          ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
          performanceType,
        },
      };

      const result = buildVmAgentRequest(DEFAULT_WORKLOAD_DATA_VALUES, values);

      expect(result.blockCloning).toBe(expected);
    },
  );

  it("uses Block Generation 0 for an immutable Performance Tier type with no batching window (Hardened Repository)", () => {
    const values: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        performanceType: "hardened-repository",
        performanceImmutableDays: "30",
      },
    };

    const result = buildVmAgentRequest(DEFAULT_WORKLOAD_DATA_VALUES, values);

    expect(result.immutablePerf).toBe(true);
    expect(result.immutablePerfDays).toBe(30);
    expect(result.blockGenerationDays).toBe(0);
  });

  it("resolves Block Generation from Performance Tier's type when Capacity Tier is disabled", () => {
    const values: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
    };

    const result = buildVmAgentRequest(DEFAULT_WORKLOAD_DATA_VALUES, values);

    // Default SOBR performanceType is vault-azure (immutable, Capacity Tier
    // disabled), so the else-if branch's BLOCK_GENERATION_DAYS lookup must
    // hit an actual table entry here, not just fall through to `?? 0`.
    expect(result.blockGenerationDays).toBe(10);
  });

  it("maps an enabled Capacity Tier, and Capacity Tier's type wins Block Generation over Performance Tier's", () => {
    const values: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
      sobr: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
        performanceType: "vault-azure",
        performanceImmutableDays: "30",
        capacityTier: {
          enabled: true,
          type: "aws-s3",
          copyPolicy: false,
          movePolicy: true,
          moveDays: "14",
          immutableDays: "60",
        },
      },
    };

    const result = buildVmAgentRequest(DEFAULT_WORKLOAD_DATA_VALUES, values);

    expect(result.copyCapacityTierEnabled).toBe(false);
    expect(result.moveCapacityTierEnabled).toBe(true);
    expect(result.capacityTierDays).toBe(14);
    expect(result.immutableCap).toBe(true);
    expect(result.immutableCapDays).toBe(60);
    expect(result.blockGenerationDays).toBe(30); // aws-s3, not vault-azure's 10
  });

  it("maps a full three-tier SOBR, and never emits Archive Tier's own immutableDays (no wire field for it)", () => {
    const values: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      targetRepository: "sobr",
      sobr: {
        performanceType: "vault-azure",
        performanceImmutableDays: "30",
        capacityTier: {
          enabled: true,
          type: "s3-compatible",
          copyPolicy: true,
          movePolicy: false,
          moveDays: "30",
          immutableDays: "30",
        },
        archiveTier: {
          enabled: true,
          moveDays: "90",
          immutableDays: "365",
          standaloneFullBackups: true,
        },
      },
    };

    const result = buildVmAgentRequest(DEFAULT_WORKLOAD_DATA_VALUES, values);

    expect(result.archiveTierEnabled).toBe(true);
    expect(result.archiveTierDays).toBe(90);
    expect(result.archiveTierStandalone).toBe(true);
    // Capacity Tier's type (s3-compatible = 10) still governs Block Generation,
    // Archive Tier plays no part in it:
    expect(result.blockGenerationDays).toBe(10);
    expect(Object.keys(result)).not.toContain("immutableArchive");
    expect(Object.keys(result)).not.toContain("immutableArchiveDays");
  });
});

describe("buildCopyVmAgentRequests", () => {
  const copyBase: RepositoryConfigValues = {
    ...DEFAULT_REPOSITORY_CONFIG_VALUES,
    backupPath: "copy",
  };

  it("sizes a block/file Primary (Hardened Repository) as non-object storage with Fast Clone", () => {
    const { primary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      copyBase,
    );

    expect(primary.objectStorage).toBe(false);
    expect(primary.storageType).toBe(null);
    expect(primary.immutablePerf).toBe(true); // Hardened Repository requires immutability
    expect(primary.immutablePerfDays).toBe(30); // DEFAULT primary.immutableDays
    expect(primary.blockCloning).toBe(true); // XFS-backed
    expect(primary.blockGenerationDays).toBe(0); // no object batching window
    expect(primary.days).toBe(30); // DEFAULT shortTermRetentionDays
  });

  it("sizes a Vault Primary as immutable object storage with a block-generation window", () => {
    const values: RepositoryConfigValues = {
      ...copyBase,
      primary: {
        ...copyBase.primary,
        repoType: "vault-azure",
        immutableDays: "40",
      },
    };

    const { primary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      values,
    );

    expect(primary.objectStorage).toBe(true);
    expect(primary.storageType).toBe("object");
    expect(primary.immutablePerf).toBe(true);
    expect(primary.immutablePerfDays).toBe(40);
    expect(primary.blockGenerationDays).toBe(10); // vault-azure
    expect(primary.blockCloning).toBe(false);
  });

  it("sizes the Secondary Vault target as immutable object storage, like the direct path", () => {
    const { secondary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      copyBase,
    );

    // DEFAULT targetRepository is vault-azure, targetRepositoryImmutableDays "30".
    expect(secondary.objectStorage).toBe(true);
    expect(secondary.immutablePerf).toBe(true);
    expect(secondary.immutablePerfDays).toBe(30);
    expect(secondary.blockGenerationDays).toBe(10);
  });

  it("sizes a Secondary SOBR via the same dispatch as the direct SOBR path", () => {
    const values: RepositoryConfigValues = {
      ...copyBase,
      targetRepository: "sobr",
    };

    const { secondary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      values,
    );

    // DEFAULT sobr.performanceType is vault-azure (immutable object), Capacity off.
    expect(secondary.objectStorage).toBe(true);
    expect(secondary.immutablePerf).toBe(true);
    expect(secondary.blockGenerationDays).toBe(10);
    expect(secondary.archiveTierEnabled).toBe(false);
  });

  it("resolves each side's retention independently from its own override", () => {
    const values: RepositoryConfigValues = {
      ...copyBase,
      primary: {
        ...copyBase.primary,
        retention: {
          customizeRetention: true,
          retentionDays: "45",
          gfsWeekly: "0",
          gfsMonthly: "0",
          gfsYearly: "0",
        },
      },
      secondaryRetention: {
        customizeRetention: true,
        retentionDays: "60",
        gfsWeekly: "0",
        gfsMonthly: "0",
        gfsYearly: "0",
      },
    };

    const { primary, secondary } = buildCopyVmAgentRequests(
      DEFAULT_WORKLOAD_DATA_VALUES,
      values,
    );

    expect(primary.days).toBe(45);
    expect(secondary.days).toBe(60);
  });

  it("caps each side's GFS to the Forecast Horizon independently", () => {
    const workload: WorkloadDataValues = {
      ...DEFAULT_WORKLOAD_DATA_VALUES,
      gfsYearly: "5",
      projectLengthYears: "1",
      capGfsToForecastHorizon: true,
    };

    const { primary, secondary } = buildCopyVmAgentRequests(workload, copyBase);

    // Both sides default to workloadData GFS; 5 yearly points capped to 1yr horizon.
    expect(primary.yearlies).toBe(1);
    expect(secondary.yearlies).toBe(1);
  });
});
