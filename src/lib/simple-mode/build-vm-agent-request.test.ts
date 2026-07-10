import { describe, expect, it } from "vitest";
import { buildVmAgentRequest } from "./build-vm-agent-request";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
  type RepositoryConfigValues,
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
    expect(result.yearlies).toBe(3);

    expect(result.productVersion).toBe(0);
    expect(result.calculatorMode).toBe(0);
    expect(result.hyperVisor).toBe(0);
    expect(result.backupType).toBe(0);
    expect(result.copiesEnabled).toBe(false);
    expect(result.blockCloning).toBe(true);
    expect(result.largeBlock).toBe(false);
    expect(result.showPoints).toBe(true);
    expect(result.growthRateScopeYears).toBe(1);
    expect(result.backupWindowHours).toBe(8);
    expect(result.growthFactor).toBeUndefined();
    expect(result.projectLength).toBeUndefined();
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
    expect(result.blockGenerationDays).toBe(10); // vault-aws
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
  });

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
