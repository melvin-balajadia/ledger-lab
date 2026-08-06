# Phase 3: Payroll period creation, worker assignment, generation workflow — design spec

## Context

Third phase of "Make the System Dynamic" (see
[Phase 1](2026-08-05-suppliers-foundation-design.md) /
[Phase 2](2026-08-05-workers-management-design.md) specs for the full
roadmap and the established audit-logged-CRUD pattern). This is the
flagship ask — payroll is currently 100% read-only, fed only by the ETL.

## The one question that shapes everything, resolved before designing

Does the weekly "control total" stay an independent, externally-sourced
number to reconcile against, or should the app just compute it from
entries now that data entry moves in-house?

The ETL's own comment settles the historical fact: *"PAY_ROLL's weekly
figure is the control total. Where the unpivoted worker rows disagree, the
source workbook is internally inconsistent — do not silently pick a side,
hand the week to a human."* Two separately-maintained figures, cross-checked
against each other, by design.

What isn't known — and doesn't need to be, for this design to be safe — is
*why* they were separate (an outside payroll source vs. just two tabs of
the same spreadsheet). The design keeps `total_amount` exactly as it
already behaves: manually entered, independent of entries, never
auto-computed. Safe under either answer — worst case if there's no real
outside source anymore, she occasionally retypes a number she could
derive herself; it never silently removes a check that mattered.

## Design

### 1. Period creation

`POST /:id/payroll-periods` — `label`, `period_start`, `period_end`,
`total_amount` (optional, default 0). New periods default to
`status = 'draft'` — historical ETL-loaded periods default to `'paid'`
since those are already-settled weeks; a new one isn't.

`GET /:id/payroll-periods/next-suggestion` — computes the next Monday–Sunday
range from the latest existing period's `period_end + 1 day`, and a label in
the existing convention. Used only to *prefill* the create form — she can
edit every field before submitting, and if no periods exist yet, falls back
to the next Monday from today.

### 2. Worker assignment — "Copy roster from last period"

`POST /:id/payroll-periods/:periodId/copy-roster` — copies every
`(worker_id, planning_line_id, budget_item_id)` tuple from the most recent
*other period that actually has entries* (by `period_start`) into this one,
with `amount` reset to 0 on every copied row. Rejects with 400 if this
period already has any entries (avoids merge ambiguity) or if there's no
earlier populated period to copy from.

Found during verification, not assumed upfront: the most recent existing
period (51, "July 20-26, 2026") has zero entries — a real gap week in the
data. Skipping only over the exact-previous row (rather than the nearest
*populated* one) would have silently copied nothing the first time this
matters. Fixed to search past empty gap weeks for the nearest period with
an actual roster.

Amount is never carried forward — net pay varies week to week (days
worked), so copying last week's peso figures forward would be actively
wrong, not a convenience. What's stable week to week is *who's on the crew
and what they're charged to*, which is the actual data-entry burden this
phase targets.

### 3. Entry-level add / edit / remove

On the existing `PayrollPeriodDetail` page (already a real page from the
earlier Payroll rework — not reintroducing the old heavy modal):

- `POST /:id/payroll-periods/:periodId/entries` — `worker_id`,
  `planning_line_id`, `budget_item_id` (client-derived from the picked
  `PlanningLine`, same pattern as `ReplenishmentForm`), `amount`. The
  existing `uk_entry (payroll_period_id, worker_id, planning_line_id)`
  unique constraint is mapped to a friendly 400 on collision.
- `PATCH .../entries/:entryId` — edit `planning_line_id`/`amount`.
- `DELETE .../entries/:entryId` — remove a row (e.g. a separated worker
  copy-roster brought over by mistake).

Handles what copy-roster can't: new hires, departures, JPL reassignment.

### 4. Status transitions

`PATCH /:id/payroll-periods/:periodId` also accepts `status`. This is a
single status flag on a table that already has the column — not the
Coordinator→SVP→CEO approval chain CLAUDE.md rules out (that's budget/PO
approval, outside this app). One user, one flag, movable either direction
(no forward-only lock) since it's correcting a mistake, not enforcing a
multi-party process.

### Where the UI lives

- `Payroll.tsx` (periods view) gets "+ New period", matching Suppliers'
  "+ New supplier" placement. Creating one navigates straight to its detail
  page — the next action is always "copy the roster and start entering
  amounts," not "look at it in the list."
- `PayrollPeriodDetail.tsx` gets: "Copy roster from last period" (shown only
  when the period has zero entries), "+ Add entry", `onEdit`/`onDelete` on
  the entries table, "Mark Approved"/"Mark Paid" one-click actions, and an
  "Edit period" action for label/dates/control total.
- New `WorkerAutocomplete.tsx` (modeled directly on `SupplierAutocomplete.tsx`)
  for picking a worker in the add-entry form — searches
  `GET /:id/workers?search=`, which Phase 2 already built.
- New `PayrollPeriodForm.tsx` (create/edit period) and
  `PayrollEntryForm.tsx` (add/edit one entry) — same Modal+Form pattern as
  every other phase.

### Schema change

Same additive pattern as Phases 1–2 — `payroll_periods` and
`payroll_entries` currently have no `created_by`/`updated_by` columns
(only `created_at`):

```sql
ALTER TABLE payroll_periods
  ADD COLUMN created_by VARCHAR(64) NULL,
  ADD COLUMN updated_by VARCHAR(64) NULL,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP;

ALTER TABLE payroll_entries
  ADD COLUMN created_by VARCHAR(64) NULL,
  ADD COLUMN updated_by VARCHAR(64) NULL,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP;
```

### Explicitly deferred, not built

- **Inline cell-editing** for amounts (vs. a modal per edit). Flagged
  during design as the one place the modal pattern might feel tedious
  (every copied-forward row needs its amount typed in, every week) — but
  shipping the simple, consistent version first and upgrading only if that
  friction turns out real, rather than guessing at it now.
- **Overlap/gap detection** between periods beyond the exact-duplicate
  unique constraint already in the schema. Not asked for.

## Verification

1. `tsc -b` / `oxlint` clean.
2. Create a new period via the suggested-next-week prefill; confirm it
   lands on `status = 'draft'` (not `'paid'` like historical rows).
3. Copy roster from the prior period into a fresh period with zero entries;
   confirm every copied row has `amount = 0` and the same
   worker/JPL-code pairs as the source period. Confirm copying into a
   period that already has entries is rejected.
4. Add an entry, edit its amount, delete an entry — confirm
   `extracted_total`/`delta`/`reconciliation_status` on the period update
   accordingly each time (derived SQL from Phase-2-era work, unchanged).
5. Duplicate (worker, JPL code) entry attempt → friendly 400.
6. Mark Approved / Mark Paid → status changes, movable back down too.
7. Edit period's control total → `delta`/`reconciliation_status` recompute.
8. Confirm `audit_log` rows for every write, including one per row on the
   bulk copy-roster operation (matching the existing per-line audit
   pattern already used by the replenishments split-JPL insert).
