# Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the veeam-vault-sizer repo — tooling, project structure, design tokens, app shell, and a working sizing API layer — matching the approved design in `docs/superpowers/specs/2026-07-03-project-scaffold-design.md`.

**Architecture:** A Vite + React 19 + TypeScript SPA styled with Tailwind v4 (CSS-first `@theme`) and shadcn/ui (`new-york` style). Sizing math is delegated to Veeam's existing public calculator API, reached through a Cloudflare Pages Function proxy in production and a Vite dev-server proxy locally — both forwarding to the same route. The app shell renders a header (title, disabled "Advanced" pill, light/dark/system theme toggle) and a placeholder where the Simple Mode calculator will go in a follow-up.

**Tech Stack:** Vite, React 19, TypeScript (strict), Tailwind CSS v4, shadcn/ui, Vitest, React Testing Library, ESLint, Prettier, Husky, lint-staged, commitlint, Cloudflare Pages, GitHub Actions, release-please.

---

## Reference material

- Spec: `docs/superpowers/specs/2026-07-03-project-scaffold-design.md`
- Design tokens: `DESIGN-v3.md` (light, "Enterprise Precision"), `DESIGN-v3-dark.md` (dark, "Obsidian Precision")
- Tailwind v4 rules: `.claude/rules/tailwindcss.md`
- Sibling project (source of the API contract and tooling conventions): `/Users/b.thomas/git/github/comnam90/vdc-vault-readiness`

