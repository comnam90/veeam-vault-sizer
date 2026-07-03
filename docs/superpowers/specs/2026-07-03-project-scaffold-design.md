# Project Scaffold Design

Date: 2026-07-03

## Purpose

Stand up the initial repo — tooling, project structure, design system integration, app shell, and a working sizing API layer — so that implementing the Simple Mode calculator can start immediately after. This is a scaffolding pass, not a feature build.

## Scope

**In scope:**

- Build tooling, linting, testing, and CI/CD, mirroring the sibling project `vdc-vault-readiness`
- Project folder structure
- Tailwind v4 + shadcn/ui wired to this project's own design tokens (`DESIGN-v3.md` light, `DESIGN-v3-dark.md` dark)
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
- **Response** (`VmAgentResponse`): a `{ success: boolean; data: VmAgentResponseData }` envelope. `data` carries `totalStorageTB`, per-tier immutability "tax" in GB, compute sizing, and a `restorePoints[]` array tagged with tier/GFS flags used to derive the Performance/Capacity/Archive breakdown.

This project reuses the same endpoint and contract as-is. The full shape is ported into this project's types (see API Layer below), but the logic that turns Simple Mode's six inputs (source size, change rate, reduction, growth, retention, GFS points) into a `VmAgentRequest` is domain logic left to the Simple Mode implementation spec.

## Tech Stack

Mirrors `vdc-vault-readiness`:

- Vite 7 + React 19 + TypeScript 5.9 (strict)
- Tailwind CSS v4 (CSS-first `@theme`) + shadcn/ui (`new-york` style, Lucide icons)
- Vitest + React Testing Library
- ESLint (flat config) + Prettier + Husky + lint-staged + commitlint (conventional commits)
- Cloudflare Pages hosting via three GitHub Actions workflows, matching the sibling exactly: `ci.yml` (lint + test on push/PR), `publish.yml` (manual-dispatch deploy via `wrangler-action`), and `release.yml` (release-please-driven auto-versioning, auto-deploying on every release cut from `main`)
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
│   ├── main.tsx
│   └── test-setup.ts               # imports @testing-library/jest-dom for matcher registration
├── .github/workflows/
│   ├── ci.yml                      # lint + test on push/PR
│   ├── publish.yml                 # manual dispatch → Cloudflare Pages
│   └── release.yml                 # release-please: auto-version + auto-deploy on merge to main
├── components.json                 # shadcn config (new-york, neutral base, cssVariables)
├── vite.config.ts                  # includes dev-mode /api/vault-sizer proxy
└── (standard config: tsconfig*, eslint.config.js, .prettierrc, commitlint.config.js, .husky/)
```

Naming departs from the sibling's `dashboard/` convention in favor of `simple-mode/` / `layout/`, since this app is structured around modes rather than a single dashboard view. `advanced-mode/` would be added as a sibling folder when that mode gets built.

## Design System Integration

**Mechanism**: same as the sibling — `@import "tailwindcss"` in `index.css`, CSS custom properties for every token, mapped into utility classes via `@theme inline`. `components.json` uses `new-york` style, `neutral` base color (immediately overridden by this project's own tokens), `cssVariables: true`.

**Fonts**: Inter (UI) + JetBrains Mono (alignment-sensitive data only — IPs, paths, capacity values) loaded via a Google Fonts `<link>` in `index.html`. The same fonts are used in both light and dark themes — a confirmed decision, now recorded directly in `DESIGN-v3-dark.md` (which drops both v1's and the Stitch draft's separate headline typefaces), so only colors/surfaces/elevation change between themes, not typography.

**Theme switching**: a `data-theme="light"|"dark"` attribute on `<html>`, defaulting to `system` (resolved via `prefers-color-scheme`, then set explicitly once the user picks a theme via the header toggle). Persisted to `localStorage`. Per this project's Tailwind v4 rules (`.claude/rules/tailwindcss.md`), enabling `dark:` utilities against this attribute requires an explicit custom variant in `index.css`:

```css
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

**Avoiding a flash of the wrong theme (FOUC)**: `use-theme.ts` resolves and applies the theme from a `useEffect`, which runs after first paint — a dark-preferring user would see a flash of light theme before React mounts. `.claude/rules/tailwindcss.md:232-238` documents the standard fix for exactly this: a small blocking `<script>` inline in `index.html`'s `<head>`, before any stylesheet or app code, that reads `localStorage` + `prefers-color-scheme` synchronously and sets `data-theme` before the browser paints anything:

