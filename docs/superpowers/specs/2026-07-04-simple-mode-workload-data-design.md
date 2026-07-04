# Simple Mode: Workload Data Card Design

Date: 2026-07-04

## Purpose

Build the first real slice of the Simple Mode calculator: the **Workload Data** card (the 6 workload inputs), plus the page shell it will live in. This replaces the "coming soon" placeholder from the project scaffold pass.

This is deliberately the smallest slice that still avoids layout rework later: rather than building every input field and then reworking proportions once the Vault Configuration card and results sidebar are added, the real two-column page grid is stood up now, with only Workload Data populated.

## Scope

**In scope:**

- The Simple Mode page shell: a 12-column grid capped at `max-w-[1440px]` (matching `DESIGN-v3.md`'s documented `container-max` grid model, not just `screen.png`'s pixel proportions) — the Workload Data column spans 8 of 12 columns, and a reserved (empty) region for the future Projected Sizing sidebar spans the remaining 4. Below the `lg` (1024px) breakpoint — matching `DESIGN-v3.md`'s documented Desktop threshold — the grid collapses to a single column, with Workload Data stacked above the sidebar placeholder.
- The Workload Data card: all 6 fields (Source Data Size, Daily Change Rate, Data Reduction, Yearly Growth, Short-term Retention, GFS Points W/M/Y), fully functional with local state and inline validation.
- Adding `Input`/`Label` shadcn primitives (not yet present in this project) and styling them to `DESIGN-v3.md`'s Input Fields & Forms spec.
- Adding a `--label` design token to `src/index.css` (see Visual Design below) — the first token addition since the `tier-*` tokens.

**Out of scope (deferred to follow-up specs):**

- The Vault Configuration card (backup path, target repository, SOBR tier builder).
- Any content in the Projected Sizing sidebar — it's an empty placeholder region in this pass, reserving space only.
- Mapping Workload Data values to a `VmAgentRequest`, calling the sizing API, or rendering results.
- Advanced Mode.

## Visual Design (validated via mockup)

Three visual decisions were validated interactively before writing this spec:

1. **Field grid layout**: 3-column grid within the card, two rows of three fields each — matches `screen.png` exactly (rejected 2-column and single-column-stacked alternatives, which either wasted horizontal space or made the card too tall relative to its final container).
2. **GFS Points sub-field labeling**: the three GFS boxes (Weekly/Monthly/Yearly counts) each get a tiny, low-contrast mini-label directly beneath them (`WEEKLY` / `MONTHLY` / `YEARLY`), in addition to the shared "GFS Points (W/M/Y)" label above the group. This removes any ambiguity about box order during a live customer demo — the alternative (a letter badge inside each box) was considered and rejected as visually noisier for the same clarity gain.
3. **Page shell now, not later**: the real two-column grid (final-width left column + placeholder sidebar region) is built in this pass, even though the sidebar has no content yet — this is what avoids the layout-reflow rework the whole phasing decision is trying to prevent.

Card-level visual details (from `DESIGN-v3.md`, already validated in the mockup): card uses `surface-container-lowest` background with a 1px `outline-variant` border and `rounded-lg` (0.5rem) corners; field labels are uppercase, tracked, `body-sm`-sized text in the label color; inputs use a 1px `outline` border and `rounded` (0.25rem) corners; percentage fields show a `%` suffix inside the input; Data Reduction keeps its "Default 50%" hint text beneath the field.

### Design token mapping (resolved during review)

`src/index.css`'s `@theme inline` block only wires up a subset of `DESIGN-v3.md`'s named colors (`background`, `card`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, plus the `tier-*` tokens) — checking their computed OKLCH values against `DESIGN-v3.md`/`DESIGN-v3-dark.md`'s hex values confirms three of them already map exactly to the names this spec uses, with one gap:

