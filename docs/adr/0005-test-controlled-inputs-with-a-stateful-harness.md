---
status: accepted
---

# Test controlled-component `onChange` behavior with a stateful harness, not a bare mock

`WorkloadDataCard` is a controlled component: its `<Input>` values are bound directly to the `value` prop, with no internal state. Testing "does editing a field call `onChange` with the right value" by rendering with a bare `vi.fn()` onChange and driving input via `user.type()` fails: since the mock never feeds a new value back into `value`, React resets the input's DOM value to the unchanged prop after every keystroke, corrupting multi-character typed input. This surfaced when implementing `workload-data-card.test.tsx`'s "calls onChange with the updated value when a field is edited" test — the plan's original verbatim test (bare mock + `user.type()`) failed against the plan's own correct implementation.

**Considered options**: a single `fireEvent.change` call setting the full target value in one event — works, but exercises a coarser interaction than real typing and diverges from this codebase's `user-event`-first testing convention. A bare mock — rejected, for the reason above.

**Resolution**: wrap the component under test in a small stateful `Harness` (`useState`, feeding `onChange` results back into `value`) that mirrors how the real parent (`SimpleModePage`) actually uses the card. This keeps `user.type()`-style interaction tests working correctly.

**Consequences**: any future controlled form component in this codebase (Vault Configuration inputs, Job Builder's tabular fields) that's tested by typing multi-character input via `user-event` needs the same stateful harness — a bare `vi.fn()` onChange is only safe for single-assertion-per-keystroke tests (e.g. checking the _first_ call), not for driving a multi-character `user.type()` sequence.
