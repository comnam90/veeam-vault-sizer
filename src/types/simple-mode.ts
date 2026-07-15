import type { CVmAgentReturnObject } from "./vault-sizer-api";

export interface WorkloadDataValues {
  sourceSizeTB: string;
  dailyChangeRatePercent: string;
  dataReductionPercent: string;
  yearlyGrowthPercent: string;
  shortTermRetentionDays: string;
  gfsWeekly: string;
  gfsMonthly: string;
  gfsYearly: string;
  projectLengthYears: string;
  capGfsToForecastHorizon: boolean;
}

export type WorkloadDataErrors = Partial<
  Record<keyof WorkloadDataValues, string>
>;

export const DEFAULT_WORKLOAD_DATA_VALUES: WorkloadDataValues = {
  sourceSizeTB: "10",
  dailyChangeRatePercent: "3",
  dataReductionPercent: "50",
  yearlyGrowthPercent: "10",
  shortTermRetentionDays: "30",
  gfsWeekly: "4",
  gfsMonthly: "12",
  gfsYearly: "3",
  projectLengthYears: "1",
  capGfsToForecastHorizon: true,
};

// Weekly/Monthly/Yearly GFS period lengths, in days — shared by the vault
// residency chain-completion math (vault-retention.ts) and the Forecast
// Horizon GFS capping (cap-gfs-to-forecast-horizon.ts) so both agree on
// what a GFS point "costs" in days.
export const GFS_PERIOD_DAYS = {
  weekly: 7,
  monthly: 30,
  yearly: 365,
} as const;

export type RepoType =
  | "vault-azure"
  | "vault-aws"
  | "refs-xfs"
  | "hardened-repository"
  | "nas"
  | "dedup-appliance"
  | "aws-s3"
  | "azure-blob"
  | "s3-compatible"
  | "google-cloud";

export type RepoCategory = "vault" | "block-file" | "object-storage";

export const REPO_TYPE_CATEGORY: Record<RepoType, RepoCategory> = {
  "vault-azure": "vault",
  "vault-aws": "vault",
  "refs-xfs": "block-file",
  "hardened-repository": "block-file",
  nas: "block-file",
  "dedup-appliance": "block-file",
  "aws-s3": "object-storage",
  "azure-blob": "object-storage",
  "s3-compatible": "object-storage",
  "google-cloud": "object-storage",
};

export const REPO_TYPE_LABEL: Record<RepoType, string> = {
  "vault-azure": "Vault Azure",
  "vault-aws": "Vault AWS",
  "refs-xfs": "Windows / Linux (ReFS / XFS)",
  "hardened-repository": "Hardened Repository",
  nas: "NAS (SMB / NFS)",
  "dedup-appliance": "Dedup Appliance",
  "aws-s3": "AWS S3",
  "azure-blob": "Azure Blob",
  "s3-compatible": "S3 Compatible",
  "google-cloud": "Google Cloud",
};

export const REPO_CATEGORY_LABEL: Record<RepoCategory, string> = {
  vault: "Vault",
  "block-file": "Block / File",
  "object-storage": "Object Storage",
};

// Vault types, Hardened Repository, and every object-storage type support
// immutability. Plain ReFS/XFS, NAS, and Dedup Appliance don't.
export const REPO_TYPES_REQUIRING_IMMUTABILITY = new Set<RepoType>([
  "vault-azure",
  "vault-aws",
  "hardened-repository",
  "aws-s3",
  "azure-blob",
  "s3-compatible",
  "google-cloud",
]);

export function repoTypeRequiresImmutability(type: RepoType): boolean {
  return REPO_TYPES_REQUIRING_IMMUTABILITY.has(type);
}

// VBR's Fast Clone (block cloning) is a ReFS/XFS local-filesystem feature.
// Hardened Repository is XFS-backed, so it qualifies alongside plain
// Windows/Linux ReFS/XFS. NAS, Dedup Appliance, Vault, and object-storage
// types don't run on a reflink-capable local filesystem, so they don't.
export const REPO_TYPES_SUPPORTING_BLOCK_CLONING = new Set<RepoType>([
  "refs-xfs",
  "hardened-repository",
]);

export function repoTypeSupportsBlockCloning(type: RepoType): boolean {
  return REPO_TYPES_SUPPORTING_BLOCK_CLONING.has(type);
}

// Google Cloud is the only repo type VBR disallows from feeding Archive Tier
// — whether it's the Performance Tier type (no Capacity Tier in between) or
// the Capacity Tier type itself. VBR draws no distinction between those two
// paths; this set applies to whichever type is immediately upstream.
export const REPO_TYPES_CANNOT_FEED_ARCHIVE_TIER = new Set<RepoType>([
  "google-cloud",
]);

export function repoTypeCanFeedArchiveTier(type: RepoType): boolean {
  return !REPO_TYPES_CANNOT_FEED_ARCHIVE_TIER.has(type);
}

