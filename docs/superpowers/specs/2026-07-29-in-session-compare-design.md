# In-Session Ephemeral Compare — Design

**Roadmap item:** MVP — "In-session, ephemeral compare — hold the current sizing alongside a tweaked one within the same browser session; does not survive a reload." The last unchecked item in the MVP milestone (`ROADMAP.md`).

## Framing

This is Part 1 of the Save feature described in Phase 2 of `ROADMAP.md` — the same "capture the current sizing as a named thing" action, minus persistence. Phase 2 adds a name field the user already has here, and localStorage; it does not reshape the data. Snapshots created here disappear on reload, by design.

## Scope

- N snapshots can exist in the saved list at once — no cap.
- Comparing snapshots against the live sizing is capped at **3 columns total**: Live + up to 2 selected snapshots.
- Session-only. No localStorage, no export. Those are Phase 2 and Phase 3.

## Data model

```ts
interface Snapshot {
  id: string;
  label: string; // "Snapshot 1" by default, user-renameable
  workloadData: WorkloadDataValues;
  repositoryConfig: RepositoryConfigValues;
  data: SizingResult; // the frozen return value of useCalculatedSizing at capture time
}
```

A snapshot freezes the **computed result**, not just the inputs. `data` is the exact value `useCalculatedSizing` returned at the moment of capture — same shape `ProjectedSizingCard` already consumes (`data.mode: "direct" | "copy"`, per-tier breakdown).

Freezing the computed result, rather than only the inputs, matters for two reasons:

- A snapshot must stay stable while the user keeps editing the live form. If snapshots stored only inputs, holding N of them would mean N recalculations firing against the calculator API (`ADR-0001`'s remote BFF) on every keystroke — wasteful, and it would make "held" snapshots not actually held.
- This is exactly the value Phase 2's save serializes. Building compare around any other shape means reshaping it later.

`SimpleModePage` owns the snapshot list as component state (`useState<Snapshot[]>`), alongside its existing `workloadData` and `repositoryConfig` state. No new store or persistence layer.

## UI

### Creating a snapshot

A "Snapshot current sizing" button fills the `actions` placeholder already scaffolded in `ProjectedSizingCard` (`projected-sizing-card.tsx:161-164`). Clicking it appends a new `Snapshot` to the list, auto-labeled `Snapshot N`. The button is disabled whenever `isLoading` is true or `error` is set — a snapshot can't be taken of a stale or failed calculation.

### Browsing snapshots

A list sits in the sidebar, below the live Projected Sizing card. Each row shows:

- The label (inline-renameable)
- The headline total (TB)
- A checkbox — includes this snapshot in the next comparison
- A delete action — removes it from the list

The live sizing keeps recalculating as the user edits the form; snapshots never change after capture.

### Comparing

Checking a snapshot enables a "Compare selected (N)" button. Once 2 snapshots are checked, the remaining checkboxes disable — checking a 3rd requires unchecking one first, since Live always occupies the third column.

Clicking "Compare selected" opens a modal: a dense table, one column per selected sizing plus Live, one row per applicable tier — Total, Performance, Capacity, Archive. Since a snapshot's mode (Direct vs. Copy) can differ from another's or from Live's, the table shows the union of rows that apply across the selected set, and blanks the cell where a given column's sizing has no data for that row (e.g., no Secondary repo in Direct mode).

## Explicit non-goals

- **Persistence.** No localStorage. Phase 2.
- **Delta/diff highlighting** between columns. A worthwhile follow-up, not required to satisfy "hold alongside."
- **Restoring a snapshot into the live form.** Compare is read-only against the snapshot; loading one back into the editable form is a separate feature. Flag if this is wanted sooner.
- **Editing a snapshot's own inputs after capture.** Snapshots are immutable. To explore a variation, snapshot again after editing the live form.

## Testing

Per `superpowers:test-driven-development`, tests precede implementation for:

- Snapshot creation appends the frozen value, not a live reference (mutating live state after snapshotting must not change the snapshot).
- The "Snapshot" button disables during `isLoading` and on `error`.
- Checkbox selection caps at 2; a 3rd checkbox is disabled until one is unchecked.
- The compare table renders the correct row set for mixed Direct/Copy selections, with N/A cells where applicable.
- Deleting a snapshot removes it from both the list and any active comparison selection.
