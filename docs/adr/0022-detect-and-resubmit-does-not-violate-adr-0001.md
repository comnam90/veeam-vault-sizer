---
status: accepted
---

# Detect-and-resubmit for SOBR Archive Tier doesn't violate ADR-0001

Veeam's calculator API has two confirmed defects when Archive Tier is enabled without Capacity Tier (`docs/evidence/sobr-archive-tier-no-capacity/README.md`). The interim workaround (`docs/superpowers/specs/2026-07-20-sobr-archive-tier-workaround-design.md`) builds the request as a phantom, pass-through Capacity Tier, inspects the response's own restore-point data for a leaked non-GFS point (indicating the threshold was too low), and if so, resubmits once with a threshold computed from that same response's data.

**Decision**: this is compliant with ADR-0001's "no local sizing computation." The only local logic is (a) choosing which valid request shape to send, and (b) reading `day`/`isGFS`/`pointType` fields back off Veeam's own response to pick a threshold and confirm completeness. No storage or compute figure is ever calculated locally — every number shown to the user is Veeam's own output, verbatim, from whichever of the 1–3 calls produced it.

**Considered and rejected**: a two-response check comparing total volume between the floor-threshold call and the corrected-threshold call, to guard against the Immutability Tax duplicate-window artifact. Rejected because distinguishing the tax delta from the volume shift that legitimately happens whenever the threshold changes (independent of the tax) would require modeling how much data _should_ redistribute between tiers as the threshold moves — i.e. reconstructing Veeam's internal tiering math, which is exactly what ADR-0001 forbids. The chosen check (`isArchiveComplete`) only inspects a single response's own day/tag data, which stays on the right side of that line.

**Amendment (2026-07-21)**: `isArchiveComplete` now also takes `threshold`, the exact `capacityTierDays` value used in the request that produced the response. This is still a single response's own day/tag data plus a request parameter the caller already chose to send — not a value derived from the response — so the compliance argument above is unchanged. See `docs/evidence/sobr-archive-tier-no-capacity/README.md`'s "Issue 3" for why the plain day-set-membership version this ADR originally described was wrong, not just incomplete.
