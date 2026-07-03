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
  surface-tint: '#30e378'
  primary: '#42ee82'
  on-primary: '#003918'
  primary-container: '#00d169'
  on-primary-container: '#005326'
  inverse-primary: '#006d34'
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
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
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
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
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

> **Superseded.** This file is kept for history. `DESIGN-v3-dark.md` is canonical (via `DESIGN-v2-dark.md`) — see its "v3 provenance" note for what changed and why.

## Brand & Style

The design system is engineered for high-performance enterprise environments, specifically tailored for data management and infrastructure monitoring. The brand personality is authoritative, resilient, and technically sophisticated. It aims to evoke a sense of absolute reliability and clarity amidst complex data sets.

The visual style follows a **Modern Corporate** aesthetic with a heavy emphasis on **Tonal Layering**. It prioritizes functional density and information hierarchy. By utilizing a sophisticated dark mode, the UI reduces eye strain for power users in low-light environments while highlighting critical system statuses through vibrant accent hits. The aesthetic is clean and structured, favoring precision over decoration.

## Colors

This design system utilizes a "Deep Slate" dark theme as its primary mode. The palette is anchored by a deep charcoal background (#121212) to minimize glare and maximize the impact of the **Veeam Green** primary accent.

Hierarchy is established through tonal shifts rather than dramatic color changes. Primary actions use the high-vibrancy green to ensure quick visual recognition. Secondary elements use subtle grays for outlines and borders to maintain container separation without creating visual noise. Text contrast is strictly managed, using off-whites for primary reading and muted grays for secondary metadata.

## Typography

Typography is systematic and functional. **Hanken Grotesk** provides a sharp, contemporary feel for headlines, while **Inter** ensures maximum legibility for body content and data tables. **Geist** is reserved for labels and technical data, leveraging its monospaced-adjacent metrics for precise alignment in dashboards.

In the dark theme, font weights are slightly adjusted to prevent "light bleed" (irradiation), ensuring that high-contrast text remains crisp. Headlines use tighter tracking to maintain a strong presence, while labels use expanded tracking for better scannability at small sizes.

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