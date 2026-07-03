---
name: Enterprise Precision
colors:
  surface: '#f6fbf3'
  surface-dim: '#d6dcd4'
  surface-bright: '#f6fbf3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f5ed'
  surface-container: '#eaefe8'
  surface-container-high: '#e4eae2'
  surface-container-highest: '#dfe4dc'
  on-surface: '#171d18'
  on-surface-variant: '#3e4940'
  inverse-surface: '#2c322d'
  inverse-on-surface: '#edf2eb'
  outline: '#6e7a70'
  outline-variant: '#bdcabe'
  surface-tint: '#007f49'
  primary: '#007f49'
  on-primary: '#ffffff'
  primary-container: '#00b159'
  on-primary-container: '#003b19'
  inverse-primary: '#52e082'
  secondary: '#42636f'
  on-secondary: '#ffffff'
  secondary-container: '#c2e5f4'
  on-secondary-container: '#466774'
  tertiary: '#93363f'
  on-tertiary: '#ffffff'
  tertiary-container: '#b24e56'
  on-tertiary-container: '#ffeeee'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#71fd9b'
  primary-fixed-dim: '#52e082'
  on-primary-fixed: '#00210b'
  on-primary-fixed-variant: '#005226'
  secondary-fixed: '#c5e8f7'
  secondary-fixed-dim: '#a9ccda'
  on-secondary-fixed: '#001f28'
  on-secondary-fixed-variant: '#294b57'
  tertiary-fixed: '#ffdada'
  tertiary-fixed-dim: '#ffb3b5'
  on-tertiary-fixed: '#40000c'
  on-tertiary-fixed-variant: '#7f2831'
  background: '#f6fbf3'
  on-background: '#171d18'
  surface-variant: '#dfe4dc'
  tier-performance: '#007f49'
  tier-capacity: '#42636f'
  tier-archive: '#505861'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-bold:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-data:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-page: 24px
  density-compact: 8px
  density-comfortable: 16px
  container-max: 1440px
---

> **v3 provenance.** This supersedes `DESIGN-v2.md`. Source of truth changes: Veeam's Stitch design tool is generating this project's actual mockups from two token files — "Enterprise Precision" (light, this file) and "Obsidian Precision" (dark, see `DESIGN-v3-dark.md`) — which now take precedence over the PRISM brand-palette reconciliation done in v2. Concretely: `secondary` moves from v2's neutral gray (`#5b5f60`) to Enterprise Precision's navy/slate (`#42636f`), and `tertiary` moves from v2's redundant-with-green (`#006d36`) to a real third hue, maroon (`#93363f`) — both sourced directly from the Stitch file, not derived. All surface/neutral tokens adopt Enterprise Precision's green-tinted values (e.g. `surface: #f6fbf3`) in place of v2's true-gray neutrals. `error` is unchanged — Enterprise Precision's own YAML doesn't touch it either; a PRISM red (`#ED2B3D`) appears only in its component-level prose for one chip variant, never promoted to the `error` token, so it isn't adopted here either.
>
> `primary`/`primary-container` (and their `-fixed`/`inverse-` siblings) are **not** taken from Enterprise Precision's YAML — that file reproduces the exact same seed-vs-computed-tone split v1 `DESIGN.md` had (`primary: #006338` is a computed tone; `#007f49`, the actual brand green, only shows up as `primary-container` and in the file's own component prose, "Primary Action: Use #007F49 for primary buttons"). v2's already-confirmed pinned pair (`primary: #007f49`, `primary-container: #00b159`) is kept as-is rather than re-inheriting that ambiguity.
>
> Three dedicated tier-color tokens are kept (not adopted from Enterprise Precision, which has none) — Performance/Capacity/Archive stay independent of `primary`/`secondary`/`tertiary` so tier coloring can't silently drift if those change again later, even though their current values happen to equal them: `tier-performance` = `primary`, `tier-capacity` = `secondary`, `tier-archive` = `#505861` (quoted directly in Enterprise Precision's own prose as the "secondary metadata" text color).
>
> Not adopted from Enterprise Precision, both deliberately: **typography** stays Inter + JetBrains Mono only (not its IBM Plex Sans headlines) — an explicit decision to avoid text reflow when toggling themes mid-presentation, unrelated to which palette is authoritative. **Spacing** keeps v2's `density-compact`/`density-comfortable` tokens (not Enterprise Precision's `xs`/`sm`/`md`/`lg`/`xl` scale, which drops density entirely) — CLAUDE.md calls the two density modes load-bearing.

## Brand & Style

This design system is engineered for enterprise-grade performance, reliability, and clarity. It targets a professional audience of IT administrators and data engineers who require a high-density, functional environment to manage critical infrastructure.

The design style is **Corporate / Modern** with a focus on systematic hierarchy and utility. It emphasizes high legibility and a balanced use of brand-specific accents within a predominantly neutral, workspace-oriented interface. The aesthetic is clean and precise, leveraging the vibrant brand palette to guide user attention and indicate system health without sacrificing professional decorum.

## Colors

The color strategy uses a **Veeam Green** primary (`#007F49`) for core actions and brand identity, supported by a navy/slate secondary (`#42636F`) that provides a sophisticated foundation for headers, sidebars, and the Capacity tier, and a maroon tertiary (`#93363F`) as a third, clearly-differentiated accent.

- **Primary Action:** `#007F49` for primary buttons and active indicators.
- **Surface Strategy:** Backgrounds use a green-tinted neutral range (`surface` through `surface-container-highest`); borders and dividers lean on `outline` (`#6E7A70`).
- **Typography (Ink):** Primary text is set in `on-surface` (`#171D18`); secondary/metadata text uses `#505861` — the same value reused below for the Archive tier accent.
- **Semantic State:** Error, warning, and success colors are strictly reserved for system status and data validation to ensure immediate user recognition.

