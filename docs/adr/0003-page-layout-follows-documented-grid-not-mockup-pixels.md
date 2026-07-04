---
status: accepted
---

# Simple Mode's page layout follows DESIGN-v3.md's 12-column/1440px grid model, not screen.png's literal pixel proportions

`screen.png` (the Simple Mode reference mockup) was captured at roughly 1280px wide, with its Workload Data column reading as ~740px. `DESIGN-v3.md` separately documents a specific, different layout system for this app: a 12-column grid capped at `container-max: 1440px`, fluid below that. The Simple Mode page shell — the first page-level layout in this app — implements the documented grid (8 of 12 columns for main content, 4 for the sidebar, inside a `max-w-[1440px] mx-auto` container) rather than hardcoding the mockup's literal pixel width.

**Considered options**: a fixed `~740px` left column matching the mockup pixel-for-pixel — rejected, because it only reproduces the mockup's proportions at the exact frame width it was captured at, has no defined behavior on wider monitors (where a fixed-px column plus a growing sidebar no longer matches the mockup's ratio), and never establishes the `container-max` convention `DESIGN-v3.md` calls for.

**Consequences**: every future page in this app inherits this same container/column convention rather than inventing its own. The trade-off is that rendered proportions on screens near/above 1440px won't be pixel-identical to `screen.png`, which was captured narrower.