```html
<script>
  (function () {
    var stored = localStorage.getItem("theme");
    var theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.setAttribute("data-theme", theme);
  })();
</script>
```

`use-theme.ts` still owns everything after first paint: exposing the current theme to React, persisting explicit user choices, reacting to toggle clicks, and listening for `prefers-color-scheme` changes while in `system` mode. The inline script only handles the first-paint case, before the hook exists.

Light tokens come from `DESIGN-v3.md`, dark tokens from `DESIGN-v3-dark.md` — these supersede `DESIGN-v2.md`/`DESIGN-v2-dark.md` and `DESIGN.md`/`DESIGN-dark.md` (see each file's "v3 provenance" note for what changed and why) — mapped 1:1 into CSS variables using each file's own token names (`--surface`, `--on-surface`, `--primary`, etc.).

**Color format**: per the Tailwind v4 rules doc ("prefer `oklch()` over hex or rgb") and matching the sibling project's convention, every token is stored as OKLCH in `index.css`, converted from the hex values given in `DESIGN-v3.md`/`DESIGN-v3-dark.md`. This is a policy decision recorded here; the exact hex→OKLCH conversions happen during implementation.

**Source of truth**: v2 reconciled colors against Veeam's official "PRISM" brand palette. That's since been superseded — Veeam's Stitch design tool generates this project's actual mockups from two token files ("Enterprise Precision" light / "Obsidian Precision" dark), and those now take precedence over PRISM for color tokens. Concretely, `secondary` and `tertiary` gain real distinct hues (navy and maroon, light theme) instead of v2's near-duplicate greens and plain grays, and `tier-capacity`/`tier-archive` values change accordingly (see table below). `primary`/`primary-container` stay pinned to v2's values in light mode, since Stitch's own light file reproduces the same seed-vs-computed-tone ambiguity v1 `DESIGN.md` had.

**Tier color tokens**: `DESIGN-v3.md`/`DESIGN-v3-dark.md` define these as dedicated `tier-performance` / `tier-capacity` / `tier-archive` YAML tokens (not aliased to `primary`/`secondary`/`tertiary`, so tier coloring can't drift if semantic button colors change later), currently set equal to the Stitch-rendered semantic tokens:

| Tier                | Light     | Dark      | Source                                                                                                                                      |
| ------------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance (green) | `#007f49` | `#42ee82` | = `primary` in each file                                                                                                                    |
| Capacity (blue)     | `#42636f` | `#9ecaff` | = `secondary` in each file — matches the actual Stitch-rendered mockups                                                                     |
| Archive (gray)      | `#505861` | `#859585` | Light: quoted in Enterprise Precision's own prose as its "secondary metadata" text color. Dark: = `outline`, matching v1's original mapping |

Dark-theme `primary` reverts from v2's PRISM-pinned `#00d15f` back to Obsidian Precision's original `#42ee82` (and `primary-container`/`surface-tint` revert correspondingly) — the Stitch dark file hasn't been regenerated since v1, so "authoritative" here means its original, unedited values.

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

- Vitest + React Testing Library, `jsdom` environment — same `globals`/`environment` shape as the sibling's `vite.config.ts` test block, but pointed at this project's own `setupFiles: "./src/test-setup.ts"`, which imports only `@testing-library/jest-dom` (the sibling's setup file also pulls in `fake-indexeddb/auto`, which doesn't apply here — nothing in this project touches IndexedDB). This project uses colocated `*.test.ts(x)` files rather than the sibling's centralized `src/__tests__/`, so there's no shared setup file to inherit; without `test-setup.ts`, jest-dom matchers like `toBeInTheDocument()` used below have nothing registering them and every such assertion fails.
- `vault-sizer-client.test.ts` covers the API client's request/response plumbing and error handling (fetch mocked)
- `use-theme.test.ts` covers theme resolution and persistence: defaults to `system` and resolves it via `prefers-color-scheme`, persists an explicit user choice to `localStorage`, and reads that persisted choice back on next load
- `site-header.test.tsx` covers the Advanced pill (rendered `aria-disabled`, not clickable, tooltip content present) and the theme toggle cycling through light/dark/system
- No direct unit test for the Cloudflare Pages Function itself (consistent with the sibling project — Pages Functions aren't practically unit-testable outside a Workers runtime)
- CI (`ci.yml`) runs lint + test on push and PR

## CI/CD

Matches the sibling's three-workflow setup exactly — no deviation here, unlike the dev-proxy and theme-toggle changes noted earlier:

- `ci.yml`: lint + test jobs on push to `main` and on PRs
- `publish.yml`: manual-dispatch workflow using `cloudflare/wrangler-action`, deploying `./dist` with `--project-name=veeam-vault-sizer`
- `release.yml`: `googleapis/release-please-action@v4` (`release-type: node`) on push to `main`, opening/updating a release PR from conventional-commit history; when a release PR is merged, a second job in the same workflow builds and deploys to Cloudflare Pages automatically (`if: needs.release-please.outputs.release_created == 'true'`)

## Open Questions / Follow-ups

Design-token decisions above were confirmed during brainstorming; one infra prerequisite for `publish.yml`/`release.yml` is outstanding:

- **Verified gap** (re-checked via `gh secret list` — confirmed empty): this repo has no `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` GitHub Actions secrets configured, unlike the sibling `vdc-vault-readiness`, which has both. A Cloudflare Pages project named `veeam-vault-sizer` (matching `--project-name` in both `publish.yml` and `release.yml`'s deploy job) also needs to exist before either workflow can succeed. Add both secrets and confirm the Pages project before the first deploy is attempted — `ci.yml` (lint/test) has no such dependency and is unaffected.
- **No TypeScript coverage for `functions/`** (flagged in code review of Task 11): `functions/api/vault-sizer.ts` sits outside both `tsconfig.app.json` (`include: ["src"]`) and `tsconfig.node.json` (`include: ["vite.config.ts"]`), so `tsc -b` never type-checks it, and CI (`ci.yml`) only runs lint + test, no build/typecheck step. ESLint's flat config lints it syntactically but without type-aware checking. A real type error in this file — the one file that talks to a third-party API in production — would currently pass CI silently. Fix: add a `functions/` tsconfig project (with `@cloudflare/workers-types` for accurate `Request`/`Response`/`PagesFunction` typing), wire it into the root `tsconfig.json`'s `references` and into `tsc -b`. Best done alongside the Cloudflare Pages deployment work above, since it's new tooling/structure beyond what the scaffold plan specified verbatim.
- **The disabled "Advanced Mode" toggle item is keyboard-selectable despite being visually/mouse disabled** (flagged in code review of Task 13, confirmed empirically via arrow-key + Enter simulation): `ToggleGroupItem`'s roving-focus-group logic (`@radix-ui/react-toggle-group`) only checks the real `disabled` prop for its `focusable` computation, never `aria-disabled` — so despite `tabIndex={-1}`, arrow-key navigation from "Simple Mode" still lands keyboard focus on "Advanced Mode" (arrow-key roving is the WAI-ARIA-sanctioned way to move within a `role="radiogroup"`, not an obscure interaction), and pressing Enter there flips its `aria-checked` to `true`. This is inherent to the plan's own tooltip-on-disabled-item pattern (using the real `disabled` prop instead would kill the tooltip's hover/focus events, defeating the pattern's purpose) — not something introduced by an implementer deviation. Practical impact today is zero: `SiteHeader`'s `ToggleGroup` is uncontrolled (`defaultValue="simple"`, no `onValueChange`) and nothing consumes its value. Fix, when Advanced Mode is actually wired up: make the `ToggleGroup` controlled and reject `"advanced"` in `onValueChange` (e.g. ignore/no-op the change, or re-assert `"simple"`) rather than trusting `aria-disabled` to block selection. An inline comment at `site-header.tsx`'s `value="advanced"` item flags this for whoever adds that wiring.
- **`ci.yml` pins Node 20, which reached end-of-life on 2026-04-30** (flagged in code review of Task 15): not a functional risk today — every installed tool's `engines` range (Vite, ESLint, Vitest) is still satisfied by the latest 20.x patch `actions/setup-node@v4` resolves — but it means CI runs on an unsupported Node line with no further security patches. Inherited verbatim from the plan, which mirrors the sibling `vdc-vault-readiness`'s `ci.yml` as it existed when the plan was written; the sibling's own live workflow has since moved past this pin. Fix: bump to Node 22 or 24 (24 would also match the local dev toolchain) — low urgency since `publish.yml`/`release.yml`'s deploy jobs are already blocked on the Cloudflare secrets gap above, so no live pipeline is exposed by this yet.

Follow-up specs needed before further feature work:

1. Simple Mode calculator: form UI, input→`VmAgentRequest` mapping, results rendering
2. Advanced Mode: Repository Manager, Job Builder, Aggregate Projections
