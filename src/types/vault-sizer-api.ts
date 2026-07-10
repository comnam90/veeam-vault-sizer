export type ProductVersion = 0 | -1; // 0 = Current (v13), -1 = Previous (v12)
export type CalculatorMode = 0 | 1; // 0 = Simple, 1 = Advanced
export type HyperVisor = 0 | 1 | 2 | 3 | 4; // 0=VMware 1=HyperV 2=Nutanix 3=ProxMox 4=Other
export type BackupOptions = 0 | 1; // 0 = Backup, 1 = Copy

export interface IndexingInputObject {
  enabled: boolean;
  guestSourceFilesMil?: number;
  emIndexRetentionMonths?: number;
  emInstalledOnBackupServer?: boolean;
  retentionPointsSumOfRegularAndGfs?: number; // inert for VmAgent; modeled for completeness
}

export interface VmAgentInputs {
  productVersion?: ProductVersion;
  calculatorMode?: CalculatorMode;
  hyperVisor?: HyperVisor;
  backupType?: BackupOptions;

  sourceTB?: number;
  changeRate?: number;
  reduction?: number;
  days?: number;
  blockCloning?: boolean;
  backupWindowHours?: number;
  largeBlock?: boolean;

  weeklies?: number;
  monthlies?: number;
  yearlies?: number;

  growthRatePercent?: number;
  growthRateScopeYears?: number;
  growthFactor?: number;
  projectLength?: number;

  objectStorage?: boolean;
  storageType?: "object" | null;
  moveCapacityTierEnabled?: boolean;
  copyCapacityTierEnabled?: boolean;
  capacityTierDays?: number;

  immutablePerf?: boolean;
  immutablePerfDays?: number;
  immutableCap?: boolean;
  immutableCapDays?: number;
  blockGenerationDays?: number;

  archiveTierEnabled?: boolean;
  archiveTierDays?: number;
  archiveTierStandalone?: boolean;

  copiesEnabled?: boolean;
  showPoints?: boolean;
  preferPhysicalProxySizing?: boolean;
  enableEntropyScanning?: boolean;
  indexOptions?: IndexingInputObject | null;

  // Label-only fields — never populated by buildVmAgentRequest, modeled for fidelity:
  siteId?: string | null;
  siteName?: string | null;
  id?: string | null;
  name?: string | null;
  workloadName?: string | null;
  workloadId?: string | null;
  repoId?: string | null;
  repoName?: string | null;
  capTierRepoId?: string | null;
  archiveTierRepoId?: string | null;
}

export interface Throughput {
  inboundMBps: number;
  outboundMBps: number;
}

export interface Location {
  siteId?: string | null;
  siteName?: string | null;
}

export interface Volume {
  diskGB: number;
  diskPurpose: number; // DiskType enum — see comment below
  throughputMbps?: Throughput | null;
}

// DiskType values relevant to repoCompute.volumes:
// 3 = RepoObject (Performance Tier), 13 = RepoCapacityTier (Capacity Tier),
// 4 = RepoArchive (Archive Tier). Other codes exist (OS, Cache, etc.) but
// don't appear in this endpoint's practical output.

export interface ComputeRequirement {
  name?: string | null;
  site?: Location | null;
  cores: number;
  ram: number;
  volumes?: Volume[] | null;
  networkThroughput?: Throughput | null;
}

export interface ProxyResult {
  compute?: ComputeRequirement | null;
  siteId?: string | null; // always empty for VmAgent
}

export interface IndexingReturnObject {
  compute?: ComputeRequirement | null;
  vbrServerSpaceGB: number;
  emServerSpaceGB: number;
}

export interface MonthTransactionData {
  firstMonthTransactions: number;
  secondMonthTransactions: number;
  finalMonthTransactions: number;
}

export interface TotalObjectTransactions {
  performanceTierTransactions?: MonthTransactionData | null;
  capacityTierTransactions?: MonthTransactionData | null;
  archiveTierTransactions?: MonthTransactionData | null;
}

export interface CRpsPoints {
  pointType: "performanceTier" | "capacityTier" | "archiveTier";
  day: number;
  backupCapacity: number; // TB — already converted, do not divide by 1024
  isFull: boolean;
  isGFS: boolean;
  isImmutable: boolean;
  flags?: string | null;
}

export interface CVmAgentReturnObject {
  siteId?: string | null;
  siteName?: string | null;
  id?: string | null;
  name?: string | null;
  totalStorageTB: number; // Performance Tier only — not a grand total across tiers
  proxyCompute?: ProxyResult | null;
  repoCompute?: ProxyResult | null;
  indexResults?: IndexingReturnObject | null;
  transactions?: TotalObjectTransactions | null;
  workspaceGB: number;
  performanceTierImmutabilityTaxGB: number;
  capacityTierImmutabilityTaxGB: number;
  restorePoints?: CRpsPoints[] | null;
}

export interface ReturnMessage {
  success: false;
  messages?: string[] | null;
}

export interface ValidationProblemDetails {
  title?: string;
  status?: number;
  errors?: Record<string, string[]>;
}
