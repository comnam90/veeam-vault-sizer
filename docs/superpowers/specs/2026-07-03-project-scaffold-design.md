# Project Scaffold Design

Date: 2026-07-03

## Purpose

Stand up the initial repo — tooling, project structure, design system integration, app shell, and a working sizing API layer — so that implementing the Simple Mode calculator can start immediately after. This is a scaffolding pass, not a feature build.

## Scope

**In scope:**
- Build tooling, linting, testing, and CI/CD, mirroring the sibling project `vdc-vault-readiness`
- Project folder structure
- Tailwind v4 + shadcn/ui wired to this project's own design tokens (`DESIGN-v2.md` light, `DESIGN-v2-dark.md` dark)
- An app shell: header with title, Simple/Advanced mode toggle (Advanced disabled), and a light/dark/system theme toggle
- A fully working, tested sizing API layer (types, client, Cloudflare Pages Function proxy, dev-mode proxy) — built but not yet consumed by any form UI

**Out of scope (deferred to follow-up specs):**
- The Simple Mode form/results UI (workload data inputs, path/target selection, results sidebar)
- The mapping from Simple Mode inputs to a `VmAgentRequest` (the actual sizing logic/business rules)
- Advanced Mode (Repository Manager, Job Builder, Aggregate Projections)
- Settings panel, help content, user/avatar UI

## Background: the sizing API

Sizing calculations are not computed locally — they're delegated to Veeam's existing public sizing engine, already integrated in the sibling project `vdc-vault-readiness`:

- **Endpoint**: `POST https://calculator.veeam.com/vse/api/VmAgent`
- **No auth required.** The sibling proxies it purely to avoid CORS, via a Cloudflare Pages Function (`functions/api/veeam-proxy.ts`).
- **Request** (`VmAgentRequest`): `sourceTB`, `ChangeRate`, `Reduction`, `GrowthRatePercent`/`GrowthRateScopeYears`, a `retention` object (`days` + GFS `weeks`/`months`/`years`), `moveCapacityTierEnabled`/`copyCapacityTierEnabled` + `capacityTierDays`, `archiveTierEnabled` + `archiveTierDays`, immutability day counts, and a Vault-specific `isCapTierVDCV` flag, among others.
- **Response** (`VmAgentResponse`): `totalStorageTB`, per-tier immutability "tax" in GB, compute sizing, and a `restorePoints[]` array tagged with tier/GFS flags used to derive the Performance/Capacity/Archive breakdown.

This project reuses the same endpoint and contract as-is. The full shape is ported into this project's types (see API Layer below), but the logic that turns Simple Mode's six inputs (source size, change rate, reduction, growth, retention, GFS points) into a `VmAgentRequest` is domain logic left to the Simple Mode implementation spec.

## Tech Stack

Mirrors `vdc-vault-readiness`:

- Vite 7 + React 19 + TypeScript 5.9 (strict)
- Tailwind CSS v4 (CSS-first `@theme`) + shadcn/ui (`new-york` style, Lucide icons)
- Vitest + React Testing Library
- ESLint (flat config) + Prettier + Husky + lint-staged + commitlint (conventional commits)
- Cloudflare Pages hosting: manual-dispatch GitHub Actions deploy via `wrangler-action`, plus a CI workflow (lint + test) on push/PR
- npm

### Deliberate deviations from the sibling project

