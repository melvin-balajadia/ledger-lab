# Phase 5: Sweep — budget item procurement mode & remarks

## Context

Final phase of "Make the System Dynamic" (see Phase 1–4 specs for the
roadmap). Scope: whatever the sweep actually turns up, not a predetermined
list.

## What the sweep found

- **`budget_items.procurement_mode`** — not on purchase orders as first
  flagged; it's on the 20 top-level budget items. Genuinely populated (all
  20 rows have a real value, spread across all 6 enum options) but
  **invisible in the UI** — flows through `v_budget_vs_actual` into the
  client type already, never rendered.
- **`budget_items.remarks`** — 14/20 populated, also invisible. Not even
  in `v_budget_vs_actual`'s SELECT list yet.

## What the sweep ruled out (checked, not touching)

- **Milestone-based payment terms** — already properly built
  (`PurchaseOrderForm.tsx`), matches CLAUDE.md's requirement exactly.
- **`budget_items.item_no`** ("1.0"–"20.0") — every JPL/WBS code's
  `budget_item_id` derives from this string (Phase 4's rule). Structural,
  permanently locked, not editable — these are always "in use" by
  definition.
- **`original_budget`/`revised_budget`** — already has the correct
  mechanism (`budget_revisions`, already built). Not touched.
- **`contract_amount`** — no existing write path, reads as a computed
  rollup, no evidence it should be manually entered.

## Design

### Schema change

```sql
ALTER TABLE budget_items
  ADD COLUMN created_by VARCHAR(64) NULL,
  ADD COLUMN updated_by VARCHAR(64) NULL;
```

(`updated_at` already exists on this table with `ON UPDATE
CURRENT_TIMESTAMP` — only `created_by`/`updated_by` are missing.)

`v_budget_vs_actual` gets `bi.remarks` added to its SELECT list (additive,
same pattern as adding `budget_amount` to `v_planning_line_spend` in
Phase 4) — every existing consumer of that view is unaffected.

### Server

- `PATCH /:id/budget-items/:budgetItemId` — `procurement_mode` (validated
  against the same six ENUM values) and `remarks` only. Audit-logged.
- `budget_items.procurement_mode` added to `meta.js`'s `ALLOWED` set, so
  the dropdown reuses the same `GET /api/meta/enum-values` endpoint Phase 1
  built, rather than hardcoding the six options in the frontend.

### Client

- `useUpdateBudgetItem` mutation in `useBudgetItemDetail.ts`.
- New `BudgetItemDetailsForm.tsx` — an always-visible inline form (matching
  `RecordRevisionForm.tsx`'s existing convention on this exact page, not a
  modal): a `procurement_mode` select and a `remarks` textarea, saved
  directly. Placed on `BudgetItemDetail.tsx` alongside Budget Revisions.

## Verification

1. `tsc -b` / `oxlint` clean.
2. `GET /api/meta/enum-values?table=budget_items&column=procurement_mode`
   returns the six real values.
3. Edit procurement_mode and remarks on a real budget item; confirm both
   persist and display correctly, and every other budget item's page still
   loads (the view change didn't break anything).
4. Confirm `audit_log` row for the update.
