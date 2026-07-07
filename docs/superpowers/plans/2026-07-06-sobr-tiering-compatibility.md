# SOBR Tiering Compatibility Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the one missing SOBR compatibility rule — Google Cloud object storage can never be the tier that feeds Archive Tier, whether it's sitting in Performance Tier (no Capacity Tier) or Capacity Tier itself — as an inline validation error, plus the supporting domain data (`repoTypeCanFeedArchiveTier`, `BLOCK_GENERATION_DAYS`) for future use.

**Architecture:** A pure domain predicate (`repoTypeCanFeedArchiveTier`) and a `Partial<Record<RepoType, number>>` lookup (`BLOCK_GENERATION_DAYS`) are added to `types/simple-mode.ts`, alongside the existing `repoTypeRequiresImmutability` pair they mirror. `validate-repository-config.ts` computes which tier is actually upstream of Archive Tier (`capacityTier.type` if Capacity Tier is enabled, else `performanceType`) and calls the new predicate against it, producing a new `RepositoryConfigErrors.sobr.archiveTier.archiveFeedUnsupported` message. `sobr-builder.tsx` renders that message inline, matching every other error in the card.

**Tech Stack:** React 19 + TypeScript (strict), Vitest + React Testing Library + `@testing-library/user-event`, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-06-sobr-tiering-compatibility-design.md`

---

## File Structure

```
src/
├── types/
│   └── simple-mode.ts                         # modify — add repoTypeCanFeedArchiveTier, BLOCK_GENERATION_DAYS, extend RepositoryConfigErrors
├── lib/simple-mode/
│   ├── validate-repository-config.ts          # modify — add the archive-feed compatibility check
│   └── validate-repository-config.test.ts     # modify — add 3 new test cases
└── components/simple-mode/
    ├── sobr-builder.tsx                       # modify — render the new error message
    └── sobr-builder.test.tsx                  # modify — add 1 new rendering test
```

Each task below is independently committable and leaves the test suite green.

---

### Task 1: Domain data — extend `src/types/simple-mode.ts`

**Files:**

- Modify: `src/types/simple-mode.ts:85-88` (insert after `repoTypeRequiresImmutability`)
- Modify: `src/types/simple-mode.ts:177` (extend `RepositoryConfigErrors.sobr.archiveTier`)

This task adds pure domain data with no independent runtime behavior of its own (same as the existing `REPO_TYPES_REQUIRING_IMMUTABILITY`/`repoTypeRequiresImmutability` pair, which also has no dedicated test file) — it's exercised through Task 2's validator tests instead. No new test file for this task.

- [ ] **Step 1: Add `repoTypeCanFeedArchiveTier` and `BLOCK_GENERATION_DAYS`**

In `src/types/simple-mode.ts`, the current lines 85-89 read:

```ts
export function repoTypeRequiresImmutability(type: RepoType): boolean {
  return REPO_TYPES_REQUIRING_IMMUTABILITY.has(type);
}

// Primary and Performance Tier allow the full set: Vault-to-Vault copy jobs
```

Insert a new block between the closing `}` of `repoTypeRequiresImmutability` and the `// Primary and Performance Tier...` comment, so it reads:

```ts
export function repoTypeRequiresImmutability(type: RepoType): boolean {
  return REPO_TYPES_REQUIRING_IMMUTABILITY.has(type);
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
// Block Generation concept applies.
export const BLOCK_GENERATION_DAYS: Partial<Record<RepoType, number>> = {
  "vault-azure": 10,
  "vault-aws": 10,
  "azure-blob": 10,
  "s3-compatible": 10,
  "aws-s3": 30,
  "google-cloud": 30,
};

// Primary and Performance Tier allow the full set: Vault-to-Vault copy jobs
```

- [ ] **Step 2: Extend `RepositoryConfigErrors.sobr.archiveTier`**

The current `RepositoryConfigErrors` interface has this `sobr` field:

```ts
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
```

Change the `archiveTier` line inside `sobr` to add the new field:

```ts
export interface RepositoryConfigErrors {
  targetRepositoryImmutableDays?: string;
  primary?: {
    immutableDays?: string;
    retention?: RetentionOverrideErrors;
  };
  sobr?: {
    performanceImmutableDays?: string;
    capacityTier?: { moveDays?: string; immutableDays?: string };
    archiveTier?: {
      moveDays?: string;
      immutableDays?: string;
      archiveFeedUnsupported?: string;
    };
  };
  secondaryRetention?: RetentionOverrideErrors;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no output (clean pass). `BLOCK_GENERATION_DAYS` and `repoTypeCanFeedArchiveTier` have no consumers yet, which is fine — TypeScript doesn't flag unused exports.

- [ ] **Step 4: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: `12 passed (12)` test files, same count as before this change (this task only adds new exports and an optional field; nothing existing reads or writes them yet).

- [ ] **Step 5: Commit**

```bash
git add src/types/simple-mode.ts
git commit -m "$(cat <<'EOF'
feat: add archive-feed compatibility and Block Generation domain data

