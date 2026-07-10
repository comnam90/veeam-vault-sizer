# BFF Sizing Gateway & Schema Realignment — Design

**Branch:** `bff-sizing-gateway-schema-realignment`
**Sources:** `docs/research/2026-07-10-vmagent-swagger-api.md` (Swagger audit), PM's Phase 3 Task 1 spec (chat-transcribed, not committed to the repo)

## Purpose

Fix this project's calculator API contract to match the real `/VmAgent` Swagger schema, and wire Simple Mode's Direct-to-Vault path through it for the first time. Today, `src/types/vault-sizer-api.ts` has wrong casing, a fictional nested `retention` block, and four request fields (`isCapTierVDCV`, `isManaged`, `machineType`, `instanceCount`) that don't exist anywhere in the official API. `src/lib/api/vault-sizer-client.ts` has no call site and swallows both documented 400 error shapes into a generic message. Nothing in the UI has ever called the sizing API.

This task fixes the contract, teaches the BFF gateway to build a correct request from Simple Mode's UI state, and fixes local dev so the gateway function actually runs during `npm run dev` instead of being bypassed.

## Scope

**In scope:**

- Full type realignment for `VmAgentInputs` and `CVmAgentReturnObject`, renamed to match the Swagger schema.
- A pure mapping function from Simple Mode's UI state to `VmAgentInputs`, covering the **Direct-to-Vault path only** (`backupPath === "direct"`) — including the full SOBR three-tier matrix, since SOBR is one of `targetRepository`'s three values under the direct path, not part of Backup Copy.
- The BFF gateway (`functions/api/vault-sizer.ts`) calling that mapping function, forwarding the built request upstream, and normalizing both documented 400 error shapes into one clean message.
- A thin client (`vault-sizer-client.ts`) that sends UI state and gets back a typed result or a single error string.
- Local dev tooling so the gateway function runs identically in `npm run dev` and production.

**Explicitly out of scope, deferred to a follow-up task:**

- Backup Copy mode (`backupPath === "copy"`). ADR-0007 already anticipates this needs its own design: Primary and Secondary each need independent sizing, which means two upstream `VmAgentInputs` requests and a combined result — not a detail to bolt onto this task. `buildVmAgentRequest` throws a clear error if called with `backupPath === "copy"`, naming ADR-0007 as the reason.
- Any UI changes. There is no Results card yet; this task ends at "the gateway returns a correctly-typed result," not at displaying it.

## Why this diverges from the PM's draft in places

The PM spec's `transformPayload` draft doesn't match the current codebase or the current Swagger findings in several ways that would have shipped broken behavior:

- **Field names.** The UI's actual `WorkloadDataValues` fields are `sourceSizeTB`/`dailyChangeRatePercent`/`dataReductionPercent`/`yearlyGrowthPercent`, not `sourceDataSize`/`dailyChangeRate`/`dataReduction`/`yearlyGrowth`.
- **Discriminants.** `RepositoryConfigValues.targetRepository` (not `targetRepositoryType`) takes the values `"vault-azure" | "vault-aws" | "sobr"` (not `"sobr-builder"`). `backupPath` takes `"direct" | "copy"` (not `"backup-copy"`).
- **A missing required-in-practice field.** `backupWindowHours` is a real, already-camelCase Swagger field (`0.1`–`336`) that the PM's rewritten `VmAgentInputs` dropped entirely. Omitting it risks a `[Range]` validation 400, since the property still deserializes to `0` when absent.
- **A route that already exists.** The gateway function is `functions/api/vault-sizer.ts` at `/api/vault-sizer`, already wired into the client and (previously) `vite.config.ts`'s dev proxy. The PM's `functions/api/size.ts` at `/api/size` would have orphaned it.
- **Deferred scope treated as in-scope.** The PM's draft builds one request regardless of `backupPath`, silently ignoring ADR-0007's explicit call-out that Backup Copy needs two.

None of this reflects the underlying idea being wrong — schema realignment plus a working Direct-to-Vault gateway is exactly the right-sized next step. It's the specific field names, route, and scope boundary that needed correcting against the real codebase, per the brief given at the start of this task.

## Architecture

