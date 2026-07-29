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

A "Snapshot current sizing" button fills the `actions` placeholder already scaffolded in `ProjectedSizingCard` (`projected-sizing-card.tsx:161-164`). Clicking it appends a new `Snapshot` to the list, auto-labeled `Snapshot N`. The button is disabled whenever `isLoading` is true, `error` is set, or `data` is `null` — a snapshot can't be taken of a stale, failed, or not-yet-computed calculation (the third case covers first load, and any moment validation errors keep the hook from ever dispatching).

### Browsing snapshots

A list sits in the sidebar, below the live Projected Sizing card. Each row shows:

- The label (inline-renameable)
- The headline total (TB)
- A checkbox — includes this snapshot in the next comparison
- A delete action — removes it from the list

The live sizing keeps recalculating as the user edits the form; snapshots never change after capture.

### Comparing

Checking a snapshot enables a "Compare selected (N)" button. Once 2 snapshots are checked, the remaining checkboxes disable — checking a 3rd requires unchecking one first, since Live always occupies the third column.

Clicking "Compare selected" opens a modal with three parts: the sizing comparison (always visible), and two collapsible sections — Workload Data and Repository Configuration — both **collapsed by default**. All three read straight from the frozen `{workloadData, repositoryConfig, data}` triple already stored on each snapshot (and the live equivalent for the Live column) — nothing new needs capturing to support this.

#### Sizing comparison (full parity, always visible)

One column per selected sizing plus Live. Reproduces every figure `SiteSizingSection` shows today, grouped by repository role:

- **Total Required Storage** — one row, top-level.
- **Primary** — the repo a workload backs up to directly (in Direct mode, the only target; in Copy mode, the `primary` repo):
  - Performance / Capacity / Archive (TB) — Capacity and Archive rows only apply when that column's target is a SOBR with the tier enabled. Copy mode's Primary never has Capacity/Archive rows — `PrimaryRepositoryConfig` has no tier subtree.
  - Proxy Compute — Cores, RAM
  - Network Bandwidth — Nightly Incremental, Initial Full/Restore
- **Secondary** — Copy mode's backup-copy target. Same row shape as Primary's Performance/Capacity/Archive/Compute/Bandwidth. Blank for any column that's Direct mode.

A column's mode (Direct vs. Copy) can differ from another's or from Live's. The table shows the union of rows that apply across the selected set and blanks the cell where a given column has no data for that row (e.g., no Secondary rows in a Direct-mode column).

#### Workload Data (collapsible, collapsed by default)

One row per `WorkloadDataValues` field — Source Size, Daily Change Rate, Data Reduction, Yearly Growth, Short-Term Retention, GFS Weekly/Monthly/Yearly, Forecast Horizon, Cap GFS to Forecast Horizon — one column per selected sizing plus Live. Flat: every field applies to every column, no N/A cells.

#### Repository Configuration (collapsible, collapsed by default)

Same applicability pattern as the sizing comparison, not a flat field dump — `RepositoryConfigValues` is deeply conditional (Primary/Secondary retention overrides only exist in Copy mode; the `sobr` subtree only applies when the target is a SOBR; Capacity/Archive fields only apply when those tiers are enabled). Rows, grouped by role:

- **Backup Path** (Direct / Copy) — top-level, always shown.
- **Primary/Target group** — repo type and immutable-days always shown; SOBR-only fields (Performance type, Capacity Tier settings, Archive Tier settings) shown only for columns whose target is a SOBR with that tier enabled; retention override fields shown only when `customizeRetention` is set.
- **Secondary group** (Copy mode only) — same target/SOBR shape as the Primary/Target group, plus the secondary retention override.

Blank cells anywhere a column's mode/target/tier configuration doesn't have that field.

## Explicit non-goals

- **Persistence.** No localStorage. Phase 2.
- **Delta/diff highlighting** between columns. A worthwhile follow-up, not required to satisfy "hold alongside."
- **Restoring a snapshot into the live form.** Compare is read-only against the snapshot; loading one back into the editable form is a separate feature. Flag if this is wanted sooner.
- **Editing a snapshot's own inputs after capture.** Snapshots are immutable. To explore a variation, snapshot again after editing the live form.

## Scope note

The roadmap line for this item reads "hold the current sizing alongside a tweaked one" — singular, two-way. Two decisions here go beyond that literal reading, made deliberately in this design session rather than left implicit: **N-way snapshot storage** (capped at 3-way comparison, not 2-way) and **full-parity comparison with expandable Workload Data / Repository Configuration sections** (not storage-figures-only). Recorded here so the expansion is traceable if it needs revisiting.

## Testing

Per `superpowers:test-driven-development`, tests precede implementation for:

- Snapshot creation appends the frozen value, not a live reference (mutating live state after snapshotting must not change the snapshot).
- The "Snapshot" button disables during `isLoading`, on `error`, and while `data` is `null`.
- Checkbox selection caps at 2; a 3rd checkbox is disabled until one is unchecked.
- The sizing comparison renders the correct row set for mixed Direct/Copy selections, with N/A cells where applicable (including Primary vs. Secondary grouping and Capacity/Archive tier applicability).
- The Workload Data and Repository Configuration sections default to collapsed, and the Repository Configuration section's row set follows the same conditional-applicability rule as the sizing comparison (SOBR-only, tier-enabled-only, and retention-override-only fields blank out correctly).
- Deleting a snapshot removes it from both the list and any active comparison selection.
