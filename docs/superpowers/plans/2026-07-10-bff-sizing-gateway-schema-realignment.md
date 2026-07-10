# BFF Sizing Gateway & Schema Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the calculator API's request/response types to match the official Swagger schema, and wire Simple Mode's Direct-to-Vault path (including full SOBR tiering) through the `functions/api/vault-sizer.ts` gateway for the first time.

**Architecture:** A pure mapping function (`buildVmAgentRequest`) turns Simple Mode's UI state into a correctly-typed `VmAgentInputs`. The Cloudflare Pages Function calls that mapper, forwards the result to Veeam's calculator API, and normalizes both documented 400 error shapes into one clean string before the client ever sees them. The client stays thin: it sends UI state and gets back typed data or a single error message. Local dev runs Wrangler in front of Vite so the Function executes identically in dev and production.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Vite, Vitest, Wrangler.

**Design doc:** `docs/superpowers/specs/2026-07-10-bff-sizing-gateway-schema-realignment-design.md`

---

## Task 1: Bring `functions/` under TypeScript's type-checking

`functions/api/vault-sizer.ts` is about to import from `src/` for the first time and gain real logic worth type-checking. Right now `tsconfig.app.json`'s `include` is `["src"]` only — `functions/` is checked by nothing. Widening it is the smallest fix, and keeps `npx tsc --noEmit -p tsconfig.app.json` as the one command that covers the whole project, matching the design doc's verification list.

**Files:**

- Modify: `tsconfig.app.json`

- [ ] **Step 1: Widen the `include` array**

In `tsconfig.app.json`, change:

```json
  "include": ["src"]
```

to:

```json
  "include": ["src", "functions"]
```

- [ ] **Step 2: Verify it still passes**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors (the existing `functions/api/vault-sizer.ts` passthrough has no type issues).

- [ ] **Step 3: Commit**

```bash
git add tsconfig.app.json
git commit -m "chore: type-check functions/ alongside src/"
```

---

## Task 2: Overhaul `src/types/vault-sizer-api.ts` to match the Swagger schema

Replaces every type in the file. Renamed to match the official schema names (`VmAgentInputs`, `CVmAgentReturnObject`, `CRpsPoints`, ...) per the design doc's Section 1. No test file — this file has never had one (type declarations aren't runtime-testable); correctness is verified by `tsc` and by the consumers written in later tasks.

**Files:**

- Modify: `src/types/vault-sizer-api.ts` (full rewrite)

- [ ] **Step 1: Replace the entire file contents**

```ts
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
```

- [ ] **Step 2: Confirm the project now fails to compile (expected — old consumers still reference removed names)**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: FAIL — errors in `src/lib/api/vault-sizer-client.ts` and `src/lib/api/vault-sizer-client.test.ts` about missing `VmAgentRequest`/`VmAgentResponse`. This is expected; Task 3 fixes it. Do not attempt to fix those files as part of this task.

- [ ] **Step 3: Commit**

```bash
git add src/types/vault-sizer-api.ts
git commit -m "refactor: realign vault-sizer-api types with the official Swagger schema"
```

---

## Task 3: Add `SizerBffRequest`/`SizerBffResponse` to `src/types/simple-mode.ts`

The envelope types for the client↔gateway boundary. Added now so Task 4's client rewrite has them available.

**Files:**

- Modify: `src/types/simple-mode.ts`

- [ ] **Step 1: Add an import at the top of the file**

At the very top of `src/types/simple-mode.ts` (before the existing `export interface WorkloadDataValues` block), add:

```ts
import type { CVmAgentReturnObject } from "./vault-sizer-api";
```

- [ ] **Step 2: Add the envelope types at the end of the file**

Append to `src/types/simple-mode.ts`:

