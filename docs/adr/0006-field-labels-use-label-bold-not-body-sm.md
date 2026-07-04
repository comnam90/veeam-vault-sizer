---
status: accepted
---

# Simple Mode field labels use label-bold typography, not DESIGN-v3.md's literal "body-sm" text

`DESIGN-v3.md`'s Components → Input Fields & Forms section states "Label: `body-sm` in `#505861`" (13px/400 weight). `WorkloadDataCard`'s field labels (`src/components/ui/label.tsx`) are instead styled `text-xs font-semibold tracking-wider uppercase` — 12px/600 weight/0.05em tracking, which is `label-bold`'s exact metrics (`DESIGN-v3.md`'s own type scale, line 86-91), not `body-sm`'s.

This isn't an oversight: `screen.png` (the validated reference mockup) reads as uppercase, tracked, and bold, and `DESIGN-v3.md`'s own Typography section (line 150) separately assigns uppercase labels to `label-bold` ("form group titles"). The two sections of `DESIGN-v3.md` disagree with each other; the implementation follows the mockup and the Typography section over the one conflicting line in the Input Fields section. The `--label` color token (ADR-0002) is applied correctly either way — only size/weight was ambiguous.

**Considered options**: literally implement `body-sm` (13px/400) per the Input Fields section — rejected, because it contradicts the validated mockup and the Typography section's own uppercase-label rule, and no `--text-*` typography tokens are wired into `index.css` yet to express `body-sm` as a utility class regardless.

**Consequences**: field labels across Simple Mode (and any future form following this pattern) use `label-bold` sizing/weight, not `body-sm`, whenever the label is uppercase/tracked. `DESIGN-v3.md`'s Input Fields section should be corrected to say `label-bold` instead of `body-sm` the next time that doc is revised, to remove the internal inconsistency.
