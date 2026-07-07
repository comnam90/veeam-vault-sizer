---
status: accepted
---

# Backup Copy mode models two independent sizing pipelines, not one request with a presentational primary

ADR-0001 commits this project to a single-pipeline sizing API (`VmAgentRequest`) with one retention block and no primary/secondary distinction — which raised a real question while designing the Backup Repository Configuration card: does Backup Copy mode's "Primary On-Prem Repository" track need its own independent sizing configuration, or is it context/presentation only, with the single API request built entirely from the Secondary (Vault) track?

**Decision**: Primary and Secondary each get full, independently validated configuration — repo type, immutability, and retention/GFS — in `RepositoryConfigValues`. Neither is presentational. This is because they're genuinely two separate things a customer needs sized independently (e.g. a Vault-to-Vault copy across regions, or a copy from Vault Advanced to Vault Foundation for cost reasons), not one real pipeline with a decorative front end.

**Considered options**: modeling Primary as presentational/context-only, feeding a single `VmAgentRequest` built from Secondary's config alone — rejected, because it can't represent scenarios where Primary itself needs independent sizing (different retention, different repo type, different immutability) from Secondary.

**Consequences**: Phase 3 (API integration, out of scope for the Backup Repository Configuration card itself) will need to size Primary and Secondary as two separate `VmAgentRequest`s — either two frontend calls or a backend function that fans one incoming request out into two upstream calls and combines the results. The data model in `src/types/simple-mode.ts` already anticipates this by keeping `primary` and the rest of `RepositoryConfigValues` fully separable, even though this phase's UI never calls the sizing API at all.
