---
status: accepted
---

# `useCalculatedSizing` accepts a Strict-Mode-only first-load delay rather than patching around it

`useCalculatedSizing`'s effect uses a `hasRunRef` to fire its very first dispatch immediately, skipping the 500ms debounce. Under React's `<StrictMode>` (enabled in `main.tsx`), the effect's dev-only double-invoke flips that ref before the surviving invocation runs, so the real initial load gets routed through the debounce anyway — a ~500ms delay before the first sizing result appears, in `npm run dev` only. This does not reproduce in production builds, and isn't exercised by `renderHook`-based tests either.

**Considered options**: resetting `hasRunRef` back to `false` inside the effect's cleanup whenever the invocation being cleaned up was the first run — rejected after tracing it through: cleanup fires before _every_ effect re-run, not just Strict Mode's synthetic one, so this reset also fires on real edits, permanently defeating the 500ms debounce in production (caught by tracing the "rapid edits collapse to one fetch" test case against it). Flipping `hasRunRef` to `true` only inside the dispatch's success branch, instead of synchronously before dispatching, does survive Strict Mode without that regression, but introduces its own edge case — an edit made before the very first request resolves also skips the debounce — for a symptom that's cosmetic and dev-only.

**Consequences**: don't re-attempt the cleanup-reset approach above. It looks correct in isolation and passes a naive "fires immediately under Strict Mode" test, but only fails once traced against a real edit following the initial mount, not just a Strict Mode remount.