- `bg-card` = `surface-container-lowest` exactly (light `#ffffff` / dark `#0e0e0e`). Use as-is for the card background.
- `border-border` = `outline-variant` exactly (light `#bdcabe` / dark `#3c4a3d`). Use as-is for the card's outer border.
- `border-input` = `outline` exactly (light `#6e7a70` / dark `#859585`). Use as-is for input borders.
- **No existing token matches the field label color.** `DESIGN-v3.md` states labels are `#505861`, which is coincidentally identical to the `tier-archive` token's light-mode value (`DESIGN-v3.md`'s own provenance notes call this an equality of value, not identity — tier-archive "happens to equal" the generic secondary-text color). Reusing `text-tier-archive` would be semantically wrong and would break in dark mode: `DESIGN-v3-dark.md` explicitly states "Helper text and labels follow the `on-surface-variant` color" (line 173), which is a _different_ token from dark's `tier-archive` (`outline`, `#859585`) — dark's `on-surface-variant` is `#bbcbba`, which already matches this project's existing `--muted-foreground` computed value exactly.
  - **Resolution:** add a new `--label` token to `src/index.css`, parallel to how `tier-performance`/`tier-capacity`/`tier-archive` were added: `--label: #505861` (light), `--label: #bbcbba` (dark). Use `text-label` for the main field labels. This keeps the codebase's no-raw-hex styling discipline intact (every other component uses token classes only, e.g. `button.tsx`) and avoids the dark-mode bug that reusing `tier-archive` would introduce.
- **GFS mini-labels and the "Default 50%" hint text** use the existing `text-muted-foreground` token (already used for this "secondary, de-emphasized text" role elsewhere, e.g. `CardDescription` in `card.tsx`) — a distinct, subtler treatment from the new `text-label` used for main field labels.

## Component Structure

```
src/components/simple-mode/
├── simple-mode-page.tsx        # new — page shell + state ownership
├── workload-data-card.tsx      # new — the form card
└── simple-mode-placeholder.tsx # removed, replaced by simple-mode-page.tsx
```

- **`simple-mode-page.tsx`**: owns the grid layout (`grid grid-cols-1 lg:grid-cols-12 max-w-[1440px] mx-auto`, Workload Data in a `lg:col-span-8` region, sidebar placeholder in `lg:col-span-4`) and the `WorkloadDataValues` state (`useState`, initialized to the defaults below). Renders `<WorkloadDataCard value={...} onChange={setValues} />` in the left column, and an empty placeholder box in the sidebar region (visually reserving the space — no functional content). Rendered by `App.tsx` in place of `SimpleModePlaceholder`.
- **`workload-data-card.tsx`**: a **controlled** component — `value: WorkloadDataValues`, `onChange: (value: WorkloadDataValues) => void`. Holds no state of its own. Renders the 3-column field grid, including the GFS Points 3-box sub-group with mini-labels. Derives validation errors from `value` on every render (see below) and shows the error border + message per invalid field. Each field also sets `aria-invalid` and `aria-describedby` (pointing at the error message's `id`) when its error is present.

State is lifted to `simple-mode-page.tsx` rather than kept inside the card. These values will need to feed a `VmAgentRequest` once Vault Configuration and results are built in a later spec — lifting now costs nothing and avoids re-plumbing the component boundary later.

Validation is a **pure function**, not component state:

```
src/lib/simple-mode/validate-workload-data.ts
  validateWorkloadData(values: WorkloadDataValues): WorkloadDataErrors

type WorkloadDataErrors = Partial<Record<keyof WorkloadDataValues, string>>;
```

`WorkloadDataErrors` holds one optional string per field — the error message itself (e.g. `"Must be between 0 and 100"`) — with the key absent entirely when that field is valid. `WorkloadDataCard` can do `errors.sourceSizeTB` as both the boolean check and the message text in one lookup; the three GFS fields stay flat, independent keys, matching how they're already modeled on `WorkloadDataValues`.

This keeps `WorkloadDataCard` simple (render `value`, call `onChange`, display whatever `validateWorkloadData(value)` returns) and makes the validation rules independently unit-testable without rendering anything.

`Input` and `Label` primitives don't exist yet in `src/components/ui/` (only `button`, `card`, `toggle-group`, `toggle`, `tooltip` do) — they get added the same way those were (shadcn CLI, `new-york` style) and then restyled to this project's tokens rather than left at shadcn's neutral defaults.

## Data Model, Defaults & Validation Rules

```ts
interface WorkloadDataValues {
  sourceSizeTB: string;
  dailyChangeRatePercent: string;
  dataReductionPercent: string;
  yearlyGrowthPercent: string;
  shortTermRetentionDays: string;
  gfsWeekly: string;
  gfsMonthly: string;
  gfsYearly: string;
}
```

**Fields are raw strings, not numbers** (resolved during review). A controlled text input needs to represent states a `number` can't hold — a field cleared to retype, a lone `-` or decimal point mid-entry (e.g. "10." before "10.5"), non-numeric paste — and `onChange` fires on every keystroke, so there's no legal `number` to hand back during those transient states without coercing to `0`/`NaN` (which either fails validation confusingly mid-type or silently "succeeds" while blank). Storing the as-typed string sidesteps this entirely: `validateWorkloadData` parses each field internally to apply its rule, and the later `VmAgentRequest`-mapping step (a follow-up spec) parses again at that boundary.

Defaults mirror `screen.png` exactly (shown here as numbers for readability; stored as the string form, e.g. `"10"`):

| Field                       | Default | Rule                      |
| --------------------------- | ------- | ------------------------- |
| Source Data Size (TB)       | 10      | number > 0                |
| Daily Change Rate (%)       | 3       | number, 0–100             |
| Data Reduction (%)          | 50      | number, 0–100             |
| Yearly Growth (%)           | 10      | number ≥ 0 (no upper cap) |
| Short-term Retention (Days) | 30      | integer ≥ 1               |
| GFS Points — Weekly         | 4       | integer ≥ 0               |
| GFS Points — Monthly        | 12      | integer ≥ 0               |
| GFS Points — Yearly         | 3       | integer ≥ 0               |

Rules are deliberately permissive: this tool runs live in front of customers, so a rule that rejects a legitimate value mid-demo is worse than one that's slightly loose. Yearly Growth has no upper bound (a customer's data could plausibly grow >100%/year); the only hard ceilings are the two percentage fields that are logically capped at 100 (change rate, data reduction).