```
Browser (WorkloadDataValues, RepositoryConfigValues)
        │  POST /api/vault-sizer  { workloadData, repositoryConfig }
        ▼
functions/api/vault-sizer.ts  (Cloudflare Pages Function)
        │  buildVmAgentRequest()  →  VmAgentInputs
        ▼
POST https://calculator.veeam.com/vse/api/VmAgent
        │
        ▼
{ success, data: CVmAgentReturnObject }  or  400 (ReturnMessage | ValidationProblemDetails)
        │  normalized by the Function into SizerBffResponse
        ▼
Browser: { success: true, data } or { success: false, error: string }
```

The mapping logic (`buildVmAgentRequest`) is a pure function that the Function imports and calls — not hand-inlined — so it stays unit-testable with plain Vitest and has no dependency on the Workers runtime.

## 1. Types — `src/types/vault-sizer-api.ts` (full overhaul)

Renamed to match the Swagger schema exactly, so future audits against the spec need no translation step.

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
  diskPurpose: number; // DiskType enum — see table below
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

## 2. Envelope types — `src/types/simple-mode.ts` (add)

```ts
export interface SizerBffRequest {
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
}

export type SizerBffResponse =
  | { success: true; data: import("./vault-sizer-api").CVmAgentReturnObject }
  | { success: false; error: string };
```

## 3. Mapping — `src/lib/simple-mode/build-vm-agent-request.ts` (new)

```ts
export function buildVmAgentRequest(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): VmAgentInputs;
```

Throws immediately if `repositoryConfig.backupPath === "copy"`, with a message pointing at ADR-0007. Otherwise:

**Workload fields** — direct copies with `Number(...)`: `sourceTB` ← `sourceSizeTB`, `changeRate` ← `dailyChangeRatePercent`, `reduction` ← `dataReductionPercent`, `growthRatePercent` ← `yearlyGrowthPercent`, `days` ← `shortTermRetentionDays`, `weeklies`/`monthlies`/`yearlies` ← `gfsWeekly`/`gfsMonthly`/`gfsYearly`.

**Fixed defaults** (no UI field exists for these): `productVersion: 0`, `calculatorMode: 0`, `hyperVisor: 0`, `backupType: 0`, `blockCloning: true`, `largeBlock: false`, `showPoints: true`, `copiesEnabled: false`, `growthRateScopeYears: 1`, `backupWindowHours: 8`. `growthFactor` and `projectLength` are left unset so the API's own default-substitution (falling back to `growthRatePercent`/`growthRateScopeYears`) applies.

**Repository mapping** depends on `targetRepository`:

- **`"vault-azure"` / `"vault-aws"`** (no SOBR): `objectStorage`/`storageType` true/`"object"` (both are always Vault types); `immutablePerf: true`, `immutablePerfDays` ← `targetRepositoryImmutableDays`; all capacity/archive fields `false`/`0`.
- **`"sobr"`**: performance tier maps from `sobr.performanceType`/`sobr.performanceImmutableDays`; `objectStorage`/`storageType` derived from `REPO_TYPE_CATEGORY[sobr.performanceType] !== "block-file"` (reused, not hand-rolled — true for both `"vault"` and `"object-storage"` categories); `immutablePerf` gated by `repoTypeRequiresImmutability(sobr.performanceType)` (this tier, unlike the plain Vault case above, can be a non-immutable type like NAS or Hardened Repository).
  - **Capacity Tier** (`sobr.capacityTier`, when `enabled`): `copyCapacityTierEnabled`/`moveCapacityTierEnabled` ← `copyPolicy`/`movePolicy` directly (confirmed independent, not mutually exclusive, from `validate-repository-config.ts`); `capacityTierDays` ← `moveDays`; `immutableCap: true` and `immutableCapDays` ← `immutableDays` unconditionally — every type in `CAPACITY_TIER_TYPES` requires immutability, so there's no type gate here (unlike Performance Tier).
  - **Archive Tier** (`sobr.archiveTier`, when `enabled`): `archiveTierEnabled: true`, `archiveTierDays` ← `moveDays`, `archiveTierStandalone` ← `standaloneFullBackups`. `archiveTier.immutableDays` has **no** wire counterpart in `VmAgentInputs` — confirmed absent from the Swagger schema — so it's never mapped; it stays UI-only, feeding the existing vault-retention residency math.
