# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is pre-implementation: it currently contains only planning and design artifacts, no application code, `package.json`, or build tooling. There are no build, lint, or test commands to run yet. When scaffolding the project, confirm the framework/stack with the user rather than assuming one — `.gitignore` has broad JS-ecosystem entries (Next.js, Nuxt, Vite, vitepress, etc.) but none of these are configured or committed.

Before writing any code, read these files in full — they are the spec this project is built against, and they win over anything summarized below if they ever disagree:

- `veeam_vault_sizer_project_brief.md` — functional requirements
- `DESIGN-v3.md` (light) / `DESIGN-v3-dark.md` (dark) — design system, superseding `DESIGN-v2.md`/`DESIGN-v2-dark.md` and `DESIGN.md`/`DESIGN-dark.md` (YAML frontmatter has machine-readable tokens: colors, typography, spacing, radii; prose below it explains usage). These track the token files ("Enterprise Precision" / "Obsidian Precision") that Veeam's Stitch design tool actually generates mockups from — treat Stitch as the source of truth for color tokens over any other palette reference.
- `screen.png` — reference mockup of the Simple Mode UI

## What this project is

A high-density enterprise backup repository calculator built to model Veeam Data Cloud (VDC) Vault and Scale-Out Backup Repository (SOBR) lifecycles.

Simple Mode serves as a high-fidelity SE Engineering Workbench. Visual layout decisions, labeling taxonomy, and data models must strictly align with native product mechanics (e.g., separating short-term retention from the Capacity Tier's Operational Restore Window) to establish technical credibility and trust with systems engineers, ensuring the tool functions as an authoritative validation console.

## Functional shape

- **Dual-mode UI**: Simple Mode (single pathway — Direct to Vault or Backup Copy — card-based flow for quick estimates) vs Advanced Mode (multiple repository definitions, granular job-to-repository mapping).
- **SOBR (Scale-Out Backup Repository) is the core domain complexity**: a three-tier model (Performance / Capacity / Archive), where each tier has a different set of allowed target types and its own rules (e.g. Capacity tier supports Copy vs Move modes with an offload period; Archive tier offloads on a "move backups older than N days" threshold — phrased in GFS terms in the UI ("Move GFS archives older than: N days") but modeled and validated as a flat day count, matching `VmAgentRequest.archiveTierDays`, not a Weekly/Monthly/Yearly picker). See the project brief for the exact allowed-targets matrix per tier — don't re-derive it from memory, it's easy to get subtly wrong.
- **Advanced mode adds**: a Repository Manager (define multiple SOBR/standalone targets), a Job Builder (tabular job-to-repository mapping), and Aggregate Projections (total front-end capacity vs. required back-end storage, broken down by tier).
- **Sizing formula is unspecified.** The brief lists the inputs (source data size, daily change rate, data reduction %, yearly growth %, short-term retention days, GFS points W/M/Y) and `screen.png` shows example output (18.4 TB total, tier breakdown, a note about assumptions), but the actual calculation connecting inputs to outputs — how retention feeds Performance-tier sizing, how GFS points feed Capacity-tier sizing, how yearly growth compounds — is not written down anywhere. Confirm the formula with the user before implementing any calculation logic.

## Design system notes

`DESIGN-v3.md` / `DESIGN-v3-dark.md` are canonical for exact colors/type scale/spacing tokens — don't duplicate them here. Non-obvious usage rules worth remembering:

- Tier color-coding is load-bearing and consistent throughout the UI: Performance = green, Capacity = blue, Archive = gray — backed by dedicated `tier-performance`/`tier-capacity`/`tier-archive` tokens (not aliases of `primary`/`secondary`).
- JetBrains Mono is reserved specifically for alignment-sensitive data — IP addresses, file paths, storage capacity values — not general UI text (Inter is the UI typeface).
- Two density modes exist: "Comfortable" (default) and "Compact" (halves vertical padding in tables/lists), intended for dense utility views like job mapping tables.
- Depth is conveyed via tonal layering and low-contrast outlines/borders, not shadows — keep elevation subtle and enterprise-feeling rather than decorative.
