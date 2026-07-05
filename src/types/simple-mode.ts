export interface WorkloadDataValues {
  sourceSizeTB: string;
  dailyChangeRatePercent: string;
  dataReductionPercent: string;
  yearlyGrowthPercent: string;
  shortTermRetentionDays: string;
  gfsWeekly: string;
  gfsMonthly: string;
  gfsYearly: string;
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
};

export type RepoType =
  | "vault-azure"
  | "vault-aws"
  | "refs-xfs"
  | "linux-hardened"
  | "nas"
  | "s3-compatible"
  | "aws-s3"
  | "azure-blob";

export type RepoCategory = "vault" | "block-file" | "object-storage";

export const REPO_TYPE_CATEGORY: Record<RepoType, RepoCategory> = {
  "vault-azure": "vault",
  "vault-aws": "vault",
  "refs-xfs": "block-file",
  "linux-hardened": "block-file",
  nas: "block-file",
  "s3-compatible": "object-storage",
  "aws-s3": "object-storage",
  "azure-blob": "object-storage",
};

export const REPO_TYPE_LABEL: Record<RepoType, string> = {
  "vault-azure": "Vault Azure",
  "vault-aws": "Vault AWS",
  "refs-xfs": "ReFS/XFS",
  "linux-hardened": "Linux Hardened",
  nas: "NAS",
  "s3-compatible": "S3 Compatible",
  "aws-s3": "AWS S3",
  "azure-blob": "Azure Blob",
};

export const REPO_CATEGORY_LABEL: Record<RepoCategory, string> = {
  vault: "Vault",
  "block-file": "Block / File",
  "object-storage": "Object Storage",
};

// Vault types, Linux Hardened, and every object-storage type support immutability.
// Plain ReFS/XFS and NAS don't.
export const REPO_TYPES_REQUIRING_IMMUTABILITY = new Set<RepoType>([
  "vault-azure",
  "vault-aws",
  "linux-hardened",
  "s3-compatible",
  "aws-s3",
  "azure-blob",
]);

export function repoTypeRequiresImmutability(type: RepoType): boolean {
  return REPO_TYPES_REQUIRING_IMMUTABILITY.has(type);
}

// Primary and Performance Tier allow the full set: Vault-to-Vault copy jobs
// and Direct-to-Object primary architectures are both real scenarios.
export const ALL_REPO_TYPES: RepoType[] = [
  "vault-azure",
  "vault-aws",
  "refs-xfs",
  "linux-hardened",
  "nas",
  "s3-compatible",
  "aws-s3",
  "azure-blob",
];
export const PRIMARY_REPO_TYPES: RepoType[] = ALL_REPO_TYPES;
export const PERFORMANCE_TIER_TYPES: RepoType[] = ALL_REPO_TYPES;
// No Block/File, no NAS — the brief never lists NAS as a valid Capacity Tier target.
export const CAPACITY_TIER_TYPES: RepoType[] = [
  "vault-azure",
  "vault-aws",
  "s3-compatible",
  "aws-s3",
  "azure-blob",
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
  primary?: {
    immutableDays?: string;
    retention?: RetentionOverrideErrors;
  };
  sobr?: {
    performanceImmutableDays?: string;
    capacityTier?: { moveDays?: string; immutableDays?: string };
    archiveTier?: { moveDays?: string; immutableDays?: string };
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
    performanceType: "refs-xfs",
    performanceImmutableDays: "30",
    capacityTier: {
      enabled: true,
      type: "s3-compatible",
      copyPolicy: false,
      movePolicy: true,
      moveDays: "14",
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
    repoType: "linux-hardened",
    immutableDays: "30",
    retention: { ...DEFAULT_RETENTION_OVERRIDE },
  },
  secondaryRetention: { ...DEFAULT_RETENTION_OVERRIDE },
};
