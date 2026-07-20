# SOBR Archive Tier detect-and-resubmit workaround — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route around two confirmed Veeam calculator API defects (Archive Tier enabled without Capacity Tier) by substituting a phantom pass-through Capacity Tier request, detecting and correcting a bad threshold from the response's own data, and surfacing a clear notice to the user — without ever computing sizing math locally (ADR-0001, ADR-0022).

**Architecture:** One new pure module (`resolve-archive-tier-workaround.ts`) owns shape-selection and response-inspection. `functions/api/vault-sizer.ts` gains one orchestration function (`resolveInputs`) that both `handleDirect` and `handleCopy` call instead of a bare upstream fetch. A new `archiveTierNotice` field threads through the response contract to the client and renders in `ProjectedSizingCard`.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, Vitest, React, `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-07-20-sobr-archive-tier-workaround-design.md`
**ADR:** `docs/adr/0022-detect-and-resubmit-does-not-violate-adr-0001.md`

---

## File Structure

| File                                                          | Responsibility                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/simple-mode/resolve-archive-tier-workaround.ts`      | New. Pure functions: detect the buggy shape, build the phantom substitution, detect a leak, compute a corrected threshold, check completeness. No `fetch`, no I/O.                                                     |
| `src/lib/simple-mode/resolve-archive-tier-workaround.test.ts` | New. Unit tests for the five functions above.                                                                                                                                                                          |
| `src/types/simple-mode.ts`                                    | Modify. Add `ArchiveTierNotice`; widen `SizerBffResponse`'s `direct`/`copy` arms and `SizerResult`'s two arms with an optional `archiveTierNotice`.                                                                    |
| `functions/api/vault-sizer.ts`                                | Modify. Add `fetchAndParse` (wraps one upstream call + parse + ok/error classification) and `resolveInputs` (the orchestration); `handleDirect`/`handleCopy` call `resolveInputs` instead of `upstreamFetch` directly. |
| `functions/api/vault-sizer.test.ts`                           | Modify. New scenarios for the triggering paths; existing tests must keep passing unchanged (regression).                                                                                                               |
| `src/lib/api/vault-sizer-client.ts`                           | Modify. Thread `archiveTierNotice` through both `SizerResult` arms it constructs.                                                                                                                                      |
| `src/lib/api/vault-sizer-client.test.ts`                      | Modify. One new assertion that `archiveTierNotice` passes through.                                                                                                                                                     |
| `src/components/simple-mode/projected-sizing-card.tsx`        | Modify. Render the D5 "adjusted" note and D6 "failed" disclaimer from `data.archiveTierNotice`.                                                                                                                        |
| `src/components/simple-mode/projected-sizing-card.test.tsx`   | Modify. New tests for both notice states and the no-notice case.                                                                                                                                                       |
| `src/components/simple-mode/storage-breakdown.test.tsx`       | Modify. One new regression test proving `transactions`/`restorePoints` never influence rendered tier rows.                                                                                                             |

**Deviation from the spec's file-by-file table, noted explicitly:** the spec listed the D5 "adjusted" note as living in the "Archive Tier UI component (Repository Configuration card)" — i.e. `sobr-builder.tsx`. Having now read that component, it receives only `SobrConfig`/`errors`/`onChange` — no sizing result at all, and neither it nor its parent (`backup-repository-card.tsx`, `simple-mode-page.tsx`) has any connection to `useCalculatedSizing`, which is called entirely inside `ProjectedSizingCard`. Threading `archiveTierNotice` back to `sobr-builder.tsx` would mean lifting `useCalculatedSizing` up to `simple-mode-page.tsx` — a disproportionate architectural change for a notice. Both D5 and D6 render in `ProjectedSizingCard` instead, which already has `data` (and therefore `archiveTierNotice`) with no new prop-threading needed. This doesn't change any of D1–D9 — only the UI table's illustrative "where," which was never one of the numbered decisions.

`src/hooks/use-calculated-sizing.ts` needs **no code change** — it already stores whatever `callVaultSizerApi` returns as opaque `SizerResult` state; widening that type (above) flows through with zero logic changes there.

---

## Task 1: Pure module — shape-selection and response-inspection

**Files:**

- Create: `src/lib/simple-mode/resolve-archive-tier-workaround.ts`
- Test: `src/lib/simple-mode/resolve-archive-tier-workaround.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildPhantomCapacityInputs,
  computeCorrectedThreshold,
  detectsArchiveTierWithoutCapacity,
  hasLeakedNonGfsPoints,
  isArchiveComplete,
} from "./resolve-archive-tier-workaround";
import type {
  CVmAgentReturnObject,
  VmAgentInputs,
} from "@/types/vault-sizer-api";

const baseInputs: VmAgentInputs = {
  sourceTB: 10,
  changeRate: 3,
  reduction: 50,
  archiveTierEnabled: true,
  archiveTierDays: 90,
  immutablePerfDays: 30,
};

function makeResponse(
  volumes: { diskGB: number; diskPurpose: number }[],
  restorePoints: CVmAgentReturnObject["restorePoints"],
): CVmAgentReturnObject {
  return {
    totalStorageTB: 0,
    workspaceGB: 0,
    performanceTierImmutabilityTaxGB: 0,
    capacityTierImmutabilityTaxGB: 0,
    repoCompute: { compute: { cores: 2, ram: 8, volumes } },
    restorePoints,
  };
}

