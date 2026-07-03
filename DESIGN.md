---
name: V-Series Utility System
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#3d4a3e'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#6d7b6d'
  outline-variant: '#bccabb'
  surface-tint: '#006d34'
  primary: '#006d34'
  on-primary: '#ffffff'
  primary-container: '#00b159'
  on-primary-container: '#003b19'
  inverse-primary: '#52e082'
  secondary: '#5b5f60'
  on-secondary: '#ffffff'
  secondary-container: '#e0e3e4'
  on-secondary-container: '#616566'
  tertiary: '#006d36'
  on-tertiary: '#ffffff'
  tertiary-container: '#40ae66'
  on-tertiary-container: '#003b1a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#71fd9b'
  primary-fixed-dim: '#52e082'
  on-primary-fixed: '#00210b'
  on-primary-fixed-variant: '#005226'
  secondary-fixed: '#e0e3e4'
  secondary-fixed-dim: '#c4c7c8'
  on-secondary-fixed: '#181c1d'
  on-secondary-fixed-variant: '#434748'
  tertiary-fixed: '#8cf9a9'
  tertiary-fixed-dim: '#70dc8f'
  on-tertiary-fixed: '#00210c'
  on-tertiary-fixed-variant: '#005227'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
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

## Brand & Style

This design system is engineered for enterprise-grade data management and utility tools. It bridges the gap between high-density technical interfaces and intuitive user experiences. The brand personality is **authoritative, precise, and resilient**, reflecting the mission-critical nature of backup and recovery operations.

The aesthetic follows a **Modern Corporate** approach with a focus on high-fidelity functionalism. It prioritizes clarity over decoration, using whitespace to define information architecture and subtle borders to manage data density. The interface should feel like a precision instrument—stable, predictable, and exceptionally organized.

Key attributes:
- **Trustworthiness:** Achieved through a stable color palette and rigorous alignment.
- **Efficiency:** Designed for "power users" who require quick access to complex settings without cognitive overload.
- **Clarity:** Distinct visual separation between global navigation, configuration panels, and data-heavy tables.

## Colors

The palette is anchored by **Veeam Green**, used strategically for primary actions, success states, and key brand touchpoints. 

- **Primary (#00B159):** Used for CTA buttons, active toggle states, and "Healthy" status indicators.
- **Secondary/Text (#2D3132):** A deep slate used for high-contrast typography and primary navigation backgrounds to provide a grounded, professional foundation.
- **Neutral/Background (#F4F4F4):** A clean, light gray for application backgrounds to reduce eye strain and provide contrast against white component surfaces.
- **Tier Indicators:** 
    - **Performance:** Brand Green, signifying speed and availability.
    - **Capacity:** Deep Blue, signifying stability and scale.
    - **Archive:** Medium Gray, signifying cold/dormant storage.

## Typography

This design system utilizes **Inter** for its exceptional legibility in technical contexts. The hierarchy is tight, designed to support high data density.

- **Headline Styles:** Used for page titles and modal headers. Large headlines use slightly tighter letter spacing for a more "locked-in" feel.
- **Body Styles:** `body-md` (14px) is the standard for most interface text. `body-sm` (13px) is reserved for secondary information within data tables.
- **Labels:** Uppercase labels are used for section headers within sidebars and form group titles.
- **Monospace:** **JetBrains Mono** is introduced specifically for IP addresses, file paths, and storage capacity values to ensure character alignment and rapid scanning.

## Layout & Spacing

The layout employs a **Fluid-to-Fixed Grid** model. Content is contained within a 12-column grid with a maximum width of 1440px to prevent excessive line lengths on ultra-wide monitors.

- **Spacing Rhythm:** Based on a 4px baseline. Most components use 8px (small), 16px (medium), or 24px (large) increments.
- **Data Density:** The design system supports two density modes. The default is "Comfortable," but for complex utility configurations (like backup job mapping), a "Compact" mode reduces vertical padding in tables and lists by 50%.
- **Responsive Behavior:** 
    - **Desktop (1024px+):** Full 12-column grid with persistent left-hand navigation.
    - **Tablet (768px - 1023px):** Navigation collapses into a rail or hamburger menu; margins reduce to 16px.
    - **Mobile (<768px):** Single column flow; complex tables switch to card-based summaries.

## Elevation & Depth

To maintain an enterprise-grade feel, depth is communicated through **Tonal Layering** and **Low-Contrast Outlines** rather than heavy shadows.

- **Surface Levels:** 
    - **Level 0 (Background):** #F4F4F4.
    - **Level 1 (Cards/Panels):** #FFFFFF with a 1px border (#E0E0E0).
    - **Level 2 (Modals/Popovers):** #FFFFFF with a subtle, diffused shadow (0px 4px 12px rgba(0,0,0,0.08)).
- **Depth Cues:** Active states in tables use a 2px left-border accent in Veeam Green instead of a full background color change to maintain clean vertical lines.
- **Backdrop:** Modals use a semi-transparent #2D3132 (60% opacity) overlay to focus attention.

## Shapes

The shape language is **Soft (0.25rem)**, leaning towards a more squared, professional look that maximizes internal screen real estate for data.

- **Buttons & Inputs:** Use the standard 0.25rem (4px) radius.
- **Large Containers:** Cards and main content areas use 0.5rem (8px) for `rounded-lg`.
- **Status Indicators:** Small dots and "Pill" labels for storage tiers use fully rounded corners (999px) to distinguish them from interactive buttons.

## Components

### Buttons & Actions
- **Primary:** Solid Veeam Green (#00B159) with white text. High contrast, reserved for the "final" action in a flow.
- **Secondary:** Transparent background with #2D3132 border and text. Used for "Cancel" or "Back."
- **Ghost:** No border or background until hover. Used for table row actions.

### Data Tables
- **Header:** Light gray background (#F8F9FA), 12px bold uppercase labels.
- **Rows:** 1px bottom border (#E0E0E0). Hover state triggers a subtle #F0FFF4 (Green tint) background.
- **Density:** Compact vertical padding (8px) for technical utility views.

### Input Fields & Forms
- **Validation:** Clear 1px colored border for Error (Red) or Success (Green) states.
- **Labels:** Positioned above the field, never as placeholder text.
- **Toggle Switches:** Used for "Simple/Advanced" modes. The track is neutral gray when off and Veeam Green when active. Labeling should explicitly state the current mode.

### Storage Tier Indicators
- **Visuals:** A "Tag" style component with a left-aligned colored dot corresponding to the Tier Color (Performance/Capacity/Archive).
- **Data Visualization:** Simple horizontal bar charts within table cells to show "Space Used vs. Available," using the Tier Color for the fill.

### View Switcher
- A segmented control (Toggle Group) at the top right of configuration panels allows users to flip between "Simple" (curated settings) and "Advanced" (full granularity) modes. The "Advanced" mode should reveal extra columns in tables or additional fieldsets in forms using a subtle slide-down animation.