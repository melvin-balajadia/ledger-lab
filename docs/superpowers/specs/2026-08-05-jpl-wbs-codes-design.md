# Phase 4: JPL/WBS codes management — design spec

## Context

Fourth phase of "Make the System Dynamic" (see Phase 1–3 specs for the
roadmap and established pattern). Scoped deliberately narrower than "full
tree editor" — see below for why.

## What the real data ruled out before designing

- **`parent_id` is populated on only ~40% of the 127 planning lines** — a
  pre-existing ETL gap, already documented in `sortCodes.ts`: the reliable
  hierarchy signal is the *code string's own dot-segments*
  (`"3.2.1"` under `"3.2"` under `"3.0"`), not `parent_id` chains. Building
  a UI to restructure `parent_id` would mean building on a column that's
  broken for 60% of rows. **Not built.**
- **`description` is 0/127 populated; `budget_amount` is 98/127 populated**
  (real, active data, unlike the empty fields from earlier phases).
  `budget_amount` edits go through the same audit-logged PATCH pattern as
  every other phase — CLAUDE.md's "log revisions, never overwrite" rule is
  scoped specifically to `budget_items.revised_budget` via the dedicated
  `budget_revisions` table (hard-typed to `budget_items`, not planning
  lines) — not extended here for a need that hasn't been asked for.
- **CLAUDE.md documents real trailing-dot typos in existing codes**
  (`"3.8.7."`, `"3.2.5."`) — a new create form needs to actually prevent
  this class of typo, not just replicate it.

## Design

### 1. Edit description / budget_amount

Always allowed on an existing line, audit-logged, no revision table.

### 2. Add a new line

She types the `code` and a description (`budget_amount` optional). Server
derives, exactly matching the ETL's own rule (`etl_ods_to_csv.py`,
`item_id_for_jpl()`):
- `budget_item_id` = the budget item whose `item_no` equals the code's
  first segment + `".0"` (e.g. `"3.2.5"` → look up `item_no = '3.0'`).
- `depth` = dot count + 1 (matches `depth=code.count('.') + 1` in the ETL).
- `parent_id` stays `NULL` — consistent with how the majority of existing
  rows already work; no parent-picker UI, because there's no reliable
  parent data to pick from.

**Code format validated on create**: `^\d+(\.\d+)*$` — digits and dots
only, no leading/trailing dot, no double dots. Directly prevents the exact
defect class CLAUDE.md documents in the historical data, for anything
entered from now on.

### 3. Code is editable only until first use

A `PATCH` may change `code` (recomputing `budget_item_id`/`depth` the same
way) **only if zero transactions currently reference this planning line**
— checked via `EXISTS` across all five tables with an FK to
`planning_lines.id` (`purchase_orders`, `replenishments`, `cash_advances`,
`additional_payments`, `payroll_entries`). Once anything's been recorded
against it, `code` is locked (400 on attempted change) — description and
budget_amount stay editable regardless. Prevents retroactively changing
what a code meant for a transaction that already cited it.

### 4. No hard delete, ever

Every one of those five FKs is `ON DELETE SET NULL` — deleting a planning
line would silently strip the JPL code off every historical transaction
that used it. No delete endpoint, full stop.

### 5. No `is_active`/retire flag

Unlike suppliers (real, visible near-duplicate pollution already existed),
nothing has actually asked for hiding/retiring a JPL code. Adding a column
and UI for a need that hasn't shown up would repeat the `category` mistake
from Phase 1.

### Schema change

```sql
ALTER TABLE planning_lines
  ADD COLUMN created_by VARCHAR(64) NULL,
  ADD COLUMN updated_by VARCHAR(64) NULL,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP;
```

Same additive pattern as every prior phase.

### Where the UI lives

Extends the existing "WBS / JPL breakdown" section on
`BudgetItemDetail.tsx` — already showing exactly this data, scoped per
budget item, with `WbsTable` already indenting rows by `depth`. Not a new
standalone tree-editor page. Adds "+ New line" (scoped to the current
budget item — the code's first segment must match) and an edit action per
row (description/budget_amount always; `code` only if the lock check
passes).

### Files touched

- `server/routes/planningLines.js` (add `POST`/`PATCH`)
- `client/src/hooks/usePlanningLines.ts` (add create/update mutations)
- `client/src/components/PlanningLineForm.tsx` (new)
- `client/src/components/WbsTable.tsx` (edit action per row)
- `client/src/pages/BudgetItemDetail.tsx` ("+ New line" button)

## Verification

1. `tsc -b` / `oxlint` clean.
2. Create a line under a budget item with a code whose first segment
   matches; confirm `budget_item_id`/`depth` derive correctly and it shows
   up indented correctly in `WbsTable`.
3. Reject a malformed code (trailing dot, double dot, non-numeric).
4. Reject a duplicate `(project_id, code)` with a friendly message.
5. Edit description/budget_amount on an existing, already-used line —
   allowed. Attempt to change its `code` — rejected (locked).
6. Create a fresh line with zero transactions, then change its `code` —
   allowed, `budget_item_id`/`depth` recompute.
7. Confirm `audit_log` rows for every write.