1. **Dev-mode API proxy.** The sibling has no way to exercise its `/api/*` Pages Function under `vite dev` — no proxy config, no wrangler dev script — it only works once deployed. This project adds a `server.proxy` rule in `vite.config.ts` forwarding `/api/vault-sizer` straight to the upstream Veeam API during local dev (server-to-server, so CORS doesn't apply). The Cloudflare Pages Function handles the same route path in production. Same route, functional in both environments.
2. **Theme toggle.** The sibling relies purely on `prefers-color-scheme`. This project needs a manual override (useful when presenting to customers regardless of the presenter's OS theme), so it uses an explicit `light`/`dark`/`system` model instead of media-query-only theming.

## Project Structure

```
veeam-vault-sizer/
├── functions/
│   └── api/
│       └── vault-sizer.ts          # Pages Function: proxies to calculator.veeam.com
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── site-header.tsx     # Title, Simple/Advanced pill (Advanced disabled), theme toggle
│   │   │   ├── site-header.test.tsx
│   │   │   └── app-shell.tsx
│   │   ├── simple-mode/
│   │   │   └── simple-mode-placeholder.tsx   # "Coming soon" stand-in for this pass
│   │   └── ui/                     # shadcn components, added as needed
│   ├── hooks/
│   │   ├── use-theme.ts            # light/dark/system + localStorage
│   │   └── use-theme.test.ts
│   ├── lib/
│   │   ├── api/
│   │   │   ├── vault-sizer-client.ts   # callVaultSizerApi(request) -> fetch(/api/vault-sizer)
│   │   │   └── vault-sizer-client.test.ts
│   │   └── utils.ts                # shadcn's cn() helper
│   ├── types/
│   │   └── vault-sizer-api.ts      # VmAgentRequest / VmAgentResponse, ported from vdc-vault-readiness
│   ├── App.tsx
│   ├── index.css                   # Tailwind v4 @theme + design tokens (light + dark)
│   └── main.tsx
├── .github/workflows/
│   ├── ci.yml                      # lint + test on push/PR
│   └── deploy.yml                  # manual dispatch → Cloudflare Pages
├── components.json                 # shadcn config (new-york, neutral base, cssVariables)
├── vite.config.ts                  # includes dev-mode /api/vault-sizer proxy
└── (standard config: tsconfig*, eslint.config.js, .prettierrc, commitlint.config.js, .husky/)
```

Naming departs from the sibling's `dashboard/` convention in favor of `simple-mode/` / `layout/`, since this app is structured around modes rather than a single dashboard view. `advanced-mode/` would be added as a sibling folder when that mode gets built.

## Design System Integration

**Mechanism**: same as the sibling — `@import "tailwindcss"` in `index.css`, CSS custom properties for every token, mapped into utility classes via `@theme inline`. `components.json` uses `new-york` style, `neutral` base color (immediately overridden by this project's own tokens), `cssVariables: true`.

**Fonts**: Inter (UI) + JetBrains Mono (alignment-sensitive data only — IPs, paths, capacity values) loaded via a Google Fonts `<link>` in `index.html`. The same fonts are used in both light and dark themes — a confirmed decision, now recorded directly in `DESIGN-v2-dark.md` (which drops v1's separate Hanken Grotesk/Geist headline and label fonts), so only colors/surfaces/elevation change between themes, not typography.

**Theme switching**: a `data-theme="light"|"dark"` attribute on `<html>`, defaulting to `system` (resolved via `prefers-color-scheme` on load, then set explicitly once the user picks a theme via the header toggle). Persisted to `localStorage`. Per this project's Tailwind v4 rules (`.claude/rules/tailwindcss.md`), enabling `dark:` utilities against this attribute requires an explicit custom variant in `index.css`:

```css
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

Light tokens come from `DESIGN-v2.md`, dark tokens from `DESIGN-v2-dark.md` — these supersede `DESIGN.md`/`DESIGN-dark.md` (see each file's "v2 provenance" note for what changed and why) — mapped 1:1 into CSS variables using each file's own token names (`--surface`, `--on-surface`, `--primary`, etc.).

**Color format**: per the Tailwind v4 rules doc ("prefer `oklch()` over hex or rgb") and matching the sibling project's convention, every token is stored as OKLCH in `index.css`, converted from the hex values given in `DESIGN-v2.md`/`DESIGN-v2-dark.md`. This is a policy decision recorded here; the exact hex→OKLCH conversions happen during implementation.

**Tier color tokens**: `DESIGN-v2.md`/`DESIGN-v2-dark.md` now define these explicitly as dedicated `tier-performance` / `tier-capacity` / `tier-archive` YAML tokens (not aliased to `primary`/`secondary`, so tier coloring can't drift if semantic button colors change later), reconciled against Veeam's official "PRISM" brand palette:

| Tier | Light | Dark | Source |
|---|---|---|---|
| Performance (green) | `#007f49` | `#00d15f` | = `primary` in each file; both are exact PRISM Green swatches |
| Capacity (blue) | `#283ee8` | `#57e0ff` | PRISM Blue row; not aliased to any existing token in either theme |
| Archive (gray) | `#505861` | `#adacaf` | PRISM Neutral Family; close to but distinct from `secondary`(light)/`outline`(dark) |

All tier hexes above are confirmed against the source PRISM brand palette. Note also that in `DESIGN-v2-dark.md`, moving `primary` to `#00d15f` required reassigning `primary-container` (from v1's `#00d169`, now indistinguishable from the new primary, to v1's old `primary` value `#42ee82`) to keep the two tones visually distinct.

## API Layer

**Types** (`src/types/vault-sizer-api.ts`): `VmAgentRequest`/`VmAgentResponse` and nested types (`GfsPolicy`, `RetentionPolicy`, `RestorePoint`, `ComputeSpec`, etc.), ported verbatim from `vdc-vault-readiness`'s `src/types/veeam-api.ts`.

**Client** (`src/lib/api/vault-sizer-client.ts`): `callVaultSizerApi(request: VmAgentRequest): Promise<VmAgentResponse>` — POSTs to `/api/vault-sizer`, throws on non-OK responses. Mirrors `callVmAgentApi` minus its request-building logic (`buildVmAgentRequest`'s job-data mapping is specific to `vdc-vault-readiness` and doesn't apply here — Simple Mode's own input→request mapping is a follow-up spec). Covered by a Vitest test that mocks `fetch` and exercises both the success and error paths.

**Proxy** (`functions/api/vault-sizer.ts`): near-identical to `veeam-proxy.ts` — POST-only passthrough to `https://calculator.veeam.com/vse/api/VmAgent` with permissive CORS headers and OPTIONS preflight handling.

**Dev proxy** (`vite.config.ts`): a `server.proxy` rule forwarding `/api/vault-sizer` to the same upstream URL during `npm run dev`, so `callVaultSizerApi` behaves identically in local dev and production without needing the Pages Function to run locally.

## App Shell

`site-header.tsx`: app title, a Simple/Advanced pill toggle (Advanced rendered disabled with a "Coming soon" tooltip; Simple is always active for now), and the light/dark/system theme toggle. Native `disabled` buttons don't fire the hover/focus events a tooltip needs (no pointer events, removed from tab order), so the Advanced trigger must follow the standard Radix/shadcn Tooltip workaround: keep the inner `<button>` visually disabled (`aria-disabled`, no `disabled` attribute, `pointer-events-none` styling, `tabIndex={-1}`) wrapped in a plain `<span>` that the Tooltip actually attaches its listeners to — otherwise the tooltip silently never appears for mouse or keyboard users.

Deliberately excluded from the shell: the Reset link, settings gear, help icon, and avatar seen in `screen.png`. None of them have a feature behind them yet, so they'd be dead chrome — they get added alongside whatever they control.

Main content area renders a placeholder card ("Simple Mode calculator — coming soon") where the real form will go in the next spec.

## Testing

- Vitest + React Testing Library, `jsdom` environment, matching the sibling's `vite.config.ts` test block
- `vault-sizer-client.test.ts` covers the API client's request/response plumbing and error handling (fetch mocked)
- `use-theme.test.ts` covers theme resolution and persistence: defaults to `system` and resolves it via `prefers-color-scheme`, persists an explicit user choice to `localStorage`, and reads that persisted choice back on next load
- `site-header.test.tsx` covers the Advanced pill (rendered `aria-disabled`, not clickable, tooltip content present) and the theme toggle cycling through light/dark/system
- No direct unit test for the Cloudflare Pages Function itself (consistent with the sibling project — Pages Functions aren't practically unit-testable outside a Workers runtime)
- CI (`ci.yml`) runs lint + test on push and PR

## CI/CD

- `ci.yml`: lint + test jobs on push to `main` and on PRs
- `deploy.yml`: manual-dispatch workflow using `cloudflare/wrangler-action`, deploying `./dist` with `--project-name=veeam-vault-sizer`

## Open Questions / Follow-ups

Design-token decisions above were confirmed during brainstorming; one infra prerequisite for `deploy.yml` is outstanding:

- **Verified gap**: this repo has no `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` GitHub Actions secrets configured (checked via `gh secret list`), unlike the sibling `vdc-vault-readiness`, which has both. A Cloudflare Pages project named `veeam-vault-sizer` (matching `--project-name` in `deploy.yml`) also needs to exist before the workflow can succeed. Add both secrets and confirm the Pages project before the first deploy is attempted — `ci.yml` (lint/test) has no such dependency and is unaffected.

Follow-up specs needed before further feature work:
1. Simple Mode calculator: form UI, input→`VmAgentRequest` mapping, results rendering
2. Advanced Mode: Repository Manager, Job Builder, Aggregate Projections
