# Project Scaffold Design

Date: 2026-07-03

## Purpose

Stand up the initial repo — tooling, project structure, design system integration, app shell, and a working sizing API layer — so that implementing the Simple Mode calculator can start immediately after. This is a scaffolding pass, not a feature build.

## Scope

**In scope:**
- Build tooling, linting, testing, and CI/CD, mirroring the sibling project `vdc-vault-readiness`
- Project folder structure
- Tailwind v4 + shadcn/ui wired to this project's own design tokens (`DESIGN.md` light, `DESIGN-dark.md` dark)
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
│   │   │   └── app-shell.tsx
│   │   ├── simple-mode/
│   │   │   └── simple-mode-placeholder.tsx   # "Coming soon" stand-in for this pass
│   │   └── ui/                     # shadcn components, added as needed
│   ├── hooks/
│   │   └── use-theme.ts            # light/dark/system + localStorage
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

**Fonts**: Inter (UI) + JetBrains Mono (alignment-sensitive data only — IPs, paths, capacity values) loaded via a Google Fonts `<link>` in `index.html`. The same fonts are used in both light and dark themes — `DESIGN-dark.md` specifies different fonts (Hanken Grotesk, Geist) for headlines/labels, but this contradicts CLAUDE.md's explicit, theme-agnostic typography guidance, so only colors/surfaces/elevation change between themes, not typography.

**Theme switching**: a `data-theme="light"|"dark"` attribute on `<html>`, defaulting to `system` (resolved via `prefers-color-scheme` on load, then set explicitly once the user picks a theme via the header toggle). Persisted to `localStorage`. Per this project's Tailwind v4 rules (`.claude/rules/tailwindcss.md`), enabling `dark:` utilities against this attribute requires an explicit custom variant in `index.css`:

```css
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

Light tokens come from `DESIGN.md`, dark tokens from `DESIGN-dark.md`, mapped 1:1 into CSS variables using each file's own token names (`--surface`, `--on-surface`, `--primary`, etc.).

**Color format**: per the Tailwind v4 rules doc ("prefer `oklch()` over hex or rgb") and matching the sibling project's convention, every token is stored as OKLCH in `index.css`, converted from the hex values given in `DESIGN.md`/`DESIGN-dark.md`. This is a policy decision recorded here; the exact hex→OKLCH conversions happen during implementation.

**Tier color tokens**: "Performance/Capacity/Archive" tier colors are described only in prose (CLAUDE.md, DESIGN.md) and are missing from both YAML token lists in at least one theme (light mode has no blue at all). Proposed values, to become dedicated `--color-tier-performance` / `--color-tier-capacity` / `--color-tier-archive` tokens (not aliased to `primary`/`secondary`, so tier coloring can't drift if semantic button colors change later):

| Tier | Light (hex, pre-OKLCH-conversion) | Dark (hex, pre-OKLCH-conversion) | Source |
|---|---|---|---|
| Performance (green) | `#006d34` | `#42ee82` | = existing `primary` token in each file |
| Capacity (blue) | `#1d4ed8` *(new — no light-mode blue exists)* | `#9ecaff` | dark reuses existing `secondary`; light is a new proposed value |
| Archive (gray) | `#5b5f60` | `#859585` | = existing `secondary` (light) / `outline` (dark) tokens |

The capacity blue (`#1d4ed8`) is a real placeholder to adjust once seen on screen, not a TODO.

## API Layer

**Types** (`src/types/vault-sizer-api.ts`): `VmAgentRequest`/`VmAgentResponse` and nested types (`GfsPolicy`, `RetentionPolicy`, `RestorePoint`, `ComputeSpec`, etc.), ported verbatim from `vdc-vault-readiness`'s `src/types/veeam-api.ts`.

**Client** (`src/lib/api/vault-sizer-client.ts`): `callVaultSizerApi(request: VmAgentRequest): Promise<VmAgentResponse>` — POSTs to `/api/vault-sizer`, throws on non-OK responses. Mirrors `callVmAgentApi` minus its request-building logic (`buildVmAgentRequest`'s job-data mapping is specific to `vdc-vault-readiness` and doesn't apply here — Simple Mode's own input→request mapping is a follow-up spec). Covered by a Vitest test that mocks `fetch` and exercises both the success and error paths.

**Proxy** (`functions/api/vault-sizer.ts`): near-identical to `veeam-proxy.ts` — POST-only passthrough to `https://calculator.veeam.com/vse/api/VmAgent` with permissive CORS headers and OPTIONS preflight handling.

**Dev proxy** (`vite.config.ts`): a `server.proxy` rule forwarding `/api/vault-sizer` to the same upstream URL during `npm run dev`, so `callVaultSizerApi` behaves identically in local dev and production without needing the Pages Function to run locally.

## App Shell

`site-header.tsx`: app title, a Simple/Advanced pill toggle (Advanced rendered disabled with a "Coming soon" tooltip; Simple is always active for now), and the light/dark/system theme toggle.

Deliberately excluded from the shell: the Reset link, settings gear, help icon, and avatar seen in `screen.png`. None of them have a feature behind them yet, so they'd be dead chrome — they get added alongside whatever they control.

Main content area renders a placeholder card ("Simple Mode calculator — coming soon") where the real form will go in the next spec.

## Testing

- Vitest + React Testing Library, `jsdom` environment, matching the sibling's `vite.config.ts` test block
- `vault-sizer-client.test.ts` covers the API client's request/response plumbing and error handling (fetch mocked)
- No direct unit test for the Cloudflare Pages Function itself (consistent with the sibling project — Pages Functions aren't practically unit-testable outside a Workers runtime)
- CI (`ci.yml`) runs lint + test on push and PR

## CI/CD

- `ci.yml`: lint + test jobs on push to `main` and on PRs
- `deploy.yml`: manual-dispatch workflow using `cloudflare/wrangler-action`, deploying `./dist` with `--project-name=veeam-vault-sizer`

## Open Questions / Follow-ups

None outstanding for this scaffold — all decisions above were confirmed during brainstorming. Follow-up specs needed before further feature work:
1. Simple Mode calculator: form UI, input→`VmAgentRequest` mapping, results rendering
2. Advanced Mode: Repository Manager, Job Builder, Aggregate Projections
