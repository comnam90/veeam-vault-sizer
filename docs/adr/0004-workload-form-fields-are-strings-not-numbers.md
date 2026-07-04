---
status: accepted
---

# Simple Mode form field values are modeled as strings, not numbers

Workload Data's six inputs are logically numeric (TB, %, days, counts), but `WorkloadDataValues` stores each field as a raw string rather than a `number`. A `number`-typed controlled input can't represent states a user's typing passes through — a field cleared to retype, a lone `-` or trailing decimal point mid-entry (e.g. `"10."` before `"10.5"`), non-numeric paste — without coercing to `0` or `NaN` on every keystroke.

**Considered options**: keep the fields as `number` and coerce with `Number(input)` on change — rejected, because `NaN`/`0` coercion either fails validation confusingly mid-keystroke (e.g. clearing "10" to retype briefly reads as `0`, which fails Source Size's `> 0` rule before the user finishes typing) or silently reads as "valid" while the field is blank, depending on the rule.

**Consequences**: `validateWorkloadData` and the later `VmAgentRequest`-mapping step (a follow-up spec) are each responsible for parsing the string into a number at their own boundary — the raw value is never assumed numeric until explicitly parsed. This precedent should extend to any future Advanced Mode or Vault Configuration numeric fields built the same way.
