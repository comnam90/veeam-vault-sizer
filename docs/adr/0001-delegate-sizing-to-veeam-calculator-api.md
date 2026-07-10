---
status: accepted
---

# Delegate sizing calculations to Veeam's existing calculator API

The formula connecting Simple Mode's inputs (source size, change rate, reduction, growth, retention, GFS points) to a storage/compute result is not documented anywhere in this project's brief, and deriving it independently would mean reverse-engineering and then permanently maintaining a parallel copy of Veeam's proprietary sizing logic.

We do no local sizing computation. `veeam-vault-sizer` POSTs a `VmAgentRequest` to Veeam's existing public sizing engine (`https://calculator.veeam.com/vse/api/VmAgent`) — via a Cloudflare Pages Function proxy, run through Wrangler locally and deployed to Cloudflare in production — and renders whatever `VmAgentResponse` comes back. This mirrors the sibling project `vdc-vault-readiness`, which already integrates the same endpoint and request/response contract.

**Consequences**: this tool's accuracy, tier breakdown, and available inputs are permanently coupled to Veeam's calculator API — if that endpoint's shape, availability, or business logic changes, this tool changes with it, and there is no local fallback. In exchange, sizing math never has to be reverse-engineered, validated against Veeam's real product engine, or kept in sync by hand as pricing/algorithm changes happen on Veeam's side. The only work left for this project is mapping UI inputs to the request shape and rendering the response — not computing the answer itself.
