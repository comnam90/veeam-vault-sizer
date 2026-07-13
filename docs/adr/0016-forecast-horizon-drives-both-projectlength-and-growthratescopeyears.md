---
status: accepted
---

# Forecast Horizon drives both `projectLength` and `growthRateScopeYears`

The calculator API's `VmAgentInputs` models `projectLength` (storage-sizing horizon) and `growthRateScopeYears` (proxy-compute growth horizon) as independently configurable fields; `buildVmAgentRequest` previously hardcoded `growthRateScopeYears` to `1` since no UI exposed either one. The Projected Sizing canvas's new Forecast Horizon control is the first place either becomes a user-facing, interactive setting, so both fields now derive from that single control's value instead of only `projectLength`.

**Considered options**: keeping `growthRateScopeYears` hardcoded at `1` while only `projectLength` scales with the new control — rejected, because it would mean Infrastructure Telemetry's compute figures (also new in this task) silently stop reflecting the horizon the user is looking at, reading as a bug rather than a deliberate scope boundary to the SEs this tool is built to earn trust with.

**Consequences**: a future task that needs these two horizons to diverge (e.g. sizing storage 5 years out while assuming only 1 year of proxy-compute growth) will need a second control and a product decision about how to present two separate horizons — revisit this ADR if that need arises.