describe("detectsArchiveTierWithoutCapacity", () => {
  it("is true when Archive Tier is enabled and neither Capacity Tier policy is", () => {
    expect(detectsArchiveTierWithoutCapacity(baseInputs)).toBe(true);
  });

  it("is false when moveCapacityTierEnabled is true", () => {
    expect(
      detectsArchiveTierWithoutCapacity({
        ...baseInputs,
        moveCapacityTierEnabled: true,
      }),
    ).toBe(false);
  });

  it("is false when copyCapacityTierEnabled is true", () => {
    expect(
      detectsArchiveTierWithoutCapacity({
        ...baseInputs,
        copyCapacityTierEnabled: true,
      }),
    ).toBe(false);
  });

  it("is false when archiveTierEnabled is false", () => {
    expect(
      detectsArchiveTierWithoutCapacity({
        ...baseInputs,
        archiveTierEnabled: false,
      }),
    ).toBe(false);
  });
});

describe("buildPhantomCapacityInputs", () => {
  it("floors capacityTierDays at max(archiveTierDays, immutablePerfDays) and zeroes archiveTierDays", () => {
    const result = buildPhantomCapacityInputs(baseInputs);
    expect(result.moveCapacityTierEnabled).toBe(true);
    expect(result.copyCapacityTierEnabled).toBe(false);
    expect(result.capacityTierDays).toBe(90);
    expect(result.archiveTierDays).toBe(0);
  });

  it("uses immutablePerfDays as the floor when it exceeds archiveTierDays", () => {
    const result = buildPhantomCapacityInputs({
      ...baseInputs,
      archiveTierDays: 20,
      immutablePerfDays: 30,
    });
    expect(result.capacityTierDays).toBe(30);
  });

  it("preserves every other field, including archiveTierStandalone", () => {
    const result = buildPhantomCapacityInputs({
      ...baseInputs,
      archiveTierStandalone: true,
    });
    expect(result.archiveTierStandalone).toBe(true);
    expect(result.sourceTB).toBe(10);
  });
});

describe("hasLeakedNonGfsPoints", () => {
  it("is true when the ghost Capacity Tier volume (diskPurpose 13) is non-zero", () => {
    const response = makeResponse(
      [
        { diskGB: 14387.2, diskPurpose: 2 },
        { diskGB: 14080, diskPurpose: 4 },
        { diskGB: 9180.16, diskPurpose: 13 },
      ],
      [],
    );
    expect(hasLeakedNonGfsPoints(response)).toBe(true);
  });

  it("is false when the ghost Capacity Tier volume is zero", () => {
    const response = makeResponse(
      [
        { diskGB: 18780.16, diskPurpose: 2 },
        { diskGB: 13235.2, diskPurpose: 4 },
        { diskGB: 0, diskPurpose: 13 },
      ],
      [],
    );
    expect(hasLeakedNonGfsPoints(response)).toBe(false);
  });

  it("is false when there is no Capacity Tier volume entry at all", () => {
    const response = makeResponse([{ diskGB: 18780.16, diskPurpose: 2 }], []);
    expect(hasLeakedNonGfsPoints(response)).toBe(false);
  });
});

describe("computeCorrectedThreshold", () => {
  it("returns one more than the maximum day among non-GFS points", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 1,
          backupCapacity: 0.1,
          isFull: true,
          isGFS: false,
          isImmutable: false,
        },
        {
          pointType: "capacityTier",
          day: 91,
          backupCapacity: 0.1,
          isFull: false,
          isGFS: false,
          isImmutable: false,
        },
        {
          pointType: "archiveTier",
          day: 154,
          backupCapacity: 0.8,
          isFull: true,
          isGFS: true,
          isImmutable: false,
        },
      ],
    );
    expect(computeCorrectedThreshold(response)).toBe(92);
  });
});