### Tier Color Tokens

Dedicated, non-aliased tokens — kept independent of `primary`/`secondary`/`tertiary` so tier coloring can't drift if those change again later, even though today their values match:

- **Performance — `tier-performance` (#007F49):** Equal to `primary`.
- **Capacity — `tier-capacity` (#42636F):** Equal to `secondary` — the navy/slate accent, per the actual Stitch-rendered mockups.
- **Archive — `tier-archive` (#505861):** Sourced from this file's own prose ("secondary metadata" text color); a distinct medium gray, not aliased to any button/nav token.

## Typography

**Inter** is used for headlines, body, and labels — the same typeface stack as the dark theme, and the same as v2. (Enterprise Precision's own draft specifies IBM Plex Sans for headlines; that's intentionally not carried over here, since the single-typeface decision was made for a UX reason — no text reflow when toggling themes mid-presentation — independent of which file is authoritative for color.)

- **Headline Styles:** Used for page titles and modal headers. Large headlines use slightly tighter letter spacing for a more "locked-in" feel.
- **Body Styles:** `body-md` (14px) is the standard for most interface text. `body-sm` (13px) is reserved for secondary information within data tables.
- **Labels:** Uppercase labels are used for section headers within sidebars and form group titles.
- **Monospace:** **JetBrains Mono** is used for IP addresses, file paths, and storage capacity values to ensure character alignment and rapid scanning.

## Layout & Spacing

The layout employs a **Fluid-to-Fixed Grid** model. Content is contained within a 12-column grid with a maximum width of 1440px to prevent excessive line lengths on ultra-wide monitors.

- **Spacing Rhythm:** Based on a 4px baseline. Most components use 8px (small), 16px (medium), or 24px (large) increments.
- **Data Density:** Two density modes. The default is "Comfortable," but for complex utility configurations (like backup job mapping), a "Compact" mode reduces vertical padding in tables and lists by 50%.
- **Responsive Behavior:**
    - **Desktop (1024px+):** Full 12-column grid with persistent left-hand navigation.
    - **Tablet (768px - 1023px):** Navigation collapses into a rail or hamburger menu; margins reduce to 16px.
    - **Mobile (<768px):** Single column flow; complex tables switch to card-based summaries.

## Elevation & Depth

To maintain an enterprise-grade feel, depth is communicated through **Tonal Layering** and **Low-Contrast Outlines** rather than heavy shadows.

- **Surface Levels:**
    - **Level 0 (Background):** `surface` / `background` (`#F6FBF3`).
    - **Level 1 (Cards/Panels):** `surface-container-lowest` (`#FFFFFF`) with a 1px `outline-variant` border.
    - **Level 2 (Modals/Popovers):** `surface-container-lowest` with a subtle, diffused shadow (0px 4px 12px rgba(0,0,0,0.08)).
- **Depth Cues:** Active states in tables use a 2px left-border accent in Veeam Green instead of a full background color change to maintain clean vertical lines.
- **Backdrop:** Modals use a semi-transparent `on-surface` overlay (60% opacity) to focus attention.

## Shapes

The shape language is **Soft (0.25rem)**, leaning towards a more squared, professional look that maximizes internal screen real estate for data.

- **Buttons & Inputs:** Use the standard 0.25rem (4px) radius.
- **Large Containers:** Cards and main content areas use 0.5rem (8px) for `rounded-lg`.
- **Status Indicators:** Small dots and "Pill" labels for storage tiers use fully rounded corners (999px) to distinguish them from interactive buttons.

## Components

### Buttons & Actions
- **Primary:** Solid Veeam Green (`#007F49`) with white text, 4px radius. High contrast, reserved for the "final" action in a flow.
- **Secondary:** Border 1px `outline`, text `on-surface`, transparent background. Used for "Cancel" or "Back."
- **Ghost:** Text `primary`, transparent background, used for tertiary actions.

### Input Fields & Forms
- **Border:** 1px `outline`.
- **Focus:** 1px solid `primary` with a subtle 2px outer glow of the same color at 20% opacity.
- **Label:** `body-sm` in `#505861`.
- **Validation:** Clear 1px colored border for Error (Red) or Success (Green) states.
- **Toggle Switches:** Used for "Simple/Advanced" modes. The track is neutral gray when off and Veeam Green when active. Labeling should explicitly state the current mode.

### Chips & Tags
- **Informational:** Background `surface-container`, text `on-surface`.
- **Status (Success):** Background `#E1F4EC`, text `primary`.
- **Status (Error):** Background `error` at 10% opacity, text `error`.

### Data Tables
- **Header:** `surface-container-low` background, `label-bold` uppercase labels. Row hover state uses `surface-container`. 1px horizontal dividers via `outline-variant`.
- **Density:** Compact vertical padding (8px) for technical utility views.

### Storage Tier Indicators
- **Visuals:** A "Tag" style component with a left-aligned colored dot corresponding to the Tier Color (`tier-performance` / `tier-capacity` / `tier-archive`).
- **Data Visualization:** Simple horizontal bar charts within table cells to show "Space Used vs. Available," using the Tier Color for the fill.

### View Switcher
- A segmented control (Toggle Group) at the top right of configuration panels allows users to flip between "Simple" (curated settings) and "Advanced" (full granularity) modes. The "Advanced" mode should reveal extra columns in tables or additional fieldsets in forms using a subtle slide-down animation.