```ts
export interface SizerBffRequest {
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
}

export type SizerBffResponse =
  | { success: true; data: CVmAgentReturnObject }
  | { success: false; error: string };
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: still FAIL, same two pre-existing errors from Task 2 (unrelated to this change) — no _new_ errors introduced by this file.

- [ ] **Step 4: Commit**

```bash
git add src/types/simple-mode.ts
git commit -m "feat: add SizerBffRequest/SizerBffResponse envelope types"
```

---

## Task 4: Rewrite the client — `src/lib/api/vault-sizer-client.ts`

Fixes the compile breakage from Task 2 and makes the client thin: it sends UI state, unwraps `SizerBffResponse`, and throws a plain `Error` on failure with zero knowledge of the two upstream 400 shapes.

**Files:**

- Modify: `src/lib/api/vault-sizer-client.ts`
- Test: `src/lib/api/vault-sizer-client.test.ts`

- [ ] **Step 1: Write the failing tests (rewrite the whole test file)**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callVaultSizerApi } from "./vault-sizer-client";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const mockData: CVmAgentReturnObject = {
  totalStorageTB: 18.4,
  workspaceGB: 0,
  performanceTierImmutabilityTaxGB: 0,
  capacityTierImmutabilityTaxGB: 0,
};

describe("callVaultSizerApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs workloadData and repositoryConfig to /api/vault-sizer and returns the unwrapped data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: mockData }), {
        status: 200,
      }),
    );

    const result = await callVaultSizerApi(
      DEFAULT_WORKLOAD_DATA_VALUES,
      DEFAULT_REPOSITORY_CONFIG_VALUES,
    );

    expect(fetch).toHaveBeenCalledWith("/api/vault-sizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    });
    expect(result).toEqual(mockData);
  });

  it("throws the gateway's error message when success is false", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: "sourceTB must be between 0 and 1,024,000",
        }),
        { status: 400 },
      ),
    );

    await expect(
      callVaultSizerApi(
        DEFAULT_WORKLOAD_DATA_VALUES,
        DEFAULT_REPOSITORY_CONFIG_VALUES,
      ),
    ).rejects.toThrow("sourceTB must be between 0 and 1,024,000");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/api/vault-sizer-client.test.ts`
Expected: FAIL — `callVaultSizerApi` still has the old two-argument-free signature and old response shape; also a compile error since `VmAgentRequest`/`VmAgentResponse` no longer exist.

- [ ] **Step 3: Replace the implementation**

```ts
import type {
  RepositoryConfigValues,
  SizerBffResponse,
  WorkloadDataValues,
} from "@/types/simple-mode";
import type { CVmAgentReturnObject } from "@/types/vault-sizer-api";

const API_URL = "/api/vault-sizer";

export async function callVaultSizerApi(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): Promise<CVmAgentReturnObject> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workloadData, repositoryConfig }),
  });

  const body: SizerBffResponse = await response.json();

  if (!body.success) {
    throw new Error(body.error);
  }

  return body.data;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/api/vault-sizer-client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Confirm the project compiles again**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS — no errors anywhere (this closes out the breakage from Task 2).

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/vault-sizer-client.ts src/lib/api/vault-sizer-client.test.ts
git commit -m "refactor: make vault-sizer-client thin — send UI state, unwrap SizerBffResponse"
```

---

## Task 5: `buildVmAgentRequest` — `src/lib/simple-mode/build-vm-agent-request.ts`

The pure mapping function at the center of this task. Covers the Direct-to-Vault path only (including the full SOBR three-tier matrix); throws for Backup Copy. Written TDD: the test file below encodes every mapping rule from the design doc's Section 3, written before the implementation.

**Files:**

- Create: `src/lib/simple-mode/build-vm-agent-request.ts`
- Test: `src/lib/simple-mode/build-vm-agent-request.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/simple-mode/build-vm-agent-request.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
import {
  BLOCK_GENERATION_DAYS,
  REPO_TYPE_CATEGORY,
  repoTypeRequiresImmutability,
  type RepositoryConfigValues,
  type WorkloadDataValues,
} from "@/types/simple-mode";
import type { VmAgentInputs } from "@/types/vault-sizer-api";

// Fixed sizing assumptions with no corresponding UI field yet.
const GROWTH_RATE_SCOPE_YEARS = 1;
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
    growthRateScopeYears: GROWTH_RATE_SCOPE_YEARS,
    days: Number(workloadData.shortTermRetentionDays),
    weeklies: Number(workloadData.gfsWeekly),
    monthlies: Number(workloadData.gfsMonthly),
    yearlies: Number(workloadData.gfsYearly),

    blockCloning: true,
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
    // Direct-to-Vault, no SOBR: targetRepository is always a Vault type.
    return {
      ...base,
      objectStorage: true,
      storageType: "object",
      immutablePerf: true,
      immutablePerfDays: Number(repositoryConfig.targetRepositoryImmutableDays),
      blockGenerationDays:
        BLOCK_GENERATION_DAYS[repositoryConfig.targetRepository] ?? 0,
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/simple-mode/build-vm-agent-request.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Full type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/simple-mode/build-vm-agent-request.ts src/lib/simple-mode/build-vm-agent-request.test.ts
git commit -m "feat: add buildVmAgentRequest — Direct-to-Vault UI state to VmAgentInputs mapping"
```

