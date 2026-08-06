# Phase 1: Foundation + Suppliers management — design spec

## Context

First phase of the "Make the System Dynamic" initiative: converting read-only
reference data into things Accounting can manage without a developer. Full
roadmap (each phase gets its own spec when we get there):

1. **Foundation + Suppliers** (this spec)
2. Workers/Employees
3. Payroll: period creation, worker assignment, generation workflow
4. JPL/WBS codes tree editor
5. Sweep — `procurement_mode` and anything else that turns up

`ref_type`/`payment_type`/`expense_type` were considered for this initiative
and deliberately excluded from table-altering work: they stay MySQL `ENUM`s.
Each already ends in `'other'` paired with a free-text field on the same row,
so nothing is ever blocked. The only piece of that decision that touches code
is a small generic endpoint (below) so the frontend stops hand-duplicating the
ENUM's allowed values.

## Goal

Give Accounting full CRUD over suppliers — currently read-only (autocomplete
only) — and establish the reusable admin-CRUD pattern (audit-logged writes,
DataTable + Modal + Form UI) that phases 2+ reuse rather than reinventing.

## Non-goals

- **No hard delete.** Suppliers are FK'd from `purchase_orders` (required),
  `replenishments`/`additional_payments` (optional). Deactivate only
  (`is_active`), matching the pattern already used for workers/users.
- **No `category` field.** Checked the live data: 0 of 324 suppliers have a
  non-empty `category` — it's a defined-but-never-populated schema column
  (same situation as `planning_lines.description`). Not building UI for a
  field nobody uses; a real ask to start categorizing suppliers is a separate,
  future design.
- **No fuzzy-matching library.** Near-duplicate warning reuses the substring
  search that already exists (`GET /api/suppliers?q=`) — no new dependency for
  324 rows.
- **Does not touch `ref_type`/`payment_type`/`expense_type`** beyond the
  generic enum-introspection endpoint described below.

## Schema change

```sql
ALTER TABLE suppliers
  ADD COLUMN created_by VARCHAR(64) NULL,
  ADD COLUMN updated_by VARCHAR(64) NULL,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP;
```

Purely additive (nullable columns, no rewrite of existing rows). Matches the
shape already used on `replenishments`/`po_payments`. Required before any
write endpoint can exist here, per CLAUDE.md's audit-trail rule.

## Normalization rule (must match the ETL exactly)

The ETL (`etl/etl_ods_to_csv.py`, `norm_supplier()`) computes `normalized_name`
as: uppercase → strip everything except `[A-Z0-9 ]` → strip whole-word
corporate suffixes (`INC|CORP|CORPORATION|COMPANY|CO|LTD|PHILS|PHILIPPINES|
ENTERPRISES|TRADING|GENERAL MERCHANDISE|SERVICES`) → collapse whitespace. A
new small `server/lib/normalizeSupplierName.js` ports this verbatim to JS, so
a supplier created through the UI dedupes against the existing 324 rows the
same way the ETL would. Both the create endpoint and the near-duplicate
warning use this one function — no second copy of the rule.

## Server changes (`server/routes/suppliers.js`)

- **Extend `GET /api/suppliers`**: when `page` is present, return
  `{ rows, page, pageSize, total }` with `search` and `is_active` filters and
  the same `MAX_PAGE_SIZE` cap used elsewhere. Omit `page` → today's
  unchanged bare-array/`LIMIT 20` behavior, so the autocomplete hook needs no
  changes. **Autocomplete additionally defaults to `is_active = 1`** — a
  deactivated supplier shouldn't be selectable for new transactions, only
  visible/manageable on the admin page.
- **`POST /api/suppliers`** — create. Requires `name`; computes
  `normalized_name` via the shared helper. Transaction + `recordAudit`.
  Unique-constraint violation (errno 1062 on `uk_supplier_norm`) mapped to a
  friendly 400 ("A supplier with this name already exists"), not a raw SQL
  error.
- **`PATCH /api/suppliers/:id`** — update `name`/`tin`/`is_active` +
  `recordAudit`. Only way to deactivate; no `DELETE` route.
- **New `GET /api/meta/enum-values?table=&column=`** — reads
  `information_schema.COLUMNS`, parses the `enum('a','b',...)` string, returns
  `string[]`. Generic; every current hardcoded frontend array
  (`REF_TYPES` and friends) switches to fetching from here instead of
  duplicating the DB's definition by hand.

## Client changes

- `client/src/pages/Suppliers.tsx` (new) — route `/suppliers`, nav link next
  to Payroll. `DataTable` (name, TIN, Active/Inactive pill), `SegmentedControl`
  (All/Active/Inactive), "+ New supplier" button, search via DataTable's own
  box.
- `client/src/components/SupplierForm.tsx` (new) — name, TIN, active toggle
  (edit only — new suppliers default active). Inside the existing `Modal`,
  matching `ReplenishmentForm`. Debounced name lookup (reusing `useSuppliers`)
  shows a non-blocking "Similar suppliers already exist: …" list when partial
  matches are found — a warning, not a hard block.
- `client/src/hooks/useSuppliers.ts` — add `useCreateSupplier`/
  `useUpdateSupplier` mutations, same shape as `useReplenishments.ts`.
- `client/src/App.tsx` / nav component — new route + nav entry.

## Verification

1. `tsc -b` / `oxlint` clean.
2. Create a supplier; confirm it shows in the new admin list and is
   immediately selectable from the existing `SupplierAutocomplete` in
   PO/Replenishment forms with no changes to those components.
3. Attempt a duplicate `normalized_name` → friendly 400, not a raw SQL error.
4. Type a near-duplicate name (e.g. an existing supplier plus "INC") → warning
   appears; submit still succeeds (non-blocking).
5. Deactivate a supplier → disappears from the "Active" autocomplete search
   and from the admin page's "Active" filter; still visible under
   "All"/"Inactive" on the admin page.
6. Confirm `audit_log` gets one row per insert/update with before/after JSON.
7. Confirm `GET /api/meta/enum-values` returns the correct arrays for
   `ref_type`, `payment_type`, `expense_type`.
