---
name: Obsidian Precision
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#bbcbba'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#859585'
  outline-variant: '#3c4a3d'
  surface-tint: '#00d15f'
  primary: '#00d15f'
  on-primary: '#003918'
  primary-container: '#42ee82'
  on-primary-container: '#005326'
  inverse-primary: '#007f49'
  secondary: '#9ecaff'
  on-secondary: '#003258'
  secondary-container: '#1e95f2'
  on-secondary-container: '#002b4d'
  tertiary: '#ffc4af'
  on-tertiary: '#591c01'
  tertiary-container: '#ff9d76'
  on-tertiary-container: '#783214'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#63ff95'
  primary-fixed-dim: '#30e378'
  on-primary-fixed: '#00210b'
  on-primary-fixed-variant: '#005225'
  secondary-fixed: '#d1e4ff'
  secondary-fixed-dim: '#9ecaff'
  on-secondary-fixed: '#001d36'
  on-secondary-fixed-variant: '#00497d'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb599'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#773213'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  tier-performance: '#00d15f'
  tier-capacity: '#57e0ff' # PRISM palette, Blue row (confirmed). Brighter/more saturated than the light-theme tier-capacity by design, for legibility as an accent against a near-black surface (mirrors how primary goes from #007f49 in light to #00d15f in dark)
  tier-archive: '#adacaf'
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
  container-margin-desktop: 32px
  container-margin-mobile: 16px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

> **v2 provenance.** This supersedes `DESIGN-dark.md`, as the dark-theme counterpart to `DESIGN-v2.md`. Changes from v1: (1) `primary`/`surface-tint` move to `#00d15f`, an exact PRISM Green swatch (v1's `#42ee82` wasn't an approved PRISM color at all — the two closest v1 greens in the PRISM row, `#32f26f` and `#9cffa3`, are explicitly labeled "Not part of PRISM"). `inverse-primary` is updated to `#007f49` to match the new light-theme `primary`, since that's what the token conceptually represents. Moving `primary` alone would have collapsed `primary`/`primary-container` into near-identical greens (`#00d15f` vs. v1's `#00d169` — a 10-point difference in one channel), so `primary-container` is reassigned to v1's old primary value, `#42ee82`, restoring a visible tonal step. (2) Typography is now identical to `DESIGN-v2.md` — Inter + JetBrains Mono only, matching sizes/weights — replacing v1's separate Hanken Grotesk (headlines) / Geist (labels) identity, per an explicit decision to keep typography theme-agnostic so switching themes mid-presentation doesn't reflow text. This also fixes a v1 gap: the old typography block was missing `body-sm`, `label-bold`, and `mono-data` entirely, so JetBrains Mono had no defined role in dark mode. (3) Three dedicated tier-color tokens are added, parallel to `DESIGN-v2.md` — v1 had no tier-color guidance of any kind for dark mode; all three hexes are confirmed against the source PRISM palette. Not touched in this pass: the prose in `DESIGN-dark.md`'s Colors section says background is "#121212," which doesn't match the YAML's `#131313` — a pre-existing v1 inconsistency, out of scope here.

## Brand & Style

The design system is engineered for high-performance enterprise environments, specifically tailored for data management and infrastructure monitoring. The brand personality is authoritative, resilient, and technically sophisticated. It aims to evoke a sense of absolute reliability and clarity amidst complex data sets.

The visual style follows a **Modern Corporate** aesthetic with a heavy emphasis on **Tonal Layering**. It prioritizes functional density and information hierarchy. By utilizing a sophisticated dark mode, the UI reduces eye strain for power users in low-light environments while highlighting critical system statuses through vibrant accent hits. The aesthetic is clean and structured, favoring precision over decoration.

## Colors

This design system utilizes a "Deep Slate" dark theme as its primary mode. The palette is anchored by a deep charcoal background to minimize glare and maximize the impact of the **Veeam Green** primary accent (`#00d15f`, an exact PRISM swatch — brighter than the light theme's `#007f49` for legibility against a near-black surface).

Hierarchy is established through tonal shifts rather than dramatic color changes. Primary actions use the high-vibrancy green to ensure quick visual recognition. Secondary elements use subtle grays for outlines and borders to maintain container separation without creating visual noise. Text contrast is strictly managed, using off-whites for primary reading and muted grays for secondary metadata.

### Tier Color Tokens

Dedicated, non-aliased tokens, parallel to `DESIGN-v2.md`'s light-theme set:

- **Performance — `tier-performance` (#00d15f):** Equal to `primary`.
- **Capacity — `tier-capacity` (#57e0ff):** A bright PRISM cyan, chosen for contrast against the dark surface — the analogous relationship to the light theme's deep-blue `tier-capacity` as `primary`'s `#00d15f` is to `#007f49`.
- **Archive — `tier-archive` (#adacaf):** Sourced from the PRISM Neutral Family; brighter than `outline` (`#859585`) for use as a standalone accent rather than a border.

## Typography

Typography is systematic and functional, and deliberately **the same typeface stack as the light theme** — **Inter** for headlines, body, and labels, **JetBrains Mono** for IP addresses, file paths, and storage capacity values. Only color, surface, and elevation tokens change between themes; text metrics stay identical so toggling themes mid-presentation never reflows a layout.

## Layout & Spacing

The system employs a **12-column fluid grid** for desktop and a **4-column grid** for mobile. A strict 4px base unit governs all spatial relationships, creating a predictable and logical rhythm.

Layouts favor high information density. Gutters are kept tight at 16px to maximize the screen real estate available for data visualization. Content reflows by collapsing sidebars into drawers on mobile, and data tables transition into cards or horizontally scrolling containers.

## Elevation & Depth

In this dark-mode design system, elevation is conveyed through **Tonal Layers** rather than heavy drop shadows. Higher elevation levels are represented by lighter surface colors (Surface-bright) to simulate proximity to a light source.

When shadows are used, they are subtle, low-opacity (#000000 at 30%) with a wide blur radius, primarily to separate modals and floating menus from the base layers. Borders are used sparingly; they are 1px solid lines in `outline` color to define boundaries without adding visual weight.

## Shapes

The shape language is "Soft" and professional. A standard radius of 4px (`0.25rem`) is applied to buttons and input fields to maintain a disciplined, engineering-focused look. Larger containers like cards use 8px (`0.5rem`) to provide enough visual distinction between the layout structure and individual interactive elements. This subtle rounding softens the technical edge of the interface without making it appear overly consumer-oriented.

## Components

### Buttons
Primary buttons use the vibrancy of the Primary Green with black text for maximum punch. Ghost buttons use the `outline` color for borders and `on-surface` for text, providing a clear hierarchy for secondary actions.

### Cards
Cards are built using `surface-container-low` to pop against the `surface` background. They do not use shadows by default, relying instead on the 1px `outline` for definition.

### Input Fields
Inputs use `surface-dim` for the field background with a subtle `outline` border. On focus, the border transitions to Primary Green. Helper text and labels follow the `on-surface-variant` color.

### Chips & Lists
Chips utilize `surface-container-high` for a tactile feel. Lists use a subtle `surface-bright` highlight on hover to provide clear interactive feedback.

### Status Indicators
Given the monitoring focus, status indicators (Error, Warning, Success) must be high-contrast. Use semantic colors that are adjusted for the dark background to ensure they remain accessible and distinctive.
