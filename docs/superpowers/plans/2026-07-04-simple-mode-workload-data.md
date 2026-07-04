# Simple Mode: Workload Data Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "coming soon" Simple Mode placeholder with a real two-column page shell containing a fully functional, validated Workload Data card (the first of Simple Mode's input panels).

**Architecture:** A new `SimpleModePage` owns a 12-column page grid (per `DESIGN-v3.md`'s documented grid model) and the `WorkloadDataValues` state, passed down as props to a new controlled `WorkloadDataCard`. Validation is a pure function (`validateWorkloadData`) derived from the values on every render, not stored as separate state. Two new shadcn-style primitives (`Input`, `Label`) and one new design token (`--label`) are added to support it.

**Tech Stack:** React 19 + TypeScript (strict), Tailwind v4 (`@theme inline` tokens in `src/index.css`), shadcn/ui (`new-york` style) component conventions, Vitest + React Testing Library + `@testing-library/user-event`.

**Spec:** `docs/superpowers/specs/2026-07-04-simple-mode-workload-data-design.md`
**Related ADRs:** `docs/adr/0002-new-design-tokens-over-coincidental-reuse.md`, `docs/adr/0003-page-layout-follows-documented-grid-not-mockup-pixels.md`, `docs/adr/0004-workload-form-fields-are-strings-not-numbers.md`

---

## File Structure

```
src/
├── index.css                                       # modify — add --label token
├── types/
│   └── simple-mode.ts                              # create — WorkloadDataValues, WorkloadDataErrors, defaults
├── lib/simple-mode/
│   ├── validate-workload-data.ts                   # create
│   └── validate-workload-data.test.ts              # create
├── components/
│   ├── ui/
│   │   ├── card.tsx                                # modify — fix corner radius (rounded-xl → rounded-lg)
│   │   ├── input.tsx                               # create
│   │   └── label.tsx                               # create
│   └── simple-mode/
│       ├── workload-data-card.tsx                  # create
│       ├── workload-data-card.test.tsx             # create
│       ├── simple-mode-page.tsx                    # create
│       ├── simple-mode-page.test.tsx               # create
│       └── simple-mode-placeholder.tsx             # delete (Task 9)
├── App.tsx                                         # modify — render SimpleModePage
└── App.test.tsx                                    # modify — assert new content
```

Each task below is independently committable and leaves the test suite green.

---

### Task 1: Workload Data types and defaults

**Files:**

- Create: `src/types/simple-mode.ts`

- [ ] **Step 1: Create the types file**

```ts
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
```

Values are strings, not numbers — see `docs/adr/0004-workload-form-fields-are-strings-not-numbers.md`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/types/simple-mode.ts
git commit -m "feat: add WorkloadDataValues types and defaults for Simple Mode"
```

---

### Task 2: `validateWorkloadData`

**Files:**

- Create: `src/lib/simple-mode/validate-workload-data.ts`
- Test: `src/lib/simple-mode/validate-workload-data.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { validateWorkloadData } from "./validate-workload-data";
import type { WorkloadDataValues } from "@/types/simple-mode";

const validValues: WorkloadDataValues = {
  sourceSizeTB: "10",
  dailyChangeRatePercent: "3",
  dataReductionPercent: "50",
  yearlyGrowthPercent: "10",
  shortTermRetentionDays: "30",
  gfsWeekly: "4",
  gfsMonthly: "12",
  gfsYearly: "3",
};

describe("validateWorkloadData", () => {
  it("returns no errors for valid default values", () => {
    expect(validateWorkloadData(validValues)).toEqual({});
  });

  describe("sourceSizeTB", () => {
    it("rejects 0", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "0" })
          .sourceSizeTB,
      ).toBe("Must be greater than 0");
    });

    it("rejects negative values", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "-5" })
          .sourceSizeTB,
      ).toBe("Must be greater than 0");
    });

    it("accepts a small positive decimal", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "0.1" })
          .sourceSizeTB,
      ).toBeUndefined();
    });

    it("rejects an empty string", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "" }).sourceSizeTB,
      ).toBe("Required");
    });

    it("rejects non-numeric text", () => {
      expect(
        validateWorkloadData({ ...validValues, sourceSizeTB: "abc" })
          .sourceSizeTB,
      ).toBe("Must be a number");
    });
  });

  describe("dailyChangeRatePercent", () => {
    it("accepts the boundary values 0 and 100", () => {
      expect(
        validateWorkloadData({ ...validValues, dailyChangeRatePercent: "0" })
          .dailyChangeRatePercent,
      ).toBeUndefined();
      expect(
        validateWorkloadData({
          ...validValues,
          dailyChangeRatePercent: "100",
        }).dailyChangeRatePercent,
      ).toBeUndefined();
    });

    it("rejects a negative value", () => {
      expect(
        validateWorkloadData({ ...validValues, dailyChangeRatePercent: "-1" })
          .dailyChangeRatePercent,
      ).toBe("Must be between 0 and 100");
    });

    it("rejects a value above 100", () => {
      expect(
        validateWorkloadData({
          ...validValues,
          dailyChangeRatePercent: "101",
        }).dailyChangeRatePercent,
      ).toBe("Must be between 0 and 100");
    });
  });

  describe("dataReductionPercent", () => {
    it("accepts the boundary values 0 and 100", () => {
      expect(
        validateWorkloadData({ ...validValues, dataReductionPercent: "0" })
          .dataReductionPercent,
      ).toBeUndefined();
      expect(
        validateWorkloadData({ ...validValues, dataReductionPercent: "100" })
          .dataReductionPercent,
      ).toBeUndefined();
    });

    it("rejects a value above 100", () => {
      expect(
        validateWorkloadData({ ...validValues, dataReductionPercent: "150" })
          .dataReductionPercent,
      ).toBe("Must be between 0 and 100");
    });
  });

  describe("yearlyGrowthPercent", () => {
    it("accepts the boundary value 0", () => {
      expect(
        validateWorkloadData({ ...validValues, yearlyGrowthPercent: "0" })
          .yearlyGrowthPercent,
      ).toBeUndefined();
    });

    it("accepts values above 100 (no upper cap)", () => {
      expect(
        validateWorkloadData({ ...validValues, yearlyGrowthPercent: "250" })
          .yearlyGrowthPercent,
      ).toBeUndefined();
    });

    it("rejects a negative value", () => {
      expect(
        validateWorkloadData({ ...validValues, yearlyGrowthPercent: "-1" })
          .yearlyGrowthPercent,
      ).toBe("Must be 0 or greater");
    });
  });

  describe("shortTermRetentionDays", () => {
    it("accepts the boundary value 1", () => {
      expect(
        validateWorkloadData({ ...validValues, shortTermRetentionDays: "1" })
          .shortTermRetentionDays,
      ).toBeUndefined();
    });

    it("rejects 0", () => {
      expect(
        validateWorkloadData({ ...validValues, shortTermRetentionDays: "0" })
          .shortTermRetentionDays,
      ).toBe("Must be 1 or greater");
    });

    it("rejects a non-integer value", () => {
      expect(
        validateWorkloadData({
          ...validValues,
          shortTermRetentionDays: "1.5",
        }).shortTermRetentionDays,
      ).toBe("Must be a whole number");
    });
  });

  describe("GFS points (weekly, monthly, yearly)", () => {
    it("accepts the boundary value 0 for all three", () => {
      const result = validateWorkloadData({
        ...validValues,
        gfsWeekly: "0",
        gfsMonthly: "0",
        gfsYearly: "0",
      });
      expect(result.gfsWeekly).toBeUndefined();
      expect(result.gfsMonthly).toBeUndefined();
      expect(result.gfsYearly).toBeUndefined();
    });

    it("rejects a negative value", () => {
      expect(
        validateWorkloadData({ ...validValues, gfsWeekly: "-1" }).gfsWeekly,
      ).toBe("Must be 0 or greater");
    });

    it("rejects a non-integer value", () => {
      expect(
        validateWorkloadData({ ...validValues, gfsMonthly: "1.5" }).gfsMonthly,
      ).toBe("Must be a whole number");
    });

    it("rejects an empty value", () => {
      expect(
        validateWorkloadData({ ...validValues, gfsYearly: "" }).gfsYearly,
      ).toBe("Required");
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/simple-mode/validate-workload-data.test.ts`
Expected: FAIL — `Cannot find module './validate-workload-data'`.

- [ ] **Step 3: Write the implementation**

```ts
import type {
  WorkloadDataErrors,
  WorkloadDataValues,
} from "@/types/simple-mode";

interface NumberRules {
  integer?: boolean;
  min?: number;
  max?: number;
  exclusiveMin?: number;
}

function requireNumber(raw: string, rules: NumberRules): string | undefined {
  if (raw.trim() === "") {
    return "Required";
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return "Must be a number";
  }

  if (rules.integer && !Number.isInteger(value)) {
    return "Must be a whole number";
  }

  if (rules.exclusiveMin !== undefined && value <= rules.exclusiveMin) {
    return `Must be greater than ${rules.exclusiveMin}`;
  }

  if (rules.min !== undefined && rules.max !== undefined) {
    if (value < rules.min || value > rules.max) {
      return `Must be between ${rules.min} and ${rules.max}`;
    }
    return undefined;
  }

  if (rules.min !== undefined && value < rules.min) {
    return `Must be ${rules.min} or greater`;
  }

  return undefined;
}

export function validateWorkloadData(
  values: WorkloadDataValues,
): WorkloadDataErrors {
  const errors: WorkloadDataErrors = {};

  const sourceSizeTBError = requireNumber(values.sourceSizeTB, {
    exclusiveMin: 0,
  });
  if (sourceSizeTBError) errors.sourceSizeTB = sourceSizeTBError;

  const dailyChangeRatePercentError = requireNumber(
    values.dailyChangeRatePercent,
    { min: 0, max: 100 },
  );
  if (dailyChangeRatePercentError)
    errors.dailyChangeRatePercent = dailyChangeRatePercentError;

  const dataReductionPercentError = requireNumber(values.dataReductionPercent, {
    min: 0,
    max: 100,
  });
  if (dataReductionPercentError)
    errors.dataReductionPercent = dataReductionPercentError;

  const yearlyGrowthPercentError = requireNumber(values.yearlyGrowthPercent, {
    min: 0,
  });
  if (yearlyGrowthPercentError)
    errors.yearlyGrowthPercent = yearlyGrowthPercentError;

  const shortTermRetentionDaysError = requireNumber(
    values.shortTermRetentionDays,
    { integer: true, min: 1 },
  );
  if (shortTermRetentionDaysError)
    errors.shortTermRetentionDays = shortTermRetentionDaysError;

  const gfsWeeklyError = requireNumber(values.gfsWeekly, {
    integer: true,
    min: 0,
  });
  if (gfsWeeklyError) errors.gfsWeekly = gfsWeeklyError;

  const gfsMonthlyError = requireNumber(values.gfsMonthly, {
    integer: true,
    min: 0,
  });
  if (gfsMonthlyError) errors.gfsMonthly = gfsMonthlyError;

  const gfsYearlyError = requireNumber(values.gfsYearly, {
    integer: true,
    min: 0,
  });
  if (gfsYearlyError) errors.gfsYearly = gfsYearlyError;

  return errors;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/simple-mode/validate-workload-data.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/simple-mode/validate-workload-data.ts src/lib/simple-mode/validate-workload-data.test.ts
git commit -m "feat: add validateWorkloadData for Simple Mode workload inputs"
```

---

### Task 3: `--label` design token

**Files:**

- Modify: `src/index.css`

- [ ] **Step 1: Add the token to `:root` (light theme)**

In `src/index.css`, find this block:

```css
  --tier-performance: oklch(0.524 0.128 155.7);
  --tier-capacity: oklch(0.479 0.043 222.7);
  --tier-archive: oklch(0.457 0.018 251.3);
}
```

Replace with:

```css
  --tier-performance: oklch(0.524 0.128 155.7);
  --tier-capacity: oklch(0.479 0.043 222.7);
  --tier-archive: oklch(0.457 0.018 251.3);
  --label: oklch(0.457 0.018 251.3);
}
```

(`#505861` converted to OKLCH — see `docs/adr/0002-new-design-tokens-over-coincidental-reuse.md` for why this is a dedicated token rather than a reuse of `tier-archive`, despite the identical light-mode value.)

- [ ] **Step 2: Add the token to `[data-theme="dark"]`**

Find:

```css
  --tier-performance: oklch(0.839 0.203 151.1);
  --tier-capacity: oklch(0.827 0.088 253.4);
  --tier-archive: oklch(0.652 0.03 145.2);
}
```

Replace with:

```css
  --tier-performance: oklch(0.839 0.203 151.1);
  --tier-capacity: oklch(0.827 0.088 253.4);
  --tier-archive: oklch(0.652 0.03 145.2);
  --label: oklch(0.825 0.029 143.7);
}
```

(`#bbcbba` converted to OKLCH — this is the dark theme's `on-surface-variant` value, and is intentionally different from dark's `tier-archive`.)

- [ ] **Step 3: Wire the token into `@theme inline`**

Find:

```css
  --color-tier-performance: var(--tier-performance);
  --color-tier-capacity: var(--tier-capacity);
  --color-tier-archive: var(--tier-archive);
}
```

Replace with:

```css
  --color-tier-performance: var(--tier-performance);
  --color-tier-capacity: var(--tier-capacity);
  --color-tier-archive: var(--tier-archive);
  --color-label: var(--label);
}
```

This makes `text-label` available as a Tailwind utility class.

- [ ] **Step 4: Verify the app still builds**

Run: `npx tsc -b`
Expected: no output, exit code 0. (CSS changes aren't type-checked, but this confirms the edit didn't accidentally break anything else in the working tree.)

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat: add --label design token for form field labels"
```

---

### Task 4: `Input` UI primitive

**Files:**

- Create: `src/components/ui/input.tsx`

No dedicated test file — matches this project's existing convention for `src/components/ui/*` primitives (`button.tsx`, `card.tsx`, `toggle.tsx`, `tooltip.tsx` have no test files; only composed/business-logic components like `site-header.tsx` do).

- [ ] **Step 1: Create the component**

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "border-input text-foreground flex h-10 w-full min-w-0 rounded border bg-transparent px-3 py-2 text-sm transition-colors outline-none",
        "placeholder:text-muted-foreground",
        "focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-2",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

This implements `DESIGN-v3.md`'s Input Fields & Forms spec: 1px `outline`-token border (`border-input`), `primary`-colored 2px focus ring at 20% opacity, and a `destructive`-colored border + ring for the error state (driven by `aria-invalid`, matching the existing convention in `src/components/ui/button.tsx`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/input.tsx
git commit -m "feat: add Input UI primitive styled to DESIGN-v3 form spec"
```

---

### Task 5: `Label` UI primitive

**Files:**

- Create: `src/components/ui/label.tsx`

No dedicated test file (same rationale as Task 4).

- [ ] **Step 1: Create the component**

```tsx
import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-label text-xs font-semibold tracking-wider uppercase select-none",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
```

`@radix-ui/react-label` is already available as a transitive dependency of the `radix-ui` unified package (already a project dependency) — no new package install needed. The `text-xs uppercase tracking-wider` combination reproduces `DESIGN-v3.md`'s `label-bold` typography token (12px/16px, 600 weight, 0.05em letter-spacing) using Tailwind's default scale (`text-xs` = 12px/16px, `tracking-wider` = 0.05em) rather than adding a new typography token for it.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/label.tsx
git commit -m "feat: add Label UI primitive styled to DESIGN-v3 form spec"
```

---

### Task 6: Fix `Card`'s corner radius to match `DESIGN-v3.md`

**Files:**

- Modify: `src/components/ui/card.tsx`

`DESIGN-v3.md:180` documents "Large Containers: Cards and main content areas use 0.5rem (8px) for `rounded-lg`", but `Card` was scaffolded with `rounded-xl` (0.75rem, per `src/index.css`'s `--radius-xl`). This has been invisible so far because `Card`'s only consumer is the placeholder card being removed in Task 9 — but Task 7 below builds the first real card, and the plan's own Visual Design section (which this fixes) claims `rounded-lg`. `Card` has no other consumers today, so fixing the shared primitive directly is lower-risk than a one-off override in `WorkloadDataCard`, and prevents the same mismatch from being copied into the Vault Configuration card in a later spec.

- [ ] **Step 1: Fix the radius**

In `src/components/ui/card.tsx`, find:

```tsx
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6",
        className,
      )}
```

Replace with:

```tsx
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-lg border py-6",
        className,
      )}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "fix: correct Card corner radius to DESIGN-v3's documented rounded-lg"
```

---

### Task 7: `WorkloadDataCard`

**Files:**

- Create: `src/components/simple-mode/workload-data-card.tsx`
- Test: `src/components/simple-mode/workload-data-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkloadDataCard } from "./workload-data-card";
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type WorkloadDataValues,
} from "@/types/simple-mode";

describe("WorkloadDataCard", () => {
  it("renders all fields with their default values", () => {
    render(
      <WorkloadDataCard
        value={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/source data size/i)).toHaveValue("10");
    expect(screen.getByLabelText(/daily change rate/i)).toHaveValue("3");
    expect(screen.getByLabelText(/data reduction/i)).toHaveValue("50");
    expect(screen.getByLabelText(/yearly growth/i)).toHaveValue("10");
    expect(screen.getByLabelText(/short-term retention/i)).toHaveValue("30");
    expect(screen.getByLabelText(/gfs points weekly/i)).toHaveValue("4");
    expect(screen.getByLabelText(/gfs points monthly/i)).toHaveValue("12");
    expect(screen.getByLabelText(/gfs points yearly/i)).toHaveValue("3");
  });

  it("shows the Default 50% hint under Data Reduction", () => {
    render(
      <WorkloadDataCard
        value={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Default 50%")).toBeInTheDocument();
  });

  it("shows the GFS mini-labels beneath each box", () => {
    render(
      <WorkloadDataCard
        value={DEFAULT_WORKLOAD_DATA_VALUES}
        onChange={vi.fn()}
      />,
    );

    // The mini-labels are stored as "Weekly"/"Monthly"/"Yearly" and rendered
    // uppercase via CSS `text-transform` only — the DOM text content stays
    // mixed-case, so the assertions must be case-insensitive.
    expect(screen.getByText(/^weekly$/i)).toBeInTheDocument();
    expect(screen.getByText(/^monthly$/i)).toBeInTheDocument();
    expect(screen.getByText(/^yearly$/i)).toBeInTheDocument();
  });

  it("calls onChange with the updated value when a field is edited", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    // WorkloadDataCard is a controlled component: its <Input> value is bound
    // directly to the `value` prop, so a plain `vi.fn()` onChange (which never
    // feeds a new value back in) would make React reset the DOM's displayed
    // value after every keystroke, corrupting multi-character `user.type()`
    // input. This harness mirrors how SimpleModePage actually uses the card
    // (state lives in the parent, onChange updates it) so typing behaves as
    // a real controlled input would.
    function Harness() {
      const [value, setValue] = useState<WorkloadDataValues>(
        DEFAULT_WORKLOAD_DATA_VALUES,
      );
      return (
        <WorkloadDataCard
          value={value}
          onChange={(next) => {
            setValue(next);
            handleChange(next);
          }}
        />
      );
    }
    render(<Harness />);

    const sourceSize = screen.getByLabelText(/source data size/i);
    await user.clear(sourceSize);
    await user.type(sourceSize, "20");

    const lastCall = handleChange.mock.calls.at(-1)?.[0];
    expect(lastCall).toMatchObject({ sourceSizeTB: "20" });
  });

  it("shows an inline error and aria-invalid when a value is out of range", () => {
    render(
      <WorkloadDataCard
        value={{
          ...DEFAULT_WORKLOAD_DATA_VALUES,
          dataReductionPercent: "150",
        }}
        onChange={vi.fn()}
      />,
    );

    const field = screen.getByLabelText(/data reduction/i);
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Must be between 0 and 100")).toBeInTheDocument();
  });

  it("clears the error once the value is corrected", () => {
    const { rerender } = render(
      <WorkloadDataCard
        value={{
          ...DEFAULT_WORKLOAD_DATA_VALUES,
          dataReductionPercent: "150",
        }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Must be between 0 and 100")).toBeInTheDocument();

    rerender(
      <WorkloadDataCard
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, dataReductionPercent: "50" }}
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Must be between 0 and 100"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/data reduction/i)).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("shows an inline error on an individual GFS box", () => {
    render(
      <WorkloadDataCard
        value={{ ...DEFAULT_WORKLOAD_DATA_VALUES, gfsMonthly: "-1" }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/gfs points monthly/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("Must be 0 or greater")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/simple-mode/workload-data-card.test.tsx`
Expected: FAIL — `Cannot find module './workload-data-card'`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useId } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { validateWorkloadData } from "@/lib/simple-mode/validate-workload-data";
import type { WorkloadDataValues } from "@/types/simple-mode";

interface WorkloadDataCardProps {
  value: WorkloadDataValues;
  onChange: (value: WorkloadDataValues) => void;
}

interface WorkloadFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode: "decimal" | "numeric";
  error?: string;
  suffix?: string;
  hint?: string;
}

function WorkloadField({
  label,
  value,
  onChange,
  inputMode,
  error,
  suffix,
  hint,
}: WorkloadFieldProps) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <div className="relative">
        <Input
          id={inputId}
          value={value}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(suffix && "pr-8")}
        />
        {suffix ? (
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

interface GfsPointBoxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function GfsPointBox({ label, value, onChange, error }: GfsPointBoxProps) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div className="flex flex-1 flex-col gap-1">
      <Input
        id={inputId}
        aria-label={`GFS Points ${label}`}
        value={value}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="text-center"
      />
      <span className="text-muted-foreground text-center text-[0.65rem] tracking-wide uppercase">
        {label}
      </span>
      {error ? (
        <p id={errorId} className="text-destructive text-center text-[0.65rem]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface GfsPointsFieldProps {
  weekly: string;
  monthly: string;
  yearly: string;
  onWeeklyChange: (value: string) => void;
  onMonthlyChange: (value: string) => void;
  onYearlyChange: (value: string) => void;
  weeklyError?: string;
  monthlyError?: string;
  yearlyError?: string;
}

function GfsPointsField({
  weekly,
  monthly,
  yearly,
  onWeeklyChange,
  onMonthlyChange,
  onYearlyChange,
  weeklyError,
  monthlyError,
  yearlyError,
}: GfsPointsFieldProps) {
  const groupId = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <Label id={groupId}>GFS Points (W/M/Y)</Label>
      <div role="group" aria-labelledby={groupId} className="flex gap-2">
        <GfsPointBox
          label="Weekly"
          value={weekly}
          onChange={onWeeklyChange}
          error={weeklyError}
        />
        <GfsPointBox
          label="Monthly"
          value={monthly}
          onChange={onMonthlyChange}
          error={monthlyError}
        />
        <GfsPointBox
          label="Yearly"
          value={yearly}
          onChange={onYearlyChange}
          error={yearlyError}
        />
      </div>
    </div>
  );
}

export function WorkloadDataCard({ value, onChange }: WorkloadDataCardProps) {
  const errors = validateWorkloadData(value);

  function setField<K extends keyof WorkloadDataValues>(
    key: K,
    fieldValue: string,
  ) {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5 text-xl">
          <span aria-hidden="true" className="bg-primary size-5 rounded-full" />
          Workload Data
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-x-6 gap-y-5">
          <WorkloadField
            label="Source Data Size (TB)"
            value={value.sourceSizeTB}
            onChange={(v) => setField("sourceSizeTB", v)}
            inputMode="decimal"
            error={errors.sourceSizeTB}
          />
          <WorkloadField
            label="Daily Change Rate (%)"
            value={value.dailyChangeRatePercent}
            onChange={(v) => setField("dailyChangeRatePercent", v)}
            inputMode="decimal"
            error={errors.dailyChangeRatePercent}
            suffix="%"
          />
          <WorkloadField
            label="Data Reduction (%)"
            value={value.dataReductionPercent}
            onChange={(v) => setField("dataReductionPercent", v)}
            inputMode="decimal"
            error={errors.dataReductionPercent}
            suffix="%"
            hint="Default 50%"
          />
          <WorkloadField
            label="Yearly Growth (%)"
            value={value.yearlyGrowthPercent}
            onChange={(v) => setField("yearlyGrowthPercent", v)}
            inputMode="decimal"
            error={errors.yearlyGrowthPercent}
            suffix="%"
          />
          <WorkloadField
            label="Short-term Retention (Days)"
            value={value.shortTermRetentionDays}
            onChange={(v) => setField("shortTermRetentionDays", v)}
            inputMode="numeric"
            error={errors.shortTermRetentionDays}
          />
          <GfsPointsField
            weekly={value.gfsWeekly}
            monthly={value.gfsMonthly}
            yearly={value.gfsYearly}
            onWeeklyChange={(v) => setField("gfsWeekly", v)}
            onMonthlyChange={(v) => setField("gfsMonthly", v)}
            onYearlyChange={(v) => setField("gfsYearly", v)}
            weeklyError={errors.gfsWeekly}
            monthlyError={errors.gfsMonthly}
            yearlyError={errors.gfsYearly}
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/simple-mode/workload-data-card.test.tsx`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/workload-data-card.tsx src/components/simple-mode/workload-data-card.test.tsx
git commit -m "feat: add WorkloadDataCard with inline validation"
```

---

### Task 8: `SimpleModePage`

**Files:**

- Create: `src/components/simple-mode/simple-mode-page.tsx`
- Test: `src/components/simple-mode/simple-mode-page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SimpleModePage } from "./simple-mode-page";

describe("SimpleModePage", () => {
  it("renders the Workload Data card and a reserved sidebar region", () => {
    render(<SimpleModePage />);

    expect(screen.getByText("Workload Data")).toBeInTheDocument();
    expect(
      screen.getByTestId("simple-mode-sidebar-placeholder"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/simple-mode/simple-mode-page.test.tsx`
Expected: FAIL — `Cannot find module './simple-mode-page'`.

- [ ] **Step 3: Write the implementation**

```tsx
import { useState } from "react";
import { WorkloadDataCard } from "./workload-data-card";
import {
  DEFAULT_WORKLOAD_DATA_VALUES,
  type WorkloadDataValues,
} from "@/types/simple-mode";

export function SimpleModePage() {
  const [workloadData, setWorkloadData] = useState<WorkloadDataValues>(
    DEFAULT_WORKLOAD_DATA_VALUES,
  );

  return (
    <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-6 p-6 lg:grid-cols-12">
      <div className="lg:col-span-8">
        <WorkloadDataCard value={workloadData} onChange={setWorkloadData} />
      </div>
      <div className="lg:col-span-4">
        <div
          data-testid="simple-mode-sidebar-placeholder"
          className="border-border h-full min-h-40 rounded-lg border border-dashed"
        />
      </div>
    </div>
  );
}
```

This is the two-column grid documented in `docs/adr/0003-page-layout-follows-documented-grid-not-mockup-pixels.md`: 8 of 12 columns for Workload Data, 4 for the (currently empty) sidebar placeholder, collapsing to a single stacked column below the `lg` breakpoint.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/simple-mode/simple-mode-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/simple-mode/simple-mode-page.tsx src/components/simple-mode/simple-mode-page.test.tsx
git commit -m "feat: add SimpleModePage with two-column page shell"
```

---

### Task 9: Wire `SimpleModePage` into `App`

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Delete: `src/components/simple-mode/simple-mode-placeholder.tsx`

- [ ] **Step 1: Update the failing assertion in `App.test.tsx` first**

Replace the full contents of `src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the header title and the Workload Data card", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /veeam data cloud vault sizer/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Workload Data")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — the current `App` still renders `SimpleModePlaceholder`, so "Workload Data" isn't found.

- [ ] **Step 3: Update `App.tsx`**

Replace the full contents of `src/App.tsx`:

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { SimpleModePage } from "@/components/simple-mode/simple-mode-page";

function App() {
  return (
    <AppShell>
      <SimpleModePage />
    </AppShell>
  );
}

export default App;
```

- [ ] **Step 4: Delete the placeholder**

Run: `git rm src/components/simple-mode/simple-mode-placeholder.tsx`

- [ ] **Step 5: Run the full test suite to verify everything passes**

Run: `npx vitest run`
Expected: PASS — all test files green, no leftover references to the deleted placeholder.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: wire SimpleModePage into App, replacing the Simple Mode placeholder"
```

(The `git rm` in Step 4 already staged the deletion — it will be included in this commit.)

---

### Task 10: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm run test:run`
Expected: all tests pass.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no output, exit code 0.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Visual check against the approved mockup**

Run: `npm run dev`, open the printed local URL, and confirm against the two approved brainstorming mockups (`.superpowers/brainstorm/*/content/layout-grid.html` and `gfs-subfields.html`) and `screen.png`:

- The Workload Data card renders in a left column, with an empty dashed placeholder box to its right (reserved sidebar region).
- The card's corner radius reads as the smaller `rounded-lg` (0.5rem) fixed in Task 6, not the larger pre-existing `rounded-xl` (0.75rem).
- The 6 fields are arranged in a 3-column grid, two rows.
- Data Reduction shows the "Default 50%" hint.
- The three GFS Points boxes each show a WEEKLY / MONTHLY / YEARLY mini-label beneath them.
- Typing an out-of-range value (e.g. 150 into Data Reduction) shows a red border and an error message; clearing it back to a valid value removes the error.
- Toggle the theme (light/dark/system) via the header and confirm the card, labels, and inputs all remain legible and correctly styled in both themes.
- Resize the browser below ~1024px and confirm the grid collapses to a single column (Workload Data stacked above the sidebar placeholder).

No commit for this task — it's a verification gate. If any check fails, fix the underlying issue in the relevant earlier task's files and re-run the full suite before moving on (e.g. to a PR).