repoTypeCanFeedArchiveTier mirrors repoTypeRequiresImmutability's
pattern: Google Cloud is the only repo type VBR excludes from feeding
Archive Tier, whether it's the Performance or Capacity Tier type.
BLOCK_GENERATION_DAYS is unused for now — ready for the future API
integration (Phase 3, per ADR-0001).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Validation rule — `validate-repository-config.ts`

**Files:**

- Test: `src/lib/simple-mode/validate-repository-config.test.ts`
- Modify: `src/lib/simple-mode/validate-repository-config.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/simple-mode/validate-repository-config.test.ts`, the `describe("sobr.archiveTier", ...)` block currently ends with this test (its closing `});` is followed by the outer `});` that closes the top-level `describe("validateRepositoryConfig", ...)`):

```ts
    it("requires immutableDays", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            archiveTier: {
              ...validSobrValues.sobr.archiveTier,
              immutableDays: "",
            },
          },
        }).sobr?.archiveTier?.immutableDays,
      ).toBe("Required");
    });
  });
});
```

Add three new tests directly after `"requires immutableDays"` and before the two closing `});`:

```ts
    it("requires immutableDays", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            archiveTier: {
              ...validSobrValues.sobr.archiveTier,
              immutableDays: "",
            },
          },
        }).sobr?.archiveTier?.immutableDays,
      ).toBe("Required");
    });

    it("requires the Performance Tier type to support feeding Archive Tier when Capacity Tier is disabled", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            performanceType: "google-cloud",
            capacityTier: {
              ...validSobrValues.sobr.capacityTier,
              enabled: false,
            },
          },
        }).sobr?.archiveTier?.archiveFeedUnsupported,
      ).toBe(
        "Google Cloud doesn't support sending data directly to Archive Tier without a Capacity Tier in between. Add a Capacity Tier (with a non-Google-Cloud type), or change the Performance Tier repository type.",
      );
    });

    it("ignores Performance Tier's type once Capacity Tier is the tier feeding Archive Tier", () => {
      // Performance is Google Cloud, but Capacity Tier (s3-compatible, from
      // validSobrValues) is enabled and sits between Performance and Archive,
      // so Performance's type is irrelevant here. This is not "Google Cloud
      // is always fine once Capacity Tier exists" — it passes only because
      // the *Capacity Tier's* type supports feeding Archive Tier.
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            performanceType: "google-cloud",
          },
        }).sobr?.archiveTier?.archiveFeedUnsupported,
      ).toBeUndefined();
    });

    it("requires the Capacity Tier type to support feeding Archive Tier when Capacity Tier is enabled", () => {
      expect(
        validateRepositoryConfig({
          ...validSobrValues,
          sobr: {
            ...validSobrValues.sobr,
            capacityTier: {
              ...validSobrValues.sobr.capacityTier,
              type: "google-cloud",
            },
          },
        }).sobr?.archiveTier?.archiveFeedUnsupported,
      ).toBe(
        "Google Cloud Capacity Tier can't send data to Archive Tier. Change the Capacity Tier repository type.",
      );
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/simple-mode/validate-repository-config.test.ts`
Expected: 3 new failures — each `expect(...).toBe(...)` or `.toBeUndefined()` fails because `archiveFeedUnsupported` is never set by the current implementation (it's `undefined` in all three cases, so the two `.toBe(...)` assertions fail; the `.toBeUndefined()` one coincidentally already passes today, but confirm the other two fail before continuing).

- [ ] **Step 3: Implement the validation rule**

In `src/lib/simple-mode/validate-repository-config.ts`, the import block currently reads:

```ts
import type {
  RepositoryConfigErrors,
  RepositoryConfigValues,
  RetentionOverride,
  RetentionOverrideErrors,
} from "@/types/simple-mode";
import { repoTypeRequiresImmutability } from "@/types/simple-mode";
```

Change the second import to also bring in the new predicate and the label lookup:

```ts
import type {
  RepositoryConfigErrors,
  RepositoryConfigValues,
  RetentionOverride,
  RetentionOverrideErrors,
} from "@/types/simple-mode";
import {
  REPO_TYPE_LABEL,
  repoTypeCanFeedArchiveTier,
  repoTypeRequiresImmutability,
} from "@/types/simple-mode";
```

The `if (archiveTier.enabled)` block currently reads:

```ts
if (archiveTier.enabled) {
  const archiveErrors: { moveDays?: string; immutableDays?: string } = {};

  const moveDaysError = requireNumber(archiveTier.moveDays, {
    integer: true,
    min: 1,
  });
  if (moveDaysError) {
    archiveErrors.moveDays = moveDaysError;
  } else if (capacityTier.enabled && capacityTier.movePolicy) {
    const capacityMoveDays = Number(capacityTier.moveDays);
    if (
      Number.isFinite(capacityMoveDays) &&
      Number(archiveTier.moveDays) <= capacityMoveDays
    ) {
      archiveErrors.moveDays = `Must be greater than ${capacityTier.moveDays}`;
    }
  }

  const immutableError = requireNumber(archiveTier.immutableDays, {
    integer: true,
    min: 1,
  });
  if (immutableError) archiveErrors.immutableDays = immutableError;

  if (Object.keys(archiveErrors).length > 0) {
    sobrErrors.archiveTier = archiveErrors;
  }
}
```

Replace it with (widening the `archiveErrors` type annotation and adding the new check before the existing `if (Object.keys(archiveErrors)...)` guard):

```ts
if (archiveTier.enabled) {
  const archiveErrors: {
    moveDays?: string;
    immutableDays?: string;
    archiveFeedUnsupported?: string;
  } = {};

  const moveDaysError = requireNumber(archiveTier.moveDays, {
    integer: true,
    min: 1,
  });
  if (moveDaysError) {
    archiveErrors.moveDays = moveDaysError;
  } else if (capacityTier.enabled && capacityTier.movePolicy) {
    const capacityMoveDays = Number(capacityTier.moveDays);
    if (
      Number.isFinite(capacityMoveDays) &&
      Number(archiveTier.moveDays) <= capacityMoveDays
    ) {
      archiveErrors.moveDays = `Must be greater than ${capacityTier.moveDays}`;
    }
  }

  const immutableError = requireNumber(archiveTier.immutableDays, {
    integer: true,
    min: 1,
  });
  if (immutableError) archiveErrors.immutableDays = immutableError;

  const archiveSourceType = capacityTier.enabled
    ? capacityTier.type
    : values.sobr.performanceType;

  if (!repoTypeCanFeedArchiveTier(archiveSourceType)) {
    const sourceLabel = REPO_TYPE_LABEL[archiveSourceType];
    archiveErrors.archiveFeedUnsupported = capacityTier.enabled
      ? `${sourceLabel} Capacity Tier can't send data to Archive Tier. ` +
        `Change the Capacity Tier repository type.`
      : `${sourceLabel} doesn't support sending data directly to Archive ` +
        `Tier without a Capacity Tier in between. Add a Capacity Tier ` +
        `(with a non-Google-Cloud type), or change the Performance Tier ` +
        `repository type.`;
  }

  if (Object.keys(archiveErrors).length > 0) {
    sobrErrors.archiveTier = archiveErrors;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/simple-mode/validate-repository-config.test.ts`
Expected: all tests pass, including the 3 new ones and the pre-existing `"is independent of capacityTier being disabled"` test (line ~358) — that test uses `validSobrValues`' default `performanceType: "vault-azure"` with Capacity Tier disabled, so `archiveSourceType` resolves to `"vault-azure"`, which `repoTypeCanFeedArchiveTier` allows, so no new error is introduced and its `toBeUndefined()` assertion still holds.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.app.json`
Expected: all test files pass; no typecheck output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/simple-mode/validate-repository-config.ts src/lib/simple-mode/validate-repository-config.test.ts
git commit -m "$(cat <<'EOF'
feat: validate that Archive Tier's upstream repo type can feed it

Whichever tier is immediately upstream of Archive Tier (Capacity
Tier's type if enabled, else Performance Tier's type) must support
feeding Archive Tier. Google Cloud is the only type that doesn't,
regardless of which tier it's in. The error message names whichever
tier is actually at fault, since "add a Capacity Tier" is wrong advice
when the Capacity Tier already added is the problem.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: UI — surface the message in `sobr-builder.tsx`

**Files:**

- Test: `src/components/simple-mode/sobr-builder.test.tsx`
- Modify: `src/components/simple-mode/sobr-builder.tsx`

- [ ] **Step 1: Write the failing test**

In `src/components/simple-mode/sobr-builder.test.tsx`, the last test in the file currently reads:

```ts
  it("renders Capacity Tier's Copy/Move policies and Archive Tier's standalone option as switches, not checkboxes", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<SobrConfig>(defaultSobr);
      return <SobrBuilder value={value} onChange={setValue} />;
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /add archive tier/i }));

    expect(
      screen.getByRole("switch", {
        name: /copy backups as soon as they are created/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: /age out of the operational restore window/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /standalone fulls/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
```

Add a new test directly after it, before the file's final closing `});`:

```ts
  it("renders Capacity Tier's Copy/Move policies and Archive Tier's standalone option as switches, not checkboxes", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<SobrConfig>(defaultSobr);
      return <SobrBuilder value={value} onChange={setValue} />;
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /add archive tier/i }));

    expect(
      screen.getByRole("switch", {
        name: /copy backups as soon as they are created/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", {
        name: /age out of the operational restore window/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: /standalone fulls/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("shows the archive-feed incompatibility message when present in errors", () => {
    render(
      <SobrBuilder
        value={{
          ...defaultSobr,
          archiveTier: { ...defaultSobr.archiveTier, enabled: true },
        }}
        errors={{
          archiveTier: {
            archiveFeedUnsupported:
              "Google Cloud doesn't support sending data directly to Archive Tier without a Capacity Tier in between. Add a Capacity Tier (with a non-Google-Cloud type), or change the Performance Tier repository type.",
          },
        }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        /doesn't support sending data directly to archive tier/i,
      ),
    ).toBeInTheDocument();
  });

  it("does not show the archive-feed incompatibility message when absent from errors", () => {
    render(
      <SobrBuilder
        value={{
          ...defaultSobr,
          archiveTier: { ...defaultSobr.archiveTier, enabled: true },
        }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByText(/can't send data to archive tier/i),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/simple-mode/sobr-builder.test.tsx`
Expected: `"shows the archive-feed incompatibility message when present in errors"` fails with a "Unable to find an element with the text" error — `sobr-builder.tsx` doesn't render `errors.archiveTier.archiveFeedUnsupported` anywhere yet. The "does not show" test passes already (nothing renders it yet either way) — that's expected; it's there to guard against a future regression, not to demonstrate current failure.

- [ ] **Step 3: Implement the UI change**

In `src/components/simple-mode/sobr-builder.tsx`, the enabled Archive Tier block currently opens like this:

```tsx
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-tier-archive text-sm font-semibold">
                Archive Tier
              </h3>
              <button
                type="button"
                onClick={() => setArchiveTier({ enabled: false })}
                className="text-muted-foreground text-xs underline"
              >
                Remove
              </button>
            </div>
            <div className="flex flex-row flex-wrap items-end gap-4">
```

Insert the new error message between the heading/Remove row and the days/immutability row:

```tsx
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-tier-archive text-sm font-semibold">
                Archive Tier
              </h3>
              <button
                type="button"
                onClick={() => setArchiveTier({ enabled: false })}
                className="text-muted-foreground text-xs underline"
              >
                Remove
              </button>
            </div>
            {errors?.archiveTier?.archiveFeedUnsupported ? (
              <p className="text-destructive text-xs">
                {errors.archiveTier.archiveFeedUnsupported}
              </p>
            ) : null}
            <div className="flex flex-row flex-wrap items-end gap-4">
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/simple-mode/sobr-builder.test.tsx`
Expected: all tests pass, including both new ones.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/sobr-builder.tsx src/components/simple-mode/sobr-builder.test.tsx
git commit -m "$(cat <<'EOF'
feat: surface archive-feed incompatibility message in SOBR Builder

Renders errors.archiveTier.archiveFeedUnsupported at the top of the
enabled Archive Tier block, same text-destructive inline style used
everywhere else in this card.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Full verification and push

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `npx vitest run`
Expected: all 12 test files pass, with 3 new tests in `validate-repository-config.test.ts` and 2 new tests in `sobr-builder.test.tsx` added to the total count.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no output.

- [ ] **Step 3: Lint the touched files**

Run: `npx eslint src/types/simple-mode.ts src/lib/simple-mode/validate-repository-config.ts src/lib/simple-mode/validate-repository-config.test.ts src/components/simple-mode/sobr-builder.tsx src/components/simple-mode/sobr-builder.test.tsx`
Expected: no output.

- [ ] **Step 4: Manually verify in the browser**

Start the dev server (`npm run dev -- --port 5177`) and open Simple Mode. The default Backup Path is already "Direct to Vault," and the SOBR Builder is reachable there via the "SOBR Builder" target card. Then:

1. Select "SOBR Builder" as the target repository.
2. In Performance Tier, select "Google Cloud."
3. Click "Remove" on Capacity Tier if it's enabled (default is enabled), so Capacity Tier is disabled.
4. Click "+ Add Archive Tier."
5. Confirm the message "Google Cloud doesn't support sending data directly to Archive Tier without a Capacity Tier in between. Add a Capacity Tier (with a non-Google-Cloud type), or change the Performance Tier repository type." appears under the Archive Tier heading.
6. Click "+ Add Capacity Tier" to re-enable it (default type `s3-compatible`). Confirm the message disappears.
7. In Capacity Tier, switch its type to "Google Cloud." Confirm the message reappears, now reading "Google Cloud Capacity Tier can't send data to Archive Tier. Change the Capacity Tier repository type."

Stop the dev server afterward (`pkill -f "vite --port 5177"`).

- [ ] **Step 5: Push**

```bash
git push
```
