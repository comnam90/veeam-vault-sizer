---
status: accepted
---

# Copy-mode site titles use topological roles, not geographic framing

The Backup Copy dual-pipeline design (`2026-07-15-backup-copy-dual-pipeline-and-canvas-cleanup-design.md`, D5/D8) titled the split-canvas sections "Primary — On-Premises Landing Zone" and "Secondary — Offsite Cloud Vault", with a single repo-type badge per section header. That framing assumed the Secondary is always an offsite cloud Vault and the Primary is always on-premises — true for the tool's current Vault-Azure/Vault-AWS/SOBR target set, but not a guarantee: a Secondary can be a SOBR whose Performance Tier is itself on-prem block/file, and nothing in the domain model requires the Primary to be on-premises.

**Decision**: Section titles are topological roles only — "Primary Repository" / "Secondary Repository" (Direct mode: "Primary Repository", singular, no Secondary section) — with no geographic claim. The single repo-type badge per section is replaced by per-tier technology labels (e.g. "Performance — Hardened Repository", "Capacity — Vault Azure", bare "Archive" since Archive Tier has no user-selectable type), so the technology detail lives next to the specific tier it describes instead of summarizing a possibly-multi-tier section with one label. This supersedes D5's section titles and D8's single-badge-per-section approach; D6 (combined-total header, sum of both sites' tier volumes) and D9 (`>0` tier filter) are unaffected and still stand.

**Consequences**: `SiteSizingSection` takes a `tierLabels` mapping (`Partial<Record<"performance" | "capacity" | "archive", string>>`) instead of a single `badge` string, and becomes the universal rendering engine for both Direct (one section, `data` may be `null` before the first response) and Copy (two sections, `data` always populated) — removing the layout duplication between `ProjectedSizingCard`'s two branches. The combined-header subline ("On-Premises X + Offsite Vault Y") is reworded to "Primary X + Secondary Y" to match. Don't reintroduce geographic wording in section titles or reduce the per-tier labels back to a single section-level badge — both would re-litigate this decision.
