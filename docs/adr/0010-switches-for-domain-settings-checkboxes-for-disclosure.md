---
status: accepted
---

# Switches for real domain/API settings, checkboxes only for pure UI-disclosure toggles

The SOBR Builder's booleans were a checkbox mix that fell out of implementation order rather than a deliberate rule: Capacity Tier's enable control was a checkbox, Archive Tier's was a dashed "+ Add" ghost block; Copy Policy, Move Policy, and Standalone Full Backups were all checkboxes. Design review flagged the Capacity/Archive asymmetry as visually incoherent for an "expert console" surface, and proposed replacing checkboxes with Radix Switch primitives.

`DESIGN-v3.md`'s "Toggle Switches" line previously scoped switches to the Simple/Advanced mode switcher only. Adopting Switch more broadly is a real design-system expansion, not a doc-sync — this ADR is that decision, and `DESIGN-v3.md`/`DESIGN-v3-dark.md` are updated to match.

**Decision**: a boolean gets a **Switch** when it corresponds to a real, sizing/domain-relevant setting — something that exists as a field in `SobrConfig`/`VmAgentRequest` with meaning independent of the UI (`capacityTier.copyPolicy`, `capacityTier.movePolicy`, `archiveTier.standaloneFullBackups` — the last confirmed a real VBR setting by ADR-0008). A boolean stays a **checkbox** when it's a pure UI-state flag whose only job is gating the visibility of other fields, with no meaning of its own once resolved — `RetentionOverride.customizeRetention` is the one remaining case: it's never itself read by validation or sizing, only `retentionDays`/`gfs*` are, and those default from Workload Data regardless of how the checkbox got checked.

`capacityTier.movePolicy` is the case worth spelling out: checking it _also_ reveals the "days" input, which looks like a disclosure hatch. It's still a Switch, because the boolean itself is a real, independently meaningful pipeline setting (whether Move offloading runs at all) — the field reveal is incidental to that, not the point of the control. Contrast `customizeRetention`, whose entire purpose _is_ the reveal.

Tier enable/disable (Capacity, Archive) is neither — it's a third affordance (dashed "+ Add" ghost block when off, a "Remove" link on the tier's own heading row when on) because enabling a tier exposes a whole multi-field sub-form, not a single value. This ADR makes Capacity Tier's enable control match Archive Tier's existing pattern, including moving Archive's "Remove" link from the move-days row to the tier heading row — it removes the whole tier, not one field, so it belongs next to the tier name, not a specific input.

**Considered options**: leaving Copy/Move/Standalone as checkboxes and only fixing the Capacity/Archive enable-control asymmetry — rejected, because it leaves two toggle languages in the same card (Copy/Move as checkboxes, tier-add as ghost blocks) without a principled reason for the split. Converting _every_ boolean including `customizeRetention` — rejected; as above, it's categorically a disclosure hatch, not a domain setting, and forcing it to a Switch would erase the one distinction this ADR exists to draw.

**Consequences**: added `src/components/ui/switch.tsx` wrapping Radix's `Switch` primitive (via the existing consolidated `radix-ui` package, same convention as `checkbox.tsx`). `sobr-builder.tsx` no longer imports `Checkbox`. Future boolean fields in this card should be classified against the same test — does the value have meaning outside the UI (Switch), or does it only decide what else is visible (checkbox) — rather than picked by visual preference. Don't "simplify" `customizeRetention` into a Switch to match the rest of the card; that reintroduces the exact conflation this ADR exists to prevent.