---

## Task 6: Rewrite the gateway — `functions/api/vault-sizer.ts`

The orchestrator: parses `SizerBffRequest`, calls `buildVmAgentRequest`, forwards to the real upstream API, and normalizes both documented 400 shapes into one error string. This function currently has zero tests — it gets its first ones here.

**Files:**

- Modify: `functions/api/vault-sizer.ts`
- Test: `functions/api/vault-sizer.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./vault-sizer";
import {
  DEFAULT_REPOSITORY_CONFIG_VALUES,
  DEFAULT_WORKLOAD_DATA_VALUES,
} from "../../src/types/simple-mode";
import type { RepositoryConfigValues } from "../../src/types/simple-mode";

function postRequest(body: unknown): { request: Request } {
  return {
    request: new Request("http://localhost/api/vault-sizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
}

describe("onRequestPost", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a VmAgentInputs request, forwards it upstream, and returns the unwrapped data", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { totalStorageTB: 18.4 } }),
        { status: 200 },
      ),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { totalStorageTB: 18.4 } });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://calculator.veeam.com/vse/api/VmAgent");
    const sentBody = JSON.parse((init as RequestInit).body as string);
    expect(sentBody.sourceTB).toBe(10);
    expect(sentBody.objectStorage).toBe(true);
  });

  it("normalizes a ReturnMessage 400 body into a single error string", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          messages: ["sourceTB must be between 0 and 1,024,000"],
        }),
        { status: 400 },
      ),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: "sourceTB must be between 0 and 1,024,000",
    });
  });

  it("normalizes a ValidationProblemDetails 400 body into a single error string", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "One or more validation errors occurred.",
          status: 400,
          errors: {
            sourceTB: ["The field sourceTB must be between 0 and 1024000."],
          },
        }),
        { status: 400 },
      ),
    );

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: "The field sourceTB must be between 0 and 1024000.",
    });
  });

  it("returns 502 when the upstream API is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: DEFAULT_REPOSITORY_CONFIG_VALUES,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      success: false,
      error: "Upstream sizing API unreachable",
    });
  });

  it("rejects Backup Copy requests before calling upstream", async () => {
    const copyConfig: RepositoryConfigValues = {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES,
      backupPath: "copy",
    };

    const response = await onRequestPost(
      postRequest({
        workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
        repositoryConfig: copyConfig,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain("ADR-0007");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid JSON body", async () => {
    const response = await onRequestPost({
      request: new Request("http://localhost/api/vault-sizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ success: false, error: "Invalid JSON body" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run functions/api/vault-sizer.test.ts`
Expected: FAIL — `onRequestPost` still forwards the raw body verbatim instead of transforming/normalizing it.

- [ ] **Step 3: Replace the implementation**