- **`blockGenerationDays`** (one top-level field, but immutability can be active on two tiers with different types): Capacity Tier's type when Capacity Tier is enabled (and therefore immutable), else Performance Tier's type when Performance Tier is immutable, else `0`. Looked up via `BLOCK_GENERATION_DAYS[type] ?? 0` — block/file types aren't in that table at all.

## 4. Gateway — `functions/api/vault-sizer.ts` (rewritten, same route)

`onRequestPost` now:

1. Parses the body as `SizerBffRequest`.
2. Calls `buildVmAgentRequest(workloadData, repositoryConfig)`. A thrown error (invalid JSON, or the Backup Copy guard) returns `{ success: false, error: <message> }` at 400.
3. POSTs the resulting `VmAgentInputs` to `https://calculator.veeam.com/vse/api/VmAgent`.
4. On a 200, returns `{ success: true, data: body.data }`.
5. On a 400, reads the body once and extracts a message from whichever shape came back — `ReturnMessage.messages[0]` or `Object.values(ValidationProblemDetails.errors).flat().join(", ")` — falling back to a generic message if neither matches. Returns `{ success: false, error: <message> }` at 400.
6. On a network failure, returns `{ success: false, error: "Upstream sizing API unreachable" }` at 502, as today.

CORS headers and the `OPTIONS` handler are unchanged.

## 5. Client — `src/lib/api/vault-sizer-client.ts` (rewritten, same route)

```ts
export async function callVaultSizerApi(
  workloadData: WorkloadDataValues,
  repositoryConfig: RepositoryConfigValues,
): Promise<CVmAgentReturnObject> {
  const response = await fetch("/api/vault-sizer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workloadData, repositoryConfig }),
  });
  const body: SizerBffResponse = await response.json();
  if (!body.success) throw new Error(body.error);
  return body.data;
}
```

No knowledge of `ReturnMessage`/`ValidationProblemDetails` — that parsing lives entirely in the Function now.

## 6. Local dev parity — `package.json`, `vite.config.ts`

```jsonc
"scripts": {
  "dev": "wrangler pages dev --proxy 5173 --port 8788 --compatibility-date=2026-07-10 -- vite --port 5173 --strictPort",
  "dev:vite": "vite --port 5173 --strictPort"
  // ...unchanged
}
```

Add `wrangler` to `devDependencies`. Remove `vite.config.ts`'s `server.proxy` entry for `/api/vault-sizer` — Wrangler's `--proxy` replaces it, so `functions/api/vault-sizer.ts` runs identically in dev and production. No `wrangler.toml`/`wrangler.jsonc` is added: this Function only does a plain `fetch()` proxy and binds no Cloudflare resource (KV/D1/R2), so a config file isn't required; `--compatibility-date` is passed inline instead. Developers now browse the app at `localhost:8788`, not `5173`, during `npm run dev`.

Exact Wrangler flag behavior (whether `--compatibility-date` alone silences the startup warning, whether any other flag is needed) gets confirmed against a real `wrangler pages dev --help` and a local smoke test during implementation — this is the directionally-correct, Swagger-and-docs-verified form, not a guess, but CLI flag minutiae are implementation-time detail, not a design blocker.

## Testing & verification

- `npx tsc --noEmit -p tsconfig.app.json` — no leftover PascalCase or nested-`retention` references anywhere in the project.
- `src/lib/simple-mode/build-vm-agent-request.test.ts` (new) — non-SOBR Vault target; SOBR with Performance Tier only; SOBR with Performance + Capacity; full three-tier SOBR; `blockGenerationDays` resolution across tier/immutability combinations; the `backupPath === "copy"` throw.
- `functions/api/vault-sizer.test.ts` (new — this Function currently has no tests at all) — happy path; both 400 shapes normalized to the same `error` string shape; upstream unreachable → 502; Backup Copy request rejected before any upstream call is made.
- `src/lib/api/vault-sizer-client.test.ts` (rewritten) — success case returning unwrapped `data`; failure case throwing `Error(body.error)`.

## Follow-up work (not this task)

- Backup Copy mode: two-request fan-out (Primary + Secondary) and result combination, per ADR-0007. Needs its own design — in particular, how two `CVmAgentReturnObject` results combine into one displayed total.
- A Results card to actually render `CVmAgentReturnObject` in the UI. Nothing calls `callVaultSizerApi` from a component yet; this task only makes it correct to call.
