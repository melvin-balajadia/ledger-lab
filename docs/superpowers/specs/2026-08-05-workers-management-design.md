# Phase 2: Workers/Employees management — design spec

## Context

Second phase of "Make the System Dynamic" (see
[Phase 1 spec](2026-08-05-suppliers-foundation-design.md) for the full
roadmap). Reuses the audit-logged-CRUD pattern established there.

## Goal

Let Accounting add, edit, and deactivate workers directly — currently
read-only (roster + payroll history only, both added in the Payroll rework).

## Verified before designing

- **`GET /:id/workers` only lists workers with an existing `payroll_entries`
  row** (an `EXISTS` join). Harmless historically (every one of the 246
  workers came in through the ETL with history attached, confirmed:
  `workers` row count and distinct `worker_id`s referenced by
  `payroll_entries` are both exactly 246) — but it means a newly created
  worker would be invisible until also assigned to a payroll period.
- **Checked for cross-project leakage before dropping that filter**: project
  2 ("Dry Storage Expansion") has **zero** `payroll_entries` rows — genuinely
  dormant, not just unused in the UI. Every one of today's 246 workers
  belongs only to project 1. Dropping the filter changes nothing about
  what's shown today. (If DSEXP ever goes live with real payroll data, a
  global roster would start mixing its workers in too, since `workers` has
  no `project_id` column at all — a pre-existing schema limitation, not
  something this phase introduces. Out of scope unless DSEXP activates.)
- **`daily_rate`, `hourly_rate`, `date_hired`, `middle_name`, `employee_no`
  are 0% populated across all 246 workers.** Checked directly. Rates are
  excluded from scope entirely — CLAUDE.md is explicit ("No payroll
  calculation... daily rates no longer exist in the source"); building form
  fields for them would be the scope creep that rule prevents. The other
  three are included as optional fields — unpopulated historically because
  the *old* spreadsheet never had them, not because they're unwanted for a
  worker Accounting is entering by hand today.
- **`position` is free text with real variance already**: `LABOR/HELPER`,
  `HELPER`, `LABOR-HEPER` (typo), `MASON/CARPENTER`, etc. Same shape as the
  supplier near-duplicate problem from Phase 1.
- **The schema comment on `workers` already flags a real name-collision
  risk**: "6 people appear twice in the source grid as re-hires... they are
  one person, so one row here" — full-name near-duplicates are a proven,
  not hypothetical, concern here too.

## Design

### Where the CRUD lives

**Extends the existing Payroll → "By Worker" tab — no new page, no new nav
item.** That tab already lists every worker via `DataTable`. `DataTable`
already supports `onView` and `onEdit` as distinct row actions (confirmed in
`DataTable.tsx`): `onView` keeps navigating to `/payroll/workers/:id` (full
payroll history, unchanged), `onEdit` opens the new edit modal. A "+ New
worker" button is added next to the view toggle, matching the Suppliers
page's "+ New supplier."

### Schema change

```sql
ALTER TABLE workers
  ADD COLUMN created_by VARCHAR(64) NULL,
  ADD COLUMN updated_by VARCHAR(64) NULL,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP;
```

Same additive, nullable-column pattern as `suppliers` in Phase 1.

### Server changes (`server/routes/workers.js`)

- **`GET /:id/workers`**: drop the `EXISTS (payroll_entries)` clause from
  `WHERE`. All other filters (`search`, `position`, `is_active`,
  pagination, sort) unchanged.
- **New `GET /:id/workers/positions`** — `SELECT DISTINCT position FROM
  workers WHERE position IS NOT NULL ORDER BY position`. No pagination:
  bounded, small set (a few dozen distinct values across 246 rows), fetched
  once and filtered client-side for the near-duplicate suggestion — no
  per-keystroke server round trip needed at this size.
- **New `POST /:id/workers`** — create. Requires `last_name`, `first_name`;
  `middle_name`, `employee_no`, `position`, `date_hired` optional.
  `full_name` is derived server-side as `"LASTNAME, FIRSTNAME MIDDLENAME"`
  (uppercased, matching the existing 246 rows' convention exactly) — not a
  separately-entered field, same reasoning as `normalized_name` in Phase 1:
  one source of truth, no drift. Transaction + `recordAudit`. New workers
  default `is_active = 1`.
- **New `PATCH /:id/workers/:workerId`** — update any of the above, plus
  `is_active`/`date_separated` as a pair: setting `is_active = 0` without an
  explicit `date_separated` defaults it to today's date server-side.
  `recordAudit` on every write.
- No hard delete — deactivate only, same as suppliers.

### Client changes

- `client/src/hooks/useWorkers.ts` — add `useCreateWorker`,
  `useUpdateWorker` (mirrors `useSuppliers.ts`), `useWorkerPositions` (fetch
  once, `staleTime` generous since it barely changes).
- `client/src/components/WorkerForm.tsx` (new) — Last/First/Middle name,
  Employee No., Position (text input + debounced near-duplicate suggestion
  against the fetched distinct-positions list, client-side filter, no new
  server round trip per keystroke), Date hired. Edit-only: Active toggle +
  Date separated (revealed when unchecking Active, defaults to today).
  Full-name near-duplicate warning reuses the same non-blocking pattern as
  `SupplierForm.tsx`, searching against `full_name` via the existing
  `search` param on `GET /:id/workers`.
- `client/src/pages/Payroll.tsx` — Workers view gets a "+ New worker"
  button and `onEdit` wired to the new modal; `onView` unchanged.

### Verification

1. `tsc -b` / `oxlint` clean.
2. Create a worker with no payroll entries yet → appears immediately in the
   "By Worker" roster (proves the `EXISTS` drop worked), total earned ₱0.00.
3. Existing 246 workers still all present and unaffected after the filter
   change and the schema migration.
4. Type a near-duplicate full name → warning shows; type a near-duplicate
   position (e.g. "Labor/Helper") → suggestion shows.
5. Deactivate a worker without specifying a date → `date_separated` defaults
   to today; confirm via direct read.
6. Confirm `audit_log` gets rows for insert/update.
7. Confirm `onView` still navigates to full payroll history unchanged, and
   `onEdit` opens the new modal — both present on the same row.