// Object-storage-only immutability batching window (Block Generation).
// Block/File types are absent — they enforce immutability natively, no
// Block Generation concept applies. Vault Azure and Vault AWS differ (10 vs
// 30) despite sharing a Vault label — see ADR-0020.
export const BLOCK_GENERATION_DAYS: Partial<Record<RepoType, number>> = {
  "vault-azure": 10,
  "vault-aws": 30,
  "azure-blob": 10,
  "s3-compatible": 10,
  "aws-s3": 30,
  "google-cloud": 30,
};

// Veeam Data Cloud Vault's minimum retention floor (ADR-0013) — a fixed
// constant, independent of a tier's own configurable `immutableDays` field.
export const VAULT_MINIMUM_RETENTION_DAYS = 30;

// Primary and Performance Tier allow the full set: Vault-to-Vault copy jobs
// and Direct-to-Object primary architectures are both real scenarios.
export const ALL_REPO_TYPES: RepoType[] = [
  "vault-azure",
  "vault-aws",
  "refs-xfs",
  "hardened-repository",
  "nas",
  "dedup-appliance",
  "aws-s3",
  "azure-blob",
  "s3-compatible",
  "google-cloud",
];
export const PRIMARY_REPO_TYPES: RepoType[] = ALL_REPO_TYPES;
export const PERFORMANCE_TIER_TYPES: RepoType[] = ALL_REPO_TYPES;
// Capacity Tier is Vault + Object Storage only — Block/File types (including
// Dedup Appliance) aren't valid SOBR Capacity Tier extents in the real product.
export const CAPACITY_TIER_TYPES: RepoType[] = [
  "vault-azure",
  "vault-aws",
  "aws-s3",
  "azure-blob",
  "s3-compatible",
  "google-cloud",
];

export interface RetentionOverride {
  customizeRetention: boolean;
  retentionDays: string;
  gfsWeekly: string;
  gfsMonthly: string;
  gfsYearly: string;
}

export type RetentionOverrideErrors = Partial<
  Record<Exclude<keyof RetentionOverride, "customizeRetention">, string>
>;

export interface PrimaryRepositoryConfig {
  repoType: RepoType;
  immutableDays: string;
  retention: RetentionOverride;
}

export interface CapacityTierConfig {
  enabled: boolean;
  type: RepoType;
  copyPolicy: boolean;
  movePolicy: boolean;
  moveDays: string;
  immutableDays: string;
}

export interface ArchiveTierConfig {
  enabled: boolean;
  moveDays: string;
  immutableDays: string;
  standaloneFullBackups: boolean;
}

export interface SobrConfig {
  performanceType: RepoType;
  performanceImmutableDays: string;
  capacityTier: CapacityTierConfig;
  archiveTier: ArchiveTierConfig;
}

export type TargetRepository = "vault-azure" | "vault-aws" | "sobr";

export interface RepositoryConfigValues {
  backupPath: "direct" | "copy";
  targetRepository: TargetRepository;
  targetRepositoryImmutableDays: string;
  sobr: SobrConfig;
  primary: PrimaryRepositoryConfig;
  secondaryRetention: RetentionOverride;
}

export interface RepositoryConfigErrors {
  targetRepositoryImmutableDays?: string;
  targetRepositoryVaultRetention?: string;
  primary?: {
    immutableDays?: string;
    retention?: RetentionOverrideErrors;
    vaultRetention?: string;
  };
  sobr?: {
    performanceImmutableDays?: string;
    performanceVaultRetention?: string;
    capacityTier?: {
      moveDays?: string;
      immutableDays?: string;
      vaultRetention?: string;
    };
    archiveTier?: {
      moveDays?: string;
      immutableDays?: string;
      archiveFeedUnsupported?: string;
    };
  };
  secondaryRetention?: RetentionOverrideErrors;
}

export const DEFAULT_RETENTION_OVERRIDE: RetentionOverride = {
  customizeRetention: false,
  retentionDays: "30",
  gfsWeekly: "4",
  gfsMonthly: "12",
  gfsYearly: "3",
};

export const DEFAULT_REPOSITORY_CONFIG_VALUES: RepositoryConfigValues = {
  backupPath: "direct",
  targetRepository: "vault-azure",
  targetRepositoryImmutableDays: "30",
  sobr: {
    performanceType: "vault-azure",
    performanceImmutableDays: "30",
    capacityTier: {
      enabled: false,
      type: "vault-azure",
      copyPolicy: true,
      movePolicy: true,
      moveDays: "30",
      immutableDays: "30",
    },
    archiveTier: {
      enabled: false,
      moveDays: "90",
      immutableDays: "365",
      standaloneFullBackups: false,
    },
  },
  primary: {
    repoType: "hardened-repository",
    immutableDays: "30",
    retention: { ...DEFAULT_RETENTION_OVERRIDE },
  },
  secondaryRetention: { ...DEFAULT_RETENTION_OVERRIDE },
};

export interface SizerBffRequest {
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
}

export type SizerBffResponse =
  | { success: true; data: CVmAgentReturnObject }
  | { success: false; error: string };
