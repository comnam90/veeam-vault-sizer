---
status: accepted
---

# Add new design tokens for DESIGN-v3.md colors not yet wired into index.css, rather than reusing coincidentally-equal ones

`DESIGN-v3.md`'s YAML defines the full Enterprise/Obsidian Precision color system, but `src/index.css`'s `@theme inline` block only wires a subset of it into Tailwind classes. When a needed color isn't wired up yet but happens to match an existing token's current value, the fix is to add a new dedicated token — not alias to the coincidentally-equal one. The motivating case: field labels need `#505861`, which today equals `tier-archive` in light mode purely by coincidence (`DESIGN-v3.md`'s own provenance notes call this an equality of value, not identity).

**Considered options**: reuse `text-tier-archive` — rejected, because `DESIGN-v3-dark.md` ties labels to `on-surface-variant`, a different token from dark's `tier-archive` (`outline`), so the light-mode coincidence silently breaks in dark mode. Hardcode `text-[#505861]` — rejected, since no other component in this codebase uses a raw hex value; all styling goes through token classes.

**Consequences**: added `--label` (`#505861` light / `#bbcbba` dark) to `index.css` alongside the existing `tier-*` tokens. Future gaps between `DESIGN-v3.md`'s documented palette and `index.css`'s implemented theme should be closed the same way — add the missing token rather than borrow whatever existing token happens to match today's value.