```ts
import { buildVmAgentRequest } from "../../src/lib/simple-mode/build-vm-agent-request";
import type {
  SizerBffRequest,
  SizerBffResponse,
} from "../../src/types/simple-mode";
import type {
  CVmAgentReturnObject,
  ReturnMessage,
  ValidationProblemDetails,
  VmAgentInputs,
} from "../../src/types/vault-sizer-api";

const VAULT_SIZER_API_URL = "https://calculator.veeam.com/vse/api/VmAgent";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body: SizerBffResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function extractErrorMessage(body: unknown): string {
  const returnMessage = body as ReturnMessage | null;
  if (returnMessage?.messages && returnMessage.messages.length > 0) {
    return returnMessage.messages[0];
  }

  const validationProblem = body as ValidationProblemDetails | null;
  if (validationProblem?.errors) {
    return Object.values(validationProblem.errors).flat().join(", ");
  }

  return "Calculation engine rejected the request";
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context: {
  request: Request;
}): Promise<Response> {
  let bffRequest: SizerBffRequest;
  try {
    bffRequest = await context.request.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  let vmAgentInputs: VmAgentInputs;
  try {
    vmAgentInputs = buildVmAgentRequest(
      bffRequest.workloadData,
      bffRequest.repositoryConfig,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return jsonResponse({ success: false, error: message }, 400);
  }

  try {
    const upstream = await fetch(VAULT_SIZER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vmAgentInputs),
    });

    const upstreamBody: unknown = await upstream.json();

    if (upstream.ok) {
      const { data } = upstreamBody as { data: CVmAgentReturnObject };
      return jsonResponse({ success: true, data }, 200);
    }

    return jsonResponse(
      { success: false, error: extractErrorMessage(upstreamBody) },
      upstream.status,
    );
  } catch {
    return jsonResponse(
      { success: false, error: "Upstream sizing API unreachable" },
      502,
    );
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run functions/api/vault-sizer.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/api/vault-sizer.ts functions/api/vault-sizer.test.ts
git commit -m "feat: gateway builds and forwards VmAgentInputs, normalizes both 400 shapes"
```

---

## Task 7: Local dev parity — Wrangler fronting Vite

Closes the gap that motivated the earlier client-side-transform detour: today, `vite.config.ts`'s dev proxy bypasses `functions/api/vault-sizer.ts` entirely, so `npm run dev` never exercised the real gateway. After this task, Wrangler runs the Function for real in dev, with Vite as its proxied subprocess.

**Files:**

- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: Install Wrangler**

```bash
npm install --save-dev wrangler
```

Expected: `wrangler` appears in `package.json`'s `devDependencies` and `package-lock.json` updates. Let npm resolve the version — don't hand-write a version string.

- [ ] **Step 2: Update the dev scripts**

In `package.json`, change:

```json
    "dev": "vite",
```

to:

```json
    "dev": "wrangler pages dev --proxy 5173 --port 8788 --compatibility-date=2026-07-10 -- vite --port 5173 --strictPort",
    "dev:vite": "vite --port 5173 --strictPort",
```

(`dev:vite` is a new sibling script for standalone Vite iteration without Functions — keep the rest of the `scripts` block unchanged.)

- [ ] **Step 3: Remove the now-redundant Vite dev proxy**

In `vite.config.ts`, remove the `server` block entirely:

```ts
  server: {
    proxy: {
      "/api/vault-sizer": {
        target: "https://calculator.veeam.com",
        changeOrigin: true,
        rewrite: () => "/vse/api/VmAgent",
      },
    },
  },
```

Wrangler's `--proxy` now fronts Vite, so this dev-only bypass is no longer needed — `/api/vault-sizer` resolves to the real Function in both dev and production.

- [ ] **Step 4: Smoke-test locally**

Run: `npm run dev`
Expected: Wrangler starts, spawns the Vite subprocess (visible in the combined output), and serves on `http://localhost:8788`. If Wrangler prints a warning about a missing compatibility date, confirm the `--compatibility-date` flag is being read — check `wrangler pages dev --help` for the exact current flag name/behavior if the warning persists, and adjust the script accordingly; do not add a `wrangler.toml` to silence it, per the design doc.

With the dev server running, open `http://localhost:8788` in a browser and confirm the app loads (Simple Mode's Workload Data and Backup Repository Configuration cards render). Then stop the server (Ctrl-C).

- [ ] **Step 5: Full verification suite**

Run each and confirm the expected result:

```bash
npx tsc --noEmit -p tsconfig.app.json   # expect: no errors
npm run lint                             # expect: no errors
npm run test:run                         # expect: all tests pass, including the new ones from Tasks 4-6
npm run build                            # expect: build succeeds
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "chore: run functions/ through Wrangler locally instead of bypassing it"
```

---

## Follow-up work (not this plan)

- Backup Copy mode: two-request fan-out (Primary + Secondary) and result combination, per ADR-0007.
- A Results card to render `CVmAgentReturnObject` in the UI — nothing calls `callVaultSizerApi` from a component yet.
