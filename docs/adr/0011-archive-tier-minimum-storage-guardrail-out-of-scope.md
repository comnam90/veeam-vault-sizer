---
status: accepted
---

# Archive Tier's early-deletion guardrail is out of scope for Simple Mode

Real VBR's Archive Tier "Storage Settings" dialog includes "Archive backups only if the remaining retention time is above minimal storage period" — a guardrail that avoids early-deletion penalties on object-storage classes with a mandated minimum retention (e.g. Azure Archive, AWS Glacier's 180-day floor). It's a real, cost-relevant setting, but Simple Mode's `ArchiveTierConfig` (spec: `2026-07-05-simple-mode-backup-repository-design.md`) doesn't model it, and won't for this pass.

**Decision**: Simple Mode's UI does not expose this checkbox or its threshold. It's reserved for a future Advanced Mode Repository Manager, which can afford a denser, more complete control surface.

**Correction to the original framing**: this was first proposed as "implicitly enabled by default" in Phase 3's backend mapping, with the sizing engine "automatically accounting for the 180-day boundary" to keep cost projections accurate. That's not something this project can do. Per ADR-0001, `veeam-vault-sizer` never computes sizing itself — it only maps UI inputs onto Veeam's fixed `VmAgentRequest` shape (already fully typed in `src/types/vault-sizer-api.ts`) and forwards it to Veeam's calculator API. That request shape has no field for this setting at all — nothing beyond `archiveTierEnabled`, `archiveTierStandalone`, and `archiveTierDays`. There is no parameter for Phase 3 to set "on" or "off"; whatever Veeam's calculator does internally about the 180-day floor happens without our input, regardless of what Simple Mode's UI does or doesn't expose.

**Consequences**: reserving this for Advanced Mode as a "future editable field" only becomes meaningful if Veeam's calculator API ever adds a corresponding request parameter — until then, even an Advanced Mode control would have nowhere to send its value. If early-deletion-penalty accuracy on Archive Tier sizing ever becomes a real gap, it's a question for Veeam's calculator API, not this project's mapping layer.