describe("isArchiveComplete", () => {
  it("is true when every isGFS:true day is tagged archiveTier", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 1,
          backupCapacity: 0.1,
          isFull: true,
          isGFS: false,
          isImmutable: false,
        },
        {
          pointType: "archiveTier",
          day: 154,
          backupCapacity: 0.8,
          isFull: true,
          isGFS: true,
          isImmutable: false,
        },
      ],
    );
    expect(isArchiveComplete(response)).toBe(true);
  });

  it("is true for the Immutability Tax duplicate (day 63, tagged both performanceTier and archiveTier)", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "archiveTier",
          day: 63,
          backupCapacity: 0.82,
          isFull: true,
          isGFS: true,
          isImmutable: false,
          flags: "M2",
        },
        {
          pointType: "performanceTier",
          day: 63,
          backupCapacity: 5.5,
          isFull: true,
          isGFS: true,
          isImmutable: false,
          flags: "M2",
        },
      ],
    );
    expect(isArchiveComplete(response)).toBe(true);
  });

  it("is false when a GFS day is missing an archiveTier tag entirely", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 1,
          backupCapacity: 0.1,
          isFull: true,
          isGFS: false,
          isImmutable: false,
        },
        {
          pointType: "performanceTier",
          day: 154,
          backupCapacity: 0.8,
          isFull: true,
          isGFS: true,
          isImmutable: false,
        },
      ],
    );
    expect(isArchiveComplete(response)).toBe(false);
  });

  it("is true (vacuously) when there are no GFS points at all", () => {
    const response = makeResponse(
      [],
      [
        {
          pointType: "performanceTier",
          day: 1,
          backupCapacity: 0.1,
          isFull: true,
          isGFS: false,
          isImmutable: false,
        },
      ],
    );
    expect(isArchiveComplete(response)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:run -- resolve-archive-tier-workaround`
Expected: FAIL — `Cannot find module './resolve-archive-tier-workaround'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
import type {
  CVmAgentReturnObject,
  VmAgentInputs,
} from "@/types/vault-sizer-api";

const CAPACITY_TIER_DISK_PURPOSE = 13;

/**
 * True iff the request has Archive Tier enabled with neither Capacity Tier
 * policy on — the exact shape that triggers Issues 1 and 2 documented in
 * docs/evidence/sobr-archive-tier-no-capacity/README.md. Storage-type
 * agnostic: both issues are this one shape.
 */
export function detectsArchiveTierWithoutCapacity(
  inputs: VmAgentInputs,
): boolean {
  return (
    inputs.archiveTierEnabled === true &&
    inputs.moveCapacityTierEnabled !== true &&
    inputs.copyCapacityTierEnabled !== true
  );
}

/**
 * Builds the phantom, pass-through Capacity Tier substitution: Capacity
 * Tier "on" at a floor of max(archiveTierDays, immutablePerfDays), with
 * archiveTierDays zeroed so Capacity forwards everything into Archive
 * immediately. Returns a refined type guaranteeing capacityTierDays is
 * always a definite number (never the base type's optional undefined).
 */
export function buildPhantomCapacityInputs(
  inputs: VmAgentInputs,
): VmAgentInputs & { capacityTierDays: number } {
  const archiveTierDays = inputs.archiveTierDays ?? 0;
  const immutablePerfDays = inputs.immutablePerfDays ?? 0;
  return {
    ...inputs,
    moveCapacityTierEnabled: true,
    copyCapacityTierEnabled: false,
    capacityTierDays: Math.max(archiveTierDays, immutablePerfDays),
    archiveTierDays: 0,
  };
}

/**
 * True when the ghost Capacity Tier volume (diskPurpose 13) is non-zero —
 * the signal that the threshold in use was too low and stranded non-GFS
 * points there instead of leaving them in Performance.
 */
export function hasLeakedNonGfsPoints(response: CVmAgentReturnObject): boolean {
  const volumes = response.repoCompute?.compute?.volumes ?? [];
  const capacityVolume = volumes.find(
    (volume) => volume.diskPurpose === CAPACITY_TIER_DISK_PURPOSE,
  );
  return (capacityVolume?.diskGB ?? 0) > 0;
}

/**
 * One more than the maximum day among the response's own non-GFS restore
 * points. Only ever called after hasLeakedNonGfsPoints has returned true
 * for the same response, which implies at least one non-GFS point exists
 * — an empty non-GFS set (max of nothing) is not reachable from that call
 * site.
 */
export function computeCorrectedThreshold(
  response: CVmAgentReturnObject,
): number {
  const nonGfsDays = (response.restorePoints ?? [])
    .filter((point) => !point.isGFS)
    .map((point) => point.day);
  return Math.max(...nonGfsDays) + 1;
}

/**
 * Plain day-set membership: every isGFS:true day in the response appears
 * (at least once) tagged pointType "archiveTier". Matches
 * docs/evidence/sobr-archive-tier-no-capacity/README.md's own conclusion
 * — a single response is sufficient because isGFS/day assignment is
 * stable across different threshold values on the same dataset.
 */
export function isArchiveComplete(response: CVmAgentReturnObject): boolean {
  const points = response.restorePoints ?? [];
  const gfsDays = points
    .filter((point) => point.isGFS)
    .map((point) => point.day);
  const archivedDays = new Set(
    points
      .filter((point) => point.pointType === "archiveTier")
      .map((point) => point.day),
  );
  return gfsDays.every((day) => archivedDays.has(day));
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:run -- resolve-archive-tier-workaround`
Expected: PASS — all 15 cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/resolve-archive-tier-workaround.ts src/lib/simple-mode/resolve-archive-tier-workaround.test.ts
git commit -m "feat: add pure shape-selection/completeness module for the Archive Tier workaround"
```

---

## Task 2: Response contract — `ArchiveTierNotice`

**Files:**

- Modify: `src/types/simple-mode.ts`

- [ ] **Step 1: Add the type and widen the two response unions**

In `src/types/simple-mode.ts`, add after `SizerBffRequest`:

```ts
export interface ArchiveTierNotice {
  status: "adjusted" | "failed";
  effectiveThresholdDays?: number; // present only when status === "adjusted"
}
```

Replace the existing `SizerBffResponse` and `SizerResult` declarations with:

```ts
export type SizerBffResponse =
  | {
      success: true;
      mode: "direct";
      data: CVmAgentReturnObject;
      archiveTierNotice?: ArchiveTierNotice;
    }
  | {
      success: true;
      mode: "copy";
      primary: CVmAgentReturnObject;
      secondary: CVmAgentReturnObject;
      archiveTierNotice?: ArchiveTierNotice;
    }
  | { success: false; error: string };

export type SizerResult =
  | {
      mode: "direct";
      data: CVmAgentReturnObject;
      archiveTierNotice?: ArchiveTierNotice;
    }
  | {
      mode: "copy";
      primary: CVmAgentReturnObject;
      secondary: CVmAgentReturnObject;
      archiveTierNotice?: ArchiveTierNotice;
    };
```

- [ ] **Step 2: Verify the project still type-checks and existing tests still pass**

Run: `npx tsc -b --noEmit && npm run test:run`
Expected: PASS — adding an optional field is non-breaking; no existing code constructs these types with an exhaustive/excess-property check that would reject the new optional field. (`vault-sizer-client.ts`'s two return-statement object literals, `use-calculated-sizing.ts`'s pass-through, and every existing test fixture remain valid since `archiveTierNotice` is optional.)

- [ ] **Step 3: Commit**

```bash
git add src/types/simple-mode.ts
git commit -m "feat: add ArchiveTierNotice to the sizing response contract"
```

---

## Task 3: BFF orchestration — Direct mode

**Files:**

- Modify: `functions/api/vault-sizer.ts`
- Modify: `functions/api/vault-sizer.test.ts`

- [ ] **Step 1: Write failing tests**

Add these four `it` blocks inside the existing `describe("onRequestPost", ...)` block in `functions/api/vault-sizer.test.ts` (after the existing tests, before the closing `});`). They need a helper and configs added near the top of the file, alongside the existing `copyConfig`:

```ts
import type {
  CVmAgentReturnObject,
  Volume,
  CRpsPoints,
} from "../../src/types/vault-sizer-api";

function makeUpstreamResponse(
  volumes: Volume[],
  restorePoints: CRpsPoints[],
  totalStorageTB = 0,
): { data: CVmAgentReturnObject } {
  return {
    data: {
      totalStorageTB,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: { compute: { cores: 2, ram: 8, volumes } },
      restorePoints,
    },
  };
}

const archiveOnlySobrConfig: RepositoryConfigValues = {
  ...DEFAULT_REPOSITORY_CONFIG_VALUES,
  targetRepository: "sobr",
  sobr: {
    ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
    archiveTier: {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.archiveTier,
      enabled: true,
    },
  },
};
```

(`archiveOnlySobrConfig` uses the default `archiveTier.moveDays: "90"` and `sobr.performanceImmutableDays: "30"` — `vault-azure` requires immutability, so this produces `archiveTierDays: 90`, `immutablePerfDays: 30`, floor `max(90,30) = 90`, unchanged from the user's own input.)

```ts
it("triggering config, phantom call clean, floor unchanged from the user's own archiveTierDays: one fetch, no notice", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify(
        makeUpstreamResponse(
          [
            { diskGB: 100, diskPurpose: 3 },
            { diskGB: 50, diskPurpose: 4 },
            { diskGB: 0, diskPurpose: 13 },
          ],
          [
            {
              pointType: "performanceTier",
              day: 10,
              backupCapacity: 0.1,
              isFull: true,
              isGFS: false,
              isImmutable: false,
            },
            {
              pointType: "archiveTier",
              day: 95,
              backupCapacity: 0.5,
              isFull: true,
              isGFS: true,
              isImmutable: false,
            },
          ],
        ),
      ),
      { status: 200 },
    ),
  );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: archiveOnlySobrConfig,
    }),
  );
  const body = await response.json();

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(body.success).toBe(true);
  expect(body.archiveTierNotice).toBeUndefined();

  const [, init] = vi.mocked(fetch).mock.calls[0];
  const sentBody = JSON.parse((init as RequestInit).body as string);
  expect(sentBody.moveCapacityTierEnabled).toBe(true);
  expect(sentBody.capacityTierDays).toBe(90);
  expect(sentBody.archiveTierDays).toBe(0);
});

it("triggering config, phantom call clean, floor raises the threshold above the user's own archiveTierDays: one fetch, adjusted notice", async () => {
  const loweredMoveDaysConfig: RepositoryConfigValues = {
    ...archiveOnlySobrConfig,
    sobr: {
      ...archiveOnlySobrConfig.sobr,
      archiveTier: {
        ...archiveOnlySobrConfig.sobr.archiveTier,
        moveDays: "20",
      },
    },
  };
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify(
        makeUpstreamResponse(
          [
            { diskGB: 100, diskPurpose: 3 },
            { diskGB: 50, diskPurpose: 4 },
            { diskGB: 0, diskPurpose: 13 },
          ],
          [
            {
              pointType: "performanceTier",
              day: 10,
              backupCapacity: 0.1,
              isFull: true,
              isGFS: false,
              isImmutable: false,
            },
            {
              pointType: "archiveTier",
              day: 95,
              backupCapacity: 0.5,
              isFull: true,
              isGFS: true,
              isImmutable: false,
            },
          ],
        ),
      ),
      { status: 200 },
    ),
  );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: loweredMoveDaysConfig,
    }),
  );
  const body = await response.json();

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(body.archiveTierNotice).toEqual({
    status: "adjusted",
    effectiveThresholdDays: 30,
  });

  const [, init] = vi.mocked(fetch).mock.calls[0];
  const sentBody = JSON.parse((init as RequestInit).body as string);
  expect(sentBody.capacityTierDays).toBe(30);
});

it("triggering config, leak on the first call, corrected resubmit clean: two fetches, adjusted notice", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 100, diskPurpose: 3 },
              { diskGB: 50, diskPurpose: 4 },
              { diskGB: 20, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "capacityTier",
                day: 95,
                backupCapacity: 0.1,
                isFull: false,
                isGFS: false,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 150, diskPurpose: 3 },
              { diskGB: 60, diskPurpose: 4 },
              { diskGB: 0, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "performanceTier",
                day: 95,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "archiveTier",
                day: 150,
                backupCapacity: 0.8,
                isFull: true,
                isGFS: true,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: archiveOnlySobrConfig,
    }),
  );
  const body = await response.json();

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(body.archiveTierNotice).toEqual({
    status: "adjusted",
    effectiveThresholdDays: 96,
  });

  const [, secondInit] = vi.mocked(fetch).mock.calls[1];
  const secondSentBody = JSON.parse((secondInit as RequestInit).body as string);
  expect(secondSentBody.capacityTierDays).toBe(96);
});

it("triggering config, corrected resubmit still incomplete: three fetches, raw fallback data, failed notice", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 100, diskPurpose: 3 },
              { diskGB: 50, diskPurpose: 4 },
              { diskGB: 20, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "capacityTier",
                day: 95,
                backupCapacity: 0.1,
                isFull: false,
                isGFS: false,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 150, diskPurpose: 3 },
              { diskGB: 60, diskPurpose: 4 },
              { diskGB: 0, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "performanceTier",
                day: 95,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              // Still incomplete: this GFS day never got tagged archiveTier.
              {
                pointType: "performanceTier",
                day: 150,
                backupCapacity: 0.8,
                isFull: true,
                isGFS: true,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse([{ diskGB: 999, diskPurpose: 2 }], [], 99),
        ),
        { status: 200 },
      ),
    );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: archiveOnlySobrConfig,
    }),
  );
  const body = await response.json();

  expect(fetch).toHaveBeenCalledTimes(3);
  expect(body.data.totalStorageTB).toBe(99);
  expect(body.archiveTierNotice).toEqual({ status: "failed" });

  const [, thirdInit] = vi.mocked(fetch).mock.calls[2];
  const thirdSentBody = JSON.parse((thirdInit as RequestInit).body as string);
  expect(thirdSentBody.moveCapacityTierEnabled).toBeFalsy();
  expect(thirdSentBody.archiveTierDays).toBe(90);
});

it("returns 502 when the workaround's last-resort fallback call itself rejects", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 100, diskPurpose: 3 },
              { diskGB: 50, diskPurpose: 4 },
              { diskGB: 20, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "capacityTier",
                day: 95,
                backupCapacity: 0.1,
                isFull: false,
                isGFS: false,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 150, diskPurpose: 3 },
              { diskGB: 60, diskPurpose: 4 },
              { diskGB: 0, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "performanceTier",
                day: 95,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "performanceTier",
                day: 150,
                backupCapacity: 0.8,
                isFull: true,
                isGFS: true,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    )
    .mockRejectedValueOnce(new Error("network error"));

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: archiveOnlySobrConfig,
    }),
  );
  const body = await response.json();

  expect(fetch).toHaveBeenCalledTimes(3);
  expect(response.status).toBe(502);
  expect(body).toEqual({
    success: false,
    error: "Upstream sizing API unreachable",
  });
});

it("triggering config, first call has no leak but is still incomplete: two fetches (no corrected resubmit in between), raw fallback data, failed notice", async () => {
  // This exercises resolveInputs's OTHER path to the fallback: reachable
  // whenever isArchiveComplete fails on the very first phantom response
  // and hasLeakedNonGfsPoints never fires, so there is no corrected
  // resubmit — just phantom, then fallback. Distinct from the leak-first
  // fallback test above, which is phantom, corrected resubmit, fallback
  // (three calls). Synthetic — the live evidence sweep found zero
  // completeness failures in practice — but it is a real branch of
  // resolveInputs's control flow and must not go untested.
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 100, diskPurpose: 3 },
              { diskGB: 50, diskPurpose: 4 },
              { diskGB: 0, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              // Still incomplete: this GFS day never got tagged archiveTier,
              // but nothing leaked into capacityTier (diskPurpose 13 is 0
              // above), so hasLeakedNonGfsPoints never fires.
              {
                pointType: "performanceTier",
                day: 150,
                backupCapacity: 0.8,
                isFull: true,
                isGFS: true,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse([{ diskGB: 777, diskPurpose: 2 }], [], 77),
        ),
        { status: 200 },
      ),
    );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: archiveOnlySobrConfig,
    }),
  );
  const body = await response.json();

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(body.data.totalStorageTB).toBe(77);
  expect(body.archiveTierNotice).toEqual({ status: "failed" });

  const [, secondInit] = vi.mocked(fetch).mock.calls[1];
  const secondSentBody = JSON.parse((secondInit as RequestInit).body as string);
  expect(secondSentBody.moveCapacityTierEnabled).toBeFalsy();
  expect(secondSentBody.archiveTierDays).toBe(90);
});
```

- [ ] **Step 2: Run tests, verify the new ones fail and the existing ones still pass**

Run: `npm run test:run -- functions/api/vault-sizer`
Expected: all six new tests FAIL (`resolveInputs` doesn't exist yet — `handleDirect` still calls the old single `upstreamFetch` path, so `moveCapacityTierEnabled`/`capacityTierDays` are never sent, no `archiveTierNotice` ever appears, and the two reject/fallback tests never reach a second or third call); all pre-existing tests in the file still PASS (nothing has changed yet for non-triggering configs).

- [ ] **Step 3: Implement `fetchAndParse` and `resolveInputs`, wire into `handleDirect`**

In `functions/api/vault-sizer.ts`, add the import:

```ts
import {
  buildPhantomCapacityInputs,
  computeCorrectedThreshold,
  detectsArchiveTierWithoutCapacity,
  hasLeakedNonGfsPoints,
  isArchiveComplete,
} from "../../src/lib/simple-mode/resolve-archive-tier-workaround";
import type { ArchiveTierNotice } from "../../src/types/simple-mode";
```

Add these two functions after `upstreamFetch`/`parseBody` and before `handleDirect`:

```ts
type FetchOutcome =
  | { ok: true; data: CVmAgentReturnObject }
  | { ok: false; status: number; error: string };

async function fetchAndParse(inputs: VmAgentInputs): Promise<FetchOutcome> {
  const upstream = await upstreamFetch(inputs);
  const upstreamBody: unknown = await parseBody(upstream);
  if (upstream.ok) {
    const { data } = upstreamBody as { data: CVmAgentReturnObject };
    return { ok: true, data };
  }
  return {
    ok: false,
    status: upstream.status,
    error: extractErrorMessage(upstreamBody),
  };
}

type ResolvedInputs =
  | {
      ok: true;
      data: CVmAgentReturnObject;
      archiveTierNotice?: ArchiveTierNotice;
    }
  | { ok: false; status: number; error: string };

// The detect-and-resubmit workaround for SOBR Archive Tier without Capacity
// Tier (ADR-0022; docs/evidence/sobr-archive-tier-no-capacity/README.md).
async function resolveInputs(inputs: VmAgentInputs): Promise<ResolvedInputs> {
  if (!detectsArchiveTierWithoutCapacity(inputs)) {
    return fetchAndParse(inputs);
  }

  const phantomInputs = buildPhantomCapacityInputs(inputs);
  const first = await fetchAndParse(phantomInputs);
  if (!first.ok) return first;

  let finalData = first.data;
  let finalThreshold = phantomInputs.capacityTierDays;

  if (hasLeakedNonGfsPoints(first.data)) {
    const correctedThreshold = computeCorrectedThreshold(first.data);
    const correctedInputs = {
      ...phantomInputs,
      capacityTierDays: correctedThreshold,
    };
    const second = await fetchAndParse(correctedInputs);
    if (!second.ok) return second;
    finalData = second.data;
    finalThreshold = correctedThreshold;
  }

  if (isArchiveComplete(finalData)) {
    return {
      ok: true,
      data: finalData,
      archiveTierNotice:
        finalThreshold !== inputs.archiveTierDays
          ? { status: "adjusted", effectiveThresholdDays: finalThreshold }
          : undefined,
    };
  }

  const fallback = await fetchAndParse(inputs);
  if (!fallback.ok) return fallback;
  return {
    ok: true,
    data: fallback.data,
    archiveTierNotice: { status: "failed" },
  };
}
```

Replace `handleDirect`'s body with:

```ts
async function handleDirect(bffRequest: SizerBffRequest): Promise<Response> {
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
    const resolved = await resolveInputs(vmAgentInputs);
    if (!resolved.ok) {
      return jsonResponse(
        { success: false, error: resolved.error },
        resolved.status,
      );
    }
    return jsonResponse(
      {
        success: true,
        mode: "direct",
        data: resolved.data,
        archiveTierNotice: resolved.archiveTierNotice,
      },
      200,
    );
  } catch {
    return jsonResponse(
      { success: false, error: "Upstream sizing API unreachable" },
      502,
    );
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:run -- functions/api/vault-sizer`
Expected: PASS — all five new tests, plus every pre-existing test in the file (`handleCopy` still calls the old `upstreamFetch`/`parseBody`/error-message logic directly until Task 4, so copy-mode tests are unaffected by this task).

- [ ] **Step 5: Commit**

```bash
git add functions/api/vault-sizer.ts functions/api/vault-sizer.test.ts
git commit -m "feat: wire the Archive Tier workaround into Direct mode's BFF handler"
```

---

## Task 4: BFF orchestration — Backup Copy mode

**Files:**

- Modify: `functions/api/vault-sizer.ts`
- Modify: `functions/api/vault-sizer.test.ts`

- [ ] **Step 1: Write a failing test**

Add inside `describe("onRequestPost", ...)`:

```ts
it("Backup Copy: Secondary triggers and gets an adjusted notice, Primary is unaffected", async () => {
  const copyArchiveOnlyConfig: RepositoryConfigValues = {
    ...copyConfig,
    targetRepository: "sobr",
    sobr: {
      ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr,
      archiveTier: {
        ...DEFAULT_REPOSITORY_CONFIG_VALUES.sobr.archiveTier,
        enabled: true,
        moveDays: "20",
      },
    },
  };
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse([{ diskGB: 24576, diskPurpose: 2 }], [], 24),
        ),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          makeUpstreamResponse(
            [
              { diskGB: 100, diskPurpose: 3 },
              { diskGB: 50, diskPurpose: 4 },
              { diskGB: 0, diskPurpose: 13 },
            ],
            [
              {
                pointType: "performanceTier",
                day: 10,
                backupCapacity: 0.1,
                isFull: true,
                isGFS: false,
                isImmutable: false,
              },
              {
                pointType: "archiveTier",
                day: 95,
                backupCapacity: 0.5,
                isFull: true,
                isGFS: true,
                isImmutable: false,
              },
            ],
          ),
        ),
        { status: 200 },
      ),
    );

  const response = await onRequestPost(
    postRequest({
      workloadData: DEFAULT_WORKLOAD_DATA_VALUES,
      repositoryConfig: copyArchiveOnlyConfig,
    }),
  );
  const body = await response.json();

  expect(fetch).toHaveBeenCalledTimes(2);
  expect(body.primary.totalStorageTB).toBe(24);
  expect(body.archiveTierNotice).toEqual({
    status: "adjusted",
    effectiveThresholdDays: 30,
  });

  const [, secondaryInit] = vi.mocked(fetch).mock.calls[1];
  const secondarySentBody = JSON.parse(
    (secondaryInit as RequestInit).body as string,
  );
  expect(secondarySentBody.capacityTierDays).toBe(30);
});
```

(The "last-resort fallback call itself rejects" edge case is Direct-mode-specific and already covered in Task 3's test file — it exercises `resolveInputs` directly, which `handleCopy` also calls, so no separate Copy-mode version is needed.)

- [ ] **Step 2: Run tests, verify the new one fails and the existing ones still pass**

Run: `npm run test:run -- functions/api/vault-sizer`
Expected: the Backup Copy triggering test FAILS (`handleCopy` still calls bare `upstreamFetch`, never sends the phantom shape); every pre-existing test still PASSES, including all five tests added in Task 3.

- [ ] **Step 3: Wire `resolveInputs` into `handleCopy`**

Replace `handleCopy`'s body with:

```ts
async function handleCopy(bffRequest: SizerBffRequest): Promise<Response> {
  let inputs: { primary: VmAgentInputs; secondary: VmAgentInputs };
  try {
    inputs = buildCopyVmAgentRequests(
      bffRequest.workloadData,
      bffRequest.repositoryConfig,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return jsonResponse({ success: false, error: message }, 400);
  }

  try {
    const [primaryResolved, secondaryResolved] = await Promise.all([
      resolveInputs(inputs.primary),
      resolveInputs(inputs.secondary),
    ]);

    if (!primaryResolved.ok) {
      return jsonResponse(
        {
          success: false,
          error: `Primary (on-premises) sizing failed: ${primaryResolved.error}`,
        },
        primaryResolved.status,
      );
    }
    if (!secondaryResolved.ok) {
      return jsonResponse(
        {
          success: false,
          error: `Secondary (offsite Vault) sizing failed: ${secondaryResolved.error}`,
        },
        secondaryResolved.status,
      );
    }

    return jsonResponse(
      {
        success: true,
        mode: "copy",
        primary: primaryResolved.data,
        secondary: secondaryResolved.data,
        archiveTierNotice:
          primaryResolved.archiveTierNotice ??
          secondaryResolved.archiveTierNotice,
      },
      200,
    );
  } catch {
    return jsonResponse(
      { success: false, error: "Upstream sizing API unreachable" },
      502,
    );
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:run -- functions/api/vault-sizer`
Expected: PASS — every test in the file, including all pre-existing Backup Copy tests (fan-out, fail-whole Primary/Secondary-labeled errors, non-JSON fallback, network rejection) since `resolveInputs`'s non-triggering branch is a thin wrapper around the exact same `fetchAndParse` logic those tests already exercise.

- [ ] **Step 5: Commit**

```bash
git add functions/api/vault-sizer.ts functions/api/vault-sizer.test.ts
git commit -m "feat: wire the Archive Tier workaround into Backup Copy's BFF handler"
```

---

## Task 5: Client passthrough

**Files:**

- Modify: `src/lib/api/vault-sizer-client.ts`
- Modify: `src/lib/api/vault-sizer-client.test.ts`

- [ ] **Step 1: Write a failing test**

Add to `src/lib/api/vault-sizer-client.test.ts`, inside `describe("callVaultSizerApi", ...)`:

```ts
it("threads archiveTierNotice through for direct mode", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(
      JSON.stringify({
        success: true,
        mode: "direct",
        data: mockData,
        archiveTierNotice: { status: "adjusted", effectiveThresholdDays: 30 },
      }),
      { status: 200 },
    ),
  );

  const result = await callVaultSizerApi(
    DEFAULT_WORKLOAD_DATA_VALUES,
    DEFAULT_REPOSITORY_CONFIG_VALUES,
  );

  expect(result.archiveTierNotice).toEqual({
    status: "adjusted",
    effectiveThresholdDays: 30,
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:run -- vault-sizer-client`
Expected: FAIL — `result.archiveTierNotice` is `undefined` because `callVaultSizerApi` doesn't copy that field onto its return value yet.

- [ ] **Step 3: Thread the field through**

In `src/lib/api/vault-sizer-client.ts`, replace the two return statements:

```ts
if (body.mode === "direct") {
  return {
    mode: "direct",
    data: body.data,
    archiveTierNotice: body.archiveTierNotice,
  };
}

return {
  mode: "copy",
  primary: body.primary,
  secondary: body.secondary,
  archiveTierNotice: body.archiveTierNotice,
};
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:run -- vault-sizer-client`
Expected: PASS — the new test and every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/vault-sizer-client.ts src/lib/api/vault-sizer-client.test.ts
git commit -m "feat: thread archiveTierNotice through the sizing client"
```

---

## Task 6: UI — render the notice in Projected Sizing

**Files:**

- Modify: `src/components/simple-mode/projected-sizing-card.tsx`
- Modify: `src/components/simple-mode/projected-sizing-card.test.tsx`

- [ ] **Step 1: Write failing tests**

This file does **not** mock `useCalculatedSizing` — it stubs global `fetch` (already set up in its `beforeEach`) and drives the real hook, asserting with `await vi.waitFor(...)`, exactly like every existing test in the file (e.g. `"wires InfrastructureTelemetry to proxyCompute, not repoCompute"`). Add these three tests to `src/components/simple-mode/projected-sizing-card.test.tsx`, reusing the file's existing `mockData`/`jsonResponse` fixtures — do not introduce a hook mock:

```ts
  it("renders the adjusted-threshold note when archiveTierNotice.status is adjusted", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        mode: "direct",
        data: mockData,
        archiveTierNotice: { status: "adjusted", effectiveThresholdDays: 30 },
      }),
    );

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        onChange={() => {}}
      />,
    );

    await vi.waitFor(() =>
      expect(
        screen.getByText(/adjusted internally to 30 days/i),
      ).toBeInTheDocument(),
    );
  });

  it("renders the hard disclaimer when archiveTierNotice.status is failed", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        success: true,
        mode: "direct",
        data: mockData,
        archiveTierNotice: { status: "failed" },
      }),
    );

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        onChange={() => {}}
      />,
    );

    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /couldn't be fully verified/i,
      ),
    );
  });

  it("renders no notice when archiveTierNotice is absent", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ success: true, mode: "direct", data: mockData }),
    );

    render(
      <ProjectedSizingCard
        workloadData={DEFAULT_WORKLOAD_DATA_VALUES}
        repositoryConfig={DEFAULT_REPOSITORY_CONFIG_VALUES}
        onChange={() => {}}
      />,
    );

    // Wait for real data to actually render first — otherwise the queryBy
    // assertions below would trivially pass before the fetch even resolves.
    await vi.waitFor(() =>
      expect(screen.getAllByText("18.4 TB").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(/adjusted internally/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't be fully verified/i),
    ).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:run -- projected-sizing-card`
Expected: FAIL — neither text appears yet since `ProjectedSizingCard` doesn't render anything from `archiveTierNotice`.

- [ ] **Step 3: Render the notice**

In `src/components/simple-mode/projected-sizing-card.tsx`, add right after the existing `directData`/`copyData` declarations:

```ts
const archiveTierNotice = data?.archiveTierNotice;
```

Add this block immediately after the existing `{error ? (...) : null}` block inside `<CardContent>`:

```tsx
{
  archiveTierNotice?.status === "adjusted" ? (
    <div className="border-border bg-muted/50 text-muted-foreground rounded-md border px-3 py-2 text-sm">
      Effective offload threshold adjusted internally to{" "}
      {archiveTierNotice.effectiveThresholdDays} days to match GFS chain offload
      requirements.
    </div>
  ) : null;
}

{
  archiveTierNotice?.status === "failed" ? (
    <div
      role="alert"
      className="border-destructive text-destructive rounded-md border px-3 py-2 text-sm"
    >
      This configuration's Archive Tier sizing couldn't be fully verified due to
      a known calculator engine limitation. Try enabling Capacity Tier, or
      adjusting the Archive Tier offload threshold.
    </div>
  ) : null;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:run -- projected-sizing-card`
Expected: PASS — all three new tests, plus every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/projected-sizing-card.tsx src/components/simple-mode/projected-sizing-card.test.tsx
git commit -m "feat: render Archive Tier workaround notices in Projected Sizing"
```

---

## Task 7: Verify phantom-tier artifacts don't leak into rendering

**Files:**

- Modify: `src/components/simple-mode/storage-breakdown.test.tsx`

- [ ] **Step 1: Write a test proving `transactions`/`restorePoints` never influence rendered tier rows**

Add to `src/components/simple-mode/storage-breakdown.test.tsx`:

```ts
  it("ignores transactions and restorePoints entirely, even when they carry capacity-tagged data — only volumes drives tier rows", () => {
    const data: CVmAgentReturnObject = {
      totalStorageTB: 0,
      workspaceGB: 0,
      performanceTierImmutabilityTaxGB: 0,
      capacityTierImmutabilityTaxGB: 0,
      repoCompute: {
        compute: {
          cores: 2,
          ram: 8,
          // No Capacity Tier volume entry at all — the phantom-tier request
          // this data plausibly came from used Capacity Tier internally,
          // but it must never surface as a rendered tier.
          volumes: [{ diskGB: 2048, diskPurpose: 3 }],
        },
      },
      transactions: {
        capacityTierTransactions: {
          firstMonthTransactions: 999,
          secondMonthTransactions: 999,
          finalMonthTransactions: 999,
        },
      },
      restorePoints: [
        {
          pointType: "capacityTier",
          day: 60,
          backupCapacity: 5,
          isFull: true,
          isGFS: true,
          isImmutable: false,
        },
      ],
    };

    render(<StorageBreakdown data={data} />);

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.queryByText("Capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Archive")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test, verify it passes without any implementation change**

Run: `npm run test:run -- storage-breakdown`
Expected: PASS immediately — `getTierStorageRows`/`getTotalStorageGB` (`src/lib/simple-mode/storage-tiers.ts`) only ever read `repoCompute.compute.volumes`; this test makes that guarantee explicit and durable rather than merely inferred from a repo-wide grep.

- [ ] **Step 3: Commit**

```bash
git add src/components/simple-mode/storage-breakdown.test.tsx
git commit -m "test: pin down that phantom Capacity Tier data never leaks into rendered tier rows"
```

---

## Final verification

- [ ] Run the full suite: `npm run test:run`
      Expected: PASS, zero failures.
- [ ] Run the type checker: `npx tsc -b --noEmit`
      Expected: PASS, zero errors.
- [ ] Run the linter: `npm run lint`
      Expected: PASS, zero errors.
- [ ] Re-run the evidence regression check: `node docs/evidence/sobr-archive-tier-no-capacity/probe.mjs`
      Expected: exit 0, "all findings in README.md still hold" — confirms Veeam's engine hasn't drifted since this plan was written.
