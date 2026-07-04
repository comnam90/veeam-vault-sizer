export interface GfsPolicy {
  isDefined: boolean;
  weeks: number;
  months: number;
  years: number;
}

export interface RetentionPolicy {
  days: number;
  gfs: GfsPolicy;
  isGfsDefined: boolean;
}

export interface VmAgentRequest {
  sourceTB: number;
  ChangeRate: number;
  Reduction: number;
  backupWindowHours: number;
  GrowthRatePercent: number;
  GrowthRateScopeYears: number;
  blockGenerationDays: number;
  retention: RetentionPolicy;
  days: number;
  Weeklies: number;
  Monthlies: number;
  Yearlies: number;
  Blockcloning: boolean;
  ObjectStorage: boolean;
  moveCapacityTierEnabled: boolean;
  capacityTierDays: number;
  copyCapacityTierEnabled: boolean;
  immutablePerf: boolean;
  immutablePerfDays: number;
  immutableCap: boolean;
  immutableCapDays: number;
  archiveTierEnabled: boolean;
  archiveTierStandalone: boolean;
  archiveTierDays: number;
  isCapTierVDCV: boolean;
  isManaged: boolean;
  machineType: number;
  hyperVisor: number;
  calculatorMode: number;
  productVersion: number;
  instanceCount: number;
}

export interface ComputeVolume {
  diskGB: number;
  diskPurpose: number; // 3=perf, 13=capacity/cache, 4=logs
}

export interface ComputeSpec {
  cores: number;
  ram: number;
  volumes: ComputeVolume[];
}

export interface ComputeNode {
  compute: ComputeSpec;
}

export interface MonthlyTransactions {
  firstMonthTransactions: number;
  secondMonthTransactions: number;
  finalMonthTransactions: number;
}

export interface TransactionCosts {
  performanceTierTransactions?: MonthlyTransactions;
  capacityTierTransactions?: MonthlyTransactions;
  archiveTierTransactions?: MonthlyTransactions;
}

export interface RestorePoint {
  /** Observed: "performanceTier". Capacity/archive tier values may appear in future responses. */
  pointType: string;
  /** 1 = newest daily; higher = older. Yearly retention has been seen as high as 1099. */
  day: number;
  /** TB. The API returns this already-converted; do not divide by 1024. */
  backupCapacity: number;
  isFull: boolean;
  isGFS: boolean;
  isImmutable: boolean;
  /**
   * Space-separated tier tokens. Each token starts with D|W|M|Y followed by an
   * index, e.g. "D5", "W2", "M12", "Y3". Multi-tier points concatenate tokens
   * with a space, e.g. "M12 Y1".
   */
  flags: string;
}

export interface VmAgentResponseData {
  totalStorageTB: number;
  proxyCompute: ComputeNode;
  repoCompute: ComputeNode;
  transactions: TransactionCosts;
  performanceTierImmutabilityTaxGB: number;
  capacityTierImmutabilityTaxGB: number;
  restorePoints?: RestorePoint[];
  /** Other fields the API returns; typed for completeness, not currently consumed. */
  id?: number | string;
  name?: string;
  siteId?: number | string;
  siteName?: string;
  indexResults?: unknown;
  workspaceGB?: number;
}

export interface VmAgentResponse {
  success: boolean;
  data: VmAgentResponseData;
}