All OKLCH color values below were converted from the hex values in `DESIGN-v3.md`/`DESIGN-v3-dark.md` using the standard sRGB→OKLab→OKLCH formulas (Björn Ottosson's reference implementation) — they are exact, not approximations.

---

### Task 1: Project skeleton (package.json, Vite, React)

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `.gitignore` — already exists and already covers `node_modules/`, `dist`, `*.tsbuildinfo`, `coverage`; no changes needed.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "veeam-vault-sizer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 2: Install React**

Run: `npm install react react-dom`

- [ ] **Step 3: Install Vite + the React plugin + TypeScript**

Run: `npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom`

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Veeam Data Cloud Vault Sizer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Create `src/App.tsx`** (temporary — replaced in Task 14)

```tsx
function App() {
  return <div>Veeam Data Cloud Vault Sizer</div>;
}

export default App;
```

- [ ] **Step 8: Verify the build works**

Run: `npx vite build`
Expected: succeeds, prints a `dist/` output summary with no errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json vite.config.ts index.html src/main.tsx src/App.tsx
git commit -m "chore: scaffold Vite + React project skeleton"
```

---

### Task 2: TypeScript project configuration

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Modify: `package.json` (build script, path alias not needed here — added in vite.config.ts too)
- Modify: `vite.config.ts` (add `@` path alias resolution)

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 2: Create `tsconfig.app.json`**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client", "vitest/globals"],
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,

    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "types": ["node"],
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Install Node types (needed by `tsconfig.node.json`)**

Run: `npm install -D @types/node`

- [ ] **Step 5: Add the `@` path alias to `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 6: Upgrade the build script to type-check first**

Edit `package.json`'s `scripts.build`:

```json
"build": "tsc -b && vite build",
```

- [ ] **Step 7: Verify**

Run: `npm run build`
Expected: succeeds — `tsc -b` reports no errors, then Vite builds `dist/`.

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts package.json package-lock.json
git commit -m "chore: add TypeScript project references and path alias"
```

---

### Task 3: ESLint + Prettier

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc`

- [ ] **Step 1: Install ESLint and Prettier tooling**

Run: `npm install -D eslint @eslint/js typescript-eslint eslint-plugin-react-hooks eslint-plugin-react-refresh globals prettier prettier-plugin-tailwindcss`

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
```

- [ ] **Step 3: Create `.prettierrc`**

```json
{
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 4: Add the lint script**

Edit `package.json`'s `scripts`:

```json
"lint": "eslint .",
```

- [ ] **Step 5: Verify**

Run: `npm run lint`
Expected: exits 0, no errors (there may be no lintable issues yet since the codebase is tiny).

- [ ] **Step 6: Commit**

```bash
git add eslint.config.js .prettierrc package.json package-lock.json
git commit -m "chore: add ESLint and Prettier configuration"
```

---

### Task 4: Git hooks — Husky, lint-staged, commitlint

**Files:**
- Create: `commitlint.config.js`
- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Modify: `package.json` (`prepare` script, `lint-staged` config)

- [ ] **Step 1: Install tooling**

Run: `npm install -D husky lint-staged @commitlint/cli @commitlint/config-conventional`

- [ ] **Step 2: Create `commitlint.config.js`**

```js
export default { extends: ["@commitlint/config-conventional"] };
```

- [ ] **Step 3: Add the `lint-staged` config and `prepare` script to `package.json`**

Add to the top level of `package.json`:

```json
"lint-staged": {
  "**/*.{ts,tsx,js,jsx,cjs,mjs,json,md}": [
    "prettier --write"
  ]
},
```

Add to `scripts`:

```json
"prepare": "husky",
```

- [ ] **Step 4: Initialize Husky**

Run: `npx husky init`
Expected: creates `.husky/pre-commit` (with a default `npm test` line) and adds the `prepare` script if missing (already added in Step 3).

- [ ] **Step 5: Replace `.husky/pre-commit` contents**

```bash
npx lint-staged
```

- [ ] **Step 6: Create `.husky/commit-msg`**

```bash
npx --no -- commitlint --edit $1
```

- [ ] **Step 7: Verify**

Run: `chmod +x .husky/pre-commit .husky/commit-msg` (Husky's `init` usually sets this, but confirm)
Run: `git add -A && git commit -m "test: verify hooks"` in a scratch check — do **not** actually run this now; instead verify the hook files are executable and readable:
Run: `ls -la .husky`
Expected: `pre-commit` and `commit-msg` both present and executable (`-rwxr-xr-x`).

- [ ] **Step 8: Commit**

```bash
git add commitlint.config.js .husky package.json package-lock.json
git commit -m "chore: add Husky, lint-staged, and commitlint"
```

---

### Task 5: Tailwind CSS v4 + shadcn/ui base setup

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `vite.config.ts` (add Tailwind plugin)
- Modify: `src/index.css` (created here as a minimal Tailwind entrypoint; full design tokens added in Task 6)
- Modify: `src/main.tsx` (import `./index.css`)

- [ ] **Step 1: Install Tailwind v4 and its Vite plugin**

Run: `npm install tailwindcss @tailwindcss/vite`

- [ ] **Step 2: Install shadcn/ui's runtime dependencies**

Run: `npm install class-variance-authority clsx tailwind-merge lucide-react radix-ui tw-animate-css`

- [ ] **Step 3: Add the Tailwind plugin to `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Create a minimal `src/index.css`** (full design tokens added in Task 6)

```css
@import "tailwindcss";
```

- [ ] **Step 5: Import it from `src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Create `src/lib/utils.ts`** (shadcn's `cn()` helper)

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 7: Create `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "registries": {}
}
```

- [ ] **Step 8: Verify**

Run: `npm run build`
Expected: succeeds. (Tailwind has nothing to generate yet beyond its reset/base, which is fine.)

- [ ] **Step 9: Commit**

```bash
git add vite.config.ts src/index.css src/main.tsx src/lib/utils.ts components.json package.json package-lock.json
git commit -m "chore: install Tailwind CSS v4 and shadcn/ui base dependencies"
```

---

### Task 6: Design tokens — colors, fonts, dark mode, FOUC prevention

**Files:**
- Modify: `src/index.css` (full design tokens)
- Modify: `index.html` (Google Fonts, FOUC-prevention inline script)

This task encodes `DESIGN-v3.md` (light) and `DESIGN-v3-dark.md` (dark) as CSS variables, plus the three dedicated tier-color tokens, using OKLCH per `.claude/rules/tailwindcss.md`. The exact hex→OKLCH conversions used below (computed via the standard sRGB→OKLab→OKLCH formulas):

| Token | Light hex | Light OKLCH | Dark hex | Dark OKLCH |
|---|---|---|---|---|
| background | `#f6fbf3` | `oklch(0.982 0.012 133.4)` | `#131313` | `oklch(0.187 0 0)` |
| foreground | `#171d18` | `oklch(0.223 0.013 150.0)` | `#e5e2e1` | `oklch(0.915 0.004 39.5)` |
| card / popover | `#ffffff` | `oklch(1 0 0)` | `#0e0e0e` | `oklch(0.164 0 0)` |
| primary | `#007f49` | `oklch(0.524 0.128 155.7)` | `#42ee82` | `oklch(0.839 0.203 151.1)` |
| primary-foreground | `#ffffff` | `oklch(1 0 0)` | `#003918` | `oklch(0.302 0.080 151.5)` |
| secondary | `#42636f` | `oklch(0.479 0.043 222.7)` | `#9ecaff` | `oklch(0.827 0.088 253.4)` |
| secondary-foreground | `#ffffff` | `oklch(1 0 0)` | `#003258` | `oklch(0.310 0.084 248.2)` |
| muted | `#dfe4dc` | `oklch(0.913 0.012 133.4)` | `#353534` | `oklch(0.329 0.002 106.5)` |
| muted-foreground | `#3e4940` | `oklch(0.393 0.021 150.6)` | `#bbcbba` | `oklch(0.825 0.029 143.7)` |
| accent | `#eaefe8` | `oklch(0.946 0.011 136.6)` | `#201f1f` | `oklch(0.240 0.002 17.3)` |
| accent-foreground | `#171d18` | `oklch(0.223 0.013 150.0)` | `#e5e2e1` | `oklch(0.915 0.004 39.5)` |
| destructive | `#ba1a1a` | `oklch(0.506 0.193 27.7)` | `#ffb4ab` | `oklch(0.838 0.089 26.8)` |
| destructive-foreground | `#ffffff` | `oklch(1 0 0)` | `#690005` | `oklch(0.328 0.134 27.3)` |
| border | `#bdcabe` | `oklch(0.826 0.022 147.6)` | `#3c4a3d` | `oklch(0.393 0.028 146.9)` |
| input | `#6e7a70` | `oklch(0.566 0.021 150.3)` | `#859585` | `oklch(0.652 0.030 145.2)` |
| ring | = primary | = primary | = primary | = primary |
| tier-performance | = primary | = primary | = primary | = primary |
| tier-capacity | = secondary | = secondary | = secondary | = secondary |
| tier-archive | `#505861` | `oklch(0.457 0.018 251.3)` | `#859585` | `oklch(0.652 0.030 145.2)` |

- [ ] **Step 1: Replace `src/index.css`**

```css
@import "tailwindcss";

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

:root {
  --background: oklch(0.982 0.012 133.4);
  --foreground: oklch(0.223 0.013 150.0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.223 0.013 150.0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.223 0.013 150.0);
  --primary: oklch(0.524 0.128 155.7);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.479 0.043 222.7);
  --secondary-foreground: oklch(1 0 0);
  --muted: oklch(0.913 0.012 133.4);
  --muted-foreground: oklch(0.393 0.021 150.6);
  --accent: oklch(0.946 0.011 136.6);
  --accent-foreground: oklch(0.223 0.013 150.0);
  --destructive: oklch(0.506 0.193 27.7);
  --destructive-foreground: oklch(1 0 0);
  --border: oklch(0.826 0.022 147.6);
  --input: oklch(0.566 0.021 150.3);
  --ring: oklch(0.524 0.128 155.7);

  --tier-performance: oklch(0.524 0.128 155.7);
  --tier-capacity: oklch(0.479 0.043 222.7);
  --tier-archive: oklch(0.457 0.018 251.3);
}

[data-theme="dark"] {
  --background: oklch(0.187 0 0);
  --foreground: oklch(0.915 0.004 39.5);
  --card: oklch(0.164 0 0);
  --card-foreground: oklch(0.915 0.004 39.5);
  --popover: oklch(0.164 0 0);
  --popover-foreground: oklch(0.915 0.004 39.5);
  --primary: oklch(0.839 0.203 151.1);
  --primary-foreground: oklch(0.302 0.080 151.5);
  --secondary: oklch(0.827 0.088 253.4);
  --secondary-foreground: oklch(0.310 0.084 248.2);
  --muted: oklch(0.329 0.002 106.5);
  --muted-foreground: oklch(0.825 0.029 143.7);
  --accent: oklch(0.240 0.002 17.3);
  --accent-foreground: oklch(0.915 0.004 39.5);
  --destructive: oklch(0.838 0.089 26.8);
  --destructive-foreground: oklch(0.328 0.134 27.3);
  --border: oklch(0.393 0.028 146.9);
  --input: oklch(0.652 0.030 145.2);
  --ring: oklch(0.839 0.203 151.1);

  --tier-performance: oklch(0.839 0.203 151.1);
  --tier-capacity: oklch(0.827 0.088 253.4);
  --tier-archive: oklch(0.652 0.030 145.2);
}

@theme inline {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --radius-sm: 0.125rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-tier-performance: var(--tier-performance);
  --color-tier-capacity: var(--tier-capacity);
  --color-tier-archive: var(--tier-archive);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground font-sans;
  }
}
```

- [ ] **Step 2: Add Google Fonts + the FOUC-prevention script to `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
    />
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
    <title>Veeam Data Cloud Vault Sizer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`, open the printed local URL in a browser.
Expected: page background is a very light green-tinted white (`#f6fbf3`-ish), text is near-black. Toggle the OS/browser dark mode preference and reload — background should switch to near-black (`#131313`) with no visible flash of the wrong theme before paint. Stop the dev server (Ctrl+C) when done.

- [ ] **Step 4: Commit**

```bash
git add src/index.css index.html
git commit -m "feat: wire DESIGN-v3 tokens into Tailwind, add FOUC-safe theme bootstrap"
```

---

### Task 7: Add shadcn/ui components

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/tooltip.tsx`
- Create: `src/components/ui/toggle.tsx`
- Create: `src/components/ui/toggle-group.tsx`

- [ ] **Step 1: Run the shadcn CLI to add the components this scaffold needs**

Run: `npx shadcn@latest add button card tooltip toggle-group`
Expected: the CLI detects `components.json`, writes the five files listed above into `src/components/ui/`, and reports success. `toggle-group` pulls in `toggle` as a dependency automatically.

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui
git commit -m "chore: add shadcn/ui button, card, tooltip, and toggle-group components"
```

---

### Task 8: Vitest + React Testing Library setup

**Files:**
- Create: `src/test-setup.ts`
- Modify: `vite.config.ts` (switch to `vitest/config`, add `test` block)
- Modify: `package.json` (test scripts)

- [ ] **Step 1: Install test dependencies**

Run: `npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @vitest/coverage-v8`

`@testing-library/user-event` is needed beyond what the sibling project uses — it's required in Task 13 to reliably simulate hover/focus for testing the Tooltip's keyboard/mouse accessibility, which `fireEvent` can't do accurately.

- [ ] **Step 2: Create `src/test-setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 3: Switch `vite.config.ts` to `vitest/config` and add the `test` block**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
```

- [ ] **Step 4: Add `vitest/globals` awareness and test scripts**

`tsconfig.app.json` already includes `"vitest/globals"` in its `types` array (Task 2), so `describe`/`it`/`expect` are typed without imports.

Edit `package.json`'s `scripts`:

```json
"test": "vitest",
"test:run": "vitest run",
"test:coverage": "vitest run --coverage",
```

- [ ] **Step 5: Write a smoke test to prove the setup works**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByText(/veeam data cloud vault sizer/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it and verify it passes**

Run: `npm run test:run`
Expected: 1 test file, 1 test, PASS. If `toBeInTheDocument` is not recognized as a matcher, `test-setup.ts` isn't wired up — check `setupFiles` in `vite.config.ts`.

- [ ] **Step 7: Delete the smoke test**

It served only to prove the harness works; `App.tsx` gets real content and a real test in Task 14.

Run: `rm src/App.test.tsx`

- [ ] **Step 8: Commit**

```bash
git add src/test-setup.ts vite.config.ts package.json package-lock.json
git commit -m "chore: add Vitest and React Testing Library"
```

---

### Task 9: Port the sizing API types

**Files:**
- Create: `src/types/vault-sizer-api.ts`

- [ ] **Step 1: Create `src/types/vault-sizer-api.ts`**

Ported verbatim from `vdc-vault-readiness`'s `src/types/veeam-api.ts` — this is the full, already-proven contract for Veeam's `VmAgent` sizing API.

```ts
export interface GfsPolicy {
  isDefined: boolean;
  weeks: number;
  months: number;
  years: number;
}

export interface RetentionPolicy {
  days: number;
  gfs: GfsPolicy;
  isGfsDefined: boolean;
}

export interface VmAgentRequest {
  sourceTB: number;
  ChangeRate: number;
  Reduction: number;
  backupWindowHours: number;
  GrowthRatePercent: number;
  GrowthRateScopeYears: number;
  blockGenerationDays: number;
  retention: RetentionPolicy;
  days: number;
  Weeklies: number;
  Monthlies: number;
  Yearlies: number;
  Blockcloning: boolean;
  ObjectStorage: boolean;
  moveCapacityTierEnabled: boolean;
  capacityTierDays: number;
  copyCapacityTierEnabled: boolean;
  immutablePerf: boolean;
  immutablePerfDays: number;
  immutableCap: boolean;
  immutableCapDays: number;
  archiveTierEnabled: boolean;
  archiveTierStandalone: boolean;
  archiveTierDays: number;
  isCapTierVDCV: boolean;
  isManaged: boolean;
  machineType: number;
  hyperVisor: number;
  calculatorMode: number;
  productVersion: number;
  instanceCount: number;
}

export interface ComputeVolume {
  diskGB: number;
  diskPurpose: number; // 3=perf, 13=capacity/cache, 4=logs
}

export interface ComputeSpec {
  cores: number;
  ram: number;
  volumes: ComputeVolume[];
}

export interface ComputeNode {
  compute: ComputeSpec;
}

export interface MonthlyTransactions {
  firstMonthTransactions: number;
  secondMonthTransactions: number;
  finalMonthTransactions: number;
}

export interface TransactionCosts {
  performanceTierTransactions?: MonthlyTransactions;
  capacityTierTransactions?: MonthlyTransactions;
  archiveTierTransactions?: MonthlyTransactions;
}

export interface RestorePoint {
  /** Observed: "performanceTier". Capacity/archive tier values may appear in future responses. */
  pointType: string;
  /** 1 = newest daily; higher = older. Yearly retention has been seen as high as 1099. */
  day: number;
  /** TB. The API returns this already-converted; do not divide by 1024. */
  backupCapacity: number;
  isFull: boolean;
  isGFS: boolean;
  isImmutable: boolean;
  /**
   * Space-separated tier tokens. Each token starts with D|W|M|Y followed by an
   * index, e.g. "D5", "W2", "M12", "Y3". Multi-tier points concatenate tokens
   * with a space, e.g. "M12 Y1".
   */
  flags: string;
}

export interface VmAgentResponseData {
  totalStorageTB: number;
  proxyCompute: ComputeNode;
  repoCompute: ComputeNode;
  transactions: TransactionCosts;
  performanceTierImmutabilityTaxGB: number;
  capacityTierImmutabilityTaxGB: number;
  restorePoints?: RestorePoint[];
  /** Other fields the API returns; typed for completeness, not currently consumed. */
  id?: number | string;
  name?: string;
  siteId?: number | string;
  siteName?: string;
  indexResults?: unknown;
  workspaceGB?: number;
}

export interface VmAgentResponse {
  success: boolean;
  data: VmAgentResponseData;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/vault-sizer-api.ts
git commit -m "feat: port VmAgent sizing API types from vdc-vault-readiness"
```

---

### Task 10: Sizing API client (TDD)

**Files:**
- Create: `src/lib/api/vault-sizer-client.ts`
- Test: `src/lib/api/vault-sizer-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/vault-sizer-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callVaultSizerApi } from "./vault-sizer-client";
import type { VmAgentRequest, VmAgentResponse } from "@/types/vault-sizer-api";

const minimalRequest: VmAgentRequest = {
  sourceTB: 10,
  ChangeRate: 3,
  Reduction: 50,
  backupWindowHours: 8,
  GrowthRatePercent: 10,
  GrowthRateScopeYears: 3,
  blockGenerationDays: 10,
  retention: {
    days: 30,
    gfs: { isDefined: true, weeks: 4, months: 12, years: 3 },
    isGfsDefined: true,
  },
  days: 30,
  Weeklies: 4,
  Monthlies: 12,
  Yearlies: 3,
  Blockcloning: true,
  ObjectStorage: true,
  moveCapacityTierEnabled: false,
  capacityTierDays: 14,
  copyCapacityTierEnabled: false,
  immutablePerf: true,
  immutablePerfDays: 30,
  immutableCap: true,
  immutableCapDays: 30,
  archiveTierEnabled: false,
  archiveTierStandalone: false,
  archiveTierDays: 90,
  isCapTierVDCV: true,
  isManaged: true,
  machineType: 0,
  hyperVisor: 0,
  calculatorMode: 0,
  productVersion: 0,
  instanceCount: 1,
};

const mockResponse: VmAgentResponse = {
  success: true,
  data: {
    totalStorageTB: 18.4,
    proxyCompute: { compute: { cores: 4, ram: 8, volumes: [] } },
    repoCompute: { compute: { cores: 8, ram: 16, volumes: [] } },
    transactions: {},
    performanceTierImmutabilityTaxGB: 0,
    capacityTierImmutabilityTaxGB: 0,
  },
};

describe("callVaultSizerApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the request to /api/vault-sizer and returns the parsed response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await callVaultSizerApi(minimalRequest);

    expect(fetch).toHaveBeenCalledWith("/api/vault-sizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(minimalRequest),
    });
    expect(result).toEqual(mockResponse);
  });

  it("throws a descriptive error when the response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 500, statusText: "Internal Server Error" }),
    );

    await expect(callVaultSizerApi(minimalRequest)).rejects.toThrow(
      "Vault Sizer API error: 500 Internal Server Error",
    );
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/lib/api/vault-sizer-client.test.ts`
Expected: FAIL — `Cannot find module './vault-sizer-client'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/api/vault-sizer-client.ts`:

```ts
import type { VmAgentRequest, VmAgentResponse } from "@/types/vault-sizer-api";

const API_URL = "/api/vault-sizer";

export async function callVaultSizerApi(
  request: VmAgentRequest,
): Promise<VmAgentResponse> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(
      `Vault Sizer API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json() as Promise<VmAgentResponse>;
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/lib/api/vault-sizer-client.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/vault-sizer-client.ts src/lib/api/vault-sizer-client.test.ts
git commit -m "feat: add sizing API client with request/error-path tests"
```

---

### Task 11: Cloudflare Pages Function proxy + Vite dev-mode proxy

**Files:**
- Create: `functions/api/vault-sizer.ts`
- Modify: `vite.config.ts` (dev-mode `server.proxy`)

- [ ] **Step 1: Create the Cloudflare Pages Function**

```ts
const VAULT_SIZER_API_URL = "https://calculator.veeam.com/vse/api/VmAgent";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context: {
  request: Request;
}): Promise<Response> {
  const body: unknown = await context.request.json();

  const upstream = await fetch(VAULT_SIZER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data: unknown = await upstream.json();

  return new Response(JSON.stringify(data), {
    status: upstream.ok ? 200 : upstream.status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
```

- [ ] **Step 2: Add the dev-mode proxy to `vite.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api/vault-sizer": {
        target: "https://calculator.veeam.com",
        changeOrigin: true,
        rewrite: () => "/vse/api/VmAgent",
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
```

- [ ] **Step 3: Verify the dev proxy actually reaches the real API**

Run: `npm run dev` in one terminal.
Run, in another terminal, while dev server is up:

```bash
curl -s -X POST http://localhost:5173/api/vault-sizer \
  -H "Content-Type: application/json" \
  -d '{"sourceTB":10,"ChangeRate":3,"Reduction":50,"backupWindowHours":8,"GrowthRatePercent":10,"GrowthRateScopeYears":3,"blockGenerationDays":10,"retention":{"days":30,"gfs":{"isDefined":true,"weeks":4,"months":12,"years":3},"isGfsDefined":true},"days":30,"Weeklies":4,"Monthlies":12,"Yearlies":3,"Blockcloning":true,"ObjectStorage":true,"moveCapacityTierEnabled":false,"capacityTierDays":14,"copyCapacityTierEnabled":false,"immutablePerf":true,"immutablePerfDays":30,"immutableCap":true,"immutableCapDays":30,"archiveTierEnabled":false,"archiveTierStandalone":false,"archiveTierDays":90,"isCapTierVDCV":true,"isManaged":true,"machineType":0,"hyperVisor":0,"calculatorMode":0,"productVersion":0,"instanceCount":1}'
```

Expected: a JSON response with `"success":true` and a `"data"` object containing `"totalStorageTB"`. If the port differs from `5173`, use whatever `npm run dev` printed. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add functions/api/vault-sizer.ts vite.config.ts
git commit -m "feat: add Cloudflare Pages Function proxy and Vite dev-mode proxy for the sizing API"
```

---

### Task 12: Theme hook (TDD)

**Files:**
- Create: `src/hooks/use-theme.ts`
- Test: `src/hooks/use-theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/use-theme.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./use-theme";

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  let changeListener: (() => void) | null = null;
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_event: string, listener: () => void) => {
      changeListener = listener;
    },
    removeEventListener: () => {
      changeListener = null;
    },
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    setMatches: (value: boolean) => {
      matches = value;
      changeListener?.();
    },
  };
}

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to system and resolves via prefers-color-scheme (dark)", () => {
    mockMatchMedia(true);
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("defaults to system and resolves via prefers-color-scheme (light)", () => {
    mockMatchMedia(false);
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("persists an explicit choice to localStorage and applies it", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("reads a persisted choice back on next mount", () => {
    mockMatchMedia(true);
    window.localStorage.setItem("theme", "light");

    renderHook(() => useTheme());

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("returning to system removes the persisted choice", () => {
    mockMatchMedia(true);
    window.localStorage.setItem("theme", "light");
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("system");
    });

    expect(window.localStorage.getItem("theme")).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("updates data-theme live when the OS preference changes while in system mode", () => {
    const media = mockMatchMedia(false);
    renderHook(() => useTheme());
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    act(() => {
      media.setMatches(true);
    });

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/hooks/use-theme.test.ts`
Expected: FAIL — `Cannot find module './use-theme'`.

- [ ] **Step 3: Write the implementation**

Create `src/hooks/use-theme.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredTheme(): Theme {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolveTheme(theme));

    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.setAttribute("data-theme", getSystemTheme());
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    if (next === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    setThemeState(next);
  }, []);

  return { theme, setTheme };
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/hooks/use-theme.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-theme.ts src/hooks/use-theme.test.ts
git commit -m "feat: add light/dark/system theme hook with persistence"
```

---

### Task 13: Site header — mode pill + theme toggle (TDD)

**Files:**
- Create: `src/components/layout/site-header.tsx`
- Test: `src/components/layout/site-header.test.tsx`

This implements the tooltip-on-disabled-item accessibility pattern from the spec: a native `disabled` button on `ToggleGroupItem` would stop the Tooltip from ever receiving hover/focus events, so the Advanced item is kept interactive-but-inert (`aria-disabled`, `tabIndex={-1}`, `pointer-events-none`) and wrapped in a focusable `<span>` that the Tooltip actually attaches to.

- [ ] **Step 1: Write the failing test**

Create `src/components/layout/site-header.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteHeader } from "./site-header";

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function renderHeader() {
  return render(
    <TooltipProvider delayDuration={0}>
      <SiteHeader />
    </TooltipProvider>,
  );
}

describe("SiteHeader", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockMatchMedia(false);
  });

  it("renders the app title", () => {
    renderHeader();
    expect(
      screen.getByRole("heading", { name: /veeam data cloud vault sizer/i }),
    ).toBeInTheDocument();
  });

  it("keeps the Advanced option disabled and out of tab order", () => {
    renderHeader();
    const advanced = screen.getByRole("button", { name: /advanced mode/i });
    expect(advanced).toHaveAttribute("aria-disabled", "true");
    expect(advanced).toHaveAttribute("tabindex", "-1");
  });

  it("shows a Coming soon tooltip when the Advanced trigger is hovered", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.hover(screen.getByText("Advanced Mode"));

    expect(await screen.findByText("Coming soon")).toBeInTheDocument();
  });

  it("cycles the theme through light, dark, and system on repeated clicks", async () => {
    const user = userEvent.setup();
    renderHeader();

    const toggle = screen.getByRole("button", { name: /theme:/i });
    expect(toggle).toHaveAccessibleName(/theme: system/i);

    await user.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(toggle).toHaveAccessibleName(/theme: light/i);

    await user.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    await user.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe(
      "system",
    );
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx vitest run src/components/layout/site-header.test.tsx`
Expected: FAIL — `Cannot find module './site-header'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/layout/site-header.tsx`:

```tsx
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme, type Theme } from "@/hooks/use-theme";

const THEME_ORDER: Theme[] = ["light", "dark", "system"];

const THEME_ICON = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

export function SiteHeader() {
  const { theme, setTheme } = useTheme();

  const nextTheme =
    THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
  const ThemeIcon = THEME_ICON[theme];

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <h1 className="text-xl font-semibold text-foreground">
        Veeam Data Cloud Vault Sizer
      </h1>

      <div className="flex items-center gap-4">
        <ToggleGroup type="single" defaultValue="simple" aria-label="Mode">
          <ToggleGroupItem value="simple">Simple Mode</ToggleGroupItem>

          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="cursor-not-allowed">
                <ToggleGroupItem
                  value="advanced"
                  aria-disabled="true"
                  tabIndex={-1}
                  className="pointer-events-none opacity-50"
                >
                  Advanced Mode
                </ToggleGroupItem>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        </ToggleGroup>

        <Button
          variant="ghost"
          size="icon"
          aria-label={`Theme: ${theme}. Click to switch to ${nextTheme}.`}
          onClick={() => setTheme(nextTheme)}
        >
          <ThemeIcon className="size-4" />
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run it and verify it passes**

Run: `npx vitest run src/components/layout/site-header.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/site-header.tsx src/components/layout/site-header.test.tsx
git commit -m "feat: add site header with mode pill and theme toggle"
```

---

### Task 14: App shell wiring

**Files:**
- Create: `src/components/layout/app-shell.tsx`
- Create: `src/components/simple-mode/simple-mode-placeholder.tsx`
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Create `src/components/layout/app-shell.tsx`**

```tsx
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteHeader } from "./site-header";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Create `src/components/simple-mode/simple-mode-placeholder.tsx`**

```tsx
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SimpleModePlaceholder() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Simple Mode calculator — coming soon</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Workload inputs and sizing results will appear here.
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Replace `src/App.tsx`**

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { SimpleModePlaceholder } from "@/components/simple-mode/simple-mode-placeholder";

function App() {
  return (
    <AppShell>
      <SimpleModePlaceholder />
    </AppShell>
  );
}

export default App;
```

- [ ] **Step 4: Write a real test for `App`**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the header title and the Simple Mode placeholder", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /veeam data cloud vault sizer/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/simple mode calculator — coming soon/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run all tests and verify they pass**

Run: `npm run test:run`
Expected: all test files pass (client, theme hook, site header, App).

- [ ] **Step 6: Verify visually**

Run: `npm run dev`, open the printed URL.
Expected: header with title, "Simple Mode" pill (active) and grayed-out "Advanced Mode" pill, theme toggle icon button, and a centered "Simple Mode calculator — coming soon" card below. Hover the Advanced pill — a "Coming soon" tooltip appears. Click the theme icon — background/text colors switch between light and dark. Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/app-shell.tsx src/components/simple-mode/simple-mode-placeholder.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: wire app shell and Simple Mode placeholder into App"
```

---

### Task 15: CI/CD workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/publish.yml`
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches:
      - main
  pull_request: {}

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm install

      - name: Lint
        run: npm run lint

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm install

      - name: Test
        run: npm run test:run
```

- [ ] **Step 2: Create `.github/workflows/publish.yml`**

```yaml
name: Deploy to Cloudflare Pages (Manual)

on:
  workflow_dispatch: # Manual trigger only — automatic deploys run via release.yml

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy
    permissions:
      contents: read
      deployments: write
    steps:
      - uses: actions/checkout@v4

      - name: Install & Build
        run: |
          npm install
          npm run build

      - name: Deploy to Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy ./dist --project-name=veeam-vault-sizer --branch=main
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Create `.github/workflows/release.yml`**

```yaml
name: Release Please

on:
  push:
    branches:
      - main

permissions:
  contents: write
  pull-requests: write
  deployments: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          release-type: node

  deploy:
    runs-on: ubuntu-latest
    name: Deploy to Cloudflare Pages
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created == 'true' }}
    steps:
      - uses: actions/checkout@v4

      - name: Install & Build
        run: |
          npm install
          npm run build

      - name: Deploy to Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy ./dist --project-name=veeam-vault-sizer --branch=main
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Note the outstanding infra prerequisite (do not attempt to fix in this task)**

Per the spec's Open Questions: `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN` GitHub Actions secrets and a Cloudflare Pages project named `veeam-vault-sizer` must exist before `publish.yml` or `release.yml`'s deploy job can succeed. `ci.yml` has no such dependency. This is an account-level action for whoever has Cloudflare/GitHub admin access — out of scope for this plan.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/publish.yml .github/workflows/release.yml
git commit -m "chore: add CI, manual publish, and release-please workflows"
```

---

### Task 16: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full lint**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 2: Full type-check + build**

Run: `npm run build`
Expected: exits 0, `dist/` produced.

- [ ] **Step 3: Full test suite**

Run: `npm run test:run`
Expected: all tests pass (client, theme hook, site header, App — 4 files).

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, open the printed URL, and confirm all of:
1. No flash of the wrong theme on load (reload the page a few times with OS dark mode on, then off).
2. Header renders title, Simple/Advanced pill (Advanced visibly disabled), theme toggle icon.
3. Hovering Advanced shows "Coming soon"; clicking it does nothing.
4. Clicking the theme icon cycles light → dark → system, and the page's colors actually change each time.
5. The centered placeholder card is visible below the header.

Stop the dev server when done.

- [ ] **Step 5: Confirm git status is clean**

Run: `git status`
Expected: working tree clean, all scaffold commits present on `main` (or whatever branch this was executed on).