Validation behavior (confirmed): values are **never auto-corrected or clamped**. An invalid value is kept exactly as typed, and the field shows the design system's error state — a red border plus a short message beneath the field (e.g. "Must be between 0 and 100", "Must be a whole number", "Required") — until the user corrects it. Empty or non-numeric input shows a "Required" / "Must be a number" message. See `WorkloadDataErrors` above for the return shape.

## Testing

- `validate-workload-data.test.ts` — unit tests for the pure validation function: boundary values (0, 100, 1), invalid values (negative, >100 where capped, non-integer where an integer is required), non-numeric/empty input, one test per field.
- `workload-data-card.test.tsx` — renders with default values; typing in a field calls `onChange` with the updated value; entering an invalid value shows the error border and message and sets `aria-invalid`/`aria-describedby`; correcting it clears the error and those attributes.
- `simple-mode-page.test.tsx` — light composition test: the grid renders, `WorkloadDataCard` is present in the left column, the sidebar placeholder region is present.
- `App.test.tsx` (existing file, updated) — its current assertion on the old "Simple Mode calculator — coming soon" placeholder text no longer holds once `simple-mode-placeholder.tsx` is removed; swap it for a check on stable new-page content (e.g. the "Workload Data" card heading), keeping this as a thin smoke test that `App` wires in the right component.

## Input type & inputMode (resolved during review)

All six fields use `<Input type="text" inputMode={...} />`, never native `type="number"` — native number inputs intercept trackpad/mousewheel scroll (which can silently alter a value while an SE scrolls the page mid-demo) and strip/normalize characters (leading zeros, `e`, `+`) inconsistently across browsers. `type="text"` avoids all of that while `inputMode` still brings up the correct numeric keyboard on mobile/tablet.

`inputMode` is set per field to match the integer-vs-decimal split already established in the Data Model table above, not applied uniformly:

- `inputMode="decimal"` — `sourceSizeTB`, `dailyChangeRatePercent`, `dataReductionPercent`, `yearlyGrowthPercent` (all allow a decimal point per their rules).
- `inputMode="numeric"` — `shortTermRetentionDays`, `gfsWeekly`, `gfsMonthly`, `gfsYearly` (all integer-only per their rules; `numeric` omits the decimal key from the mobile keypad).

No `pattern` attribute is used. `pattern` only produces visible behavior via a `<form>`'s submit-triggered `reportValidity()`, and neither this component nor anything else in this codebase wraps these fields in a `<form>` — Workload Data has no submit step, it's a live, always-controlled input set. Without a form, `pattern` would only set the element's inert `validity.patternMismatch`/`:invalid` state, which nothing here reads; the actual error UI is `validateWorkloadData` plus the `aria-invalid`/`aria-describedby` wiring already specified above. A single shared pattern would also be less accurate than that function — it can't express the integer-only rule per field without becoming four different patterns, duplicating logic `validateWorkloadData` already owns correctly.

## Explicitly deferred to the implementation plan

The following are intentionally left unresolved here, since they're implementation details more likely to shift once someone is actually wiring the component up, and pinning them down prematurely would clutter this spec:

- Whether a shared field sub-component gets extracted for the 6 repeated label+input+error blocks, or whether they stay inline in `workload-data-card.tsx`.
- Exact per-field `step` values for any spinner affordance.
