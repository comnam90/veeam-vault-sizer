---
status: accepted
---

# `growthFactor` mirrors `growthRatePercent`'s source (`yearlyGrowthPercent`)

`VmAgentInputs` models `growthRatePercent` (drives proxy-compute growth) and `growthFactor` (drives tier-storage/GFS growth) as independently configurable fields on the same `0`–`100` percentage scale: `growthFactor` defaults to `growthRatePercent` when left at `0`. `buildVmAgentRequest` has always populated `growthRatePercent` from `workloadData.yearlyGrowthPercent`, but never populated `growthFactor` at all — Task 1 deliberately left it unset, per the BFF gateway spec, to rely on that fallback. Now that the Projected Sizing canvas surfaces storage-tier sizing as its headline output, this task sets `growthFactor` explicitly from the same `yearlyGrowthPercent` value instead of continuing to depend on the implicit fallback.

**Considered options**: leaving `growthFactor` unset and relying on its documented fallback to `growthRatePercent` — rejected for the same reason ADR-0016 rejected leaving `growthRateScopeYears` hardcoded: it works today only by an undocumented-in-our-code coincidence (the fallback rule lives in the upstream API, not this codebase), and a later change to either field independently would silently break the link with no local signal it ever existed.

**Consequences**: `yearlyGrowthPercent` now drives two request fields (`growthRatePercent`, `growthFactor`) for the same reason `projectLengthYears` drives two (`projectLength`, `growthRateScopeYears` — ADR-0016): one UI input feeding two independently-modeled sizing pipelines. A future task that needs these two rates to diverge needs a second control and a product decision — same caveat as ADR-0016.
