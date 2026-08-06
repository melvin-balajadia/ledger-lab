# Plaridel Extension — Cost & Payroll Monitoring App

Analysis of `Plaridel_Extension_Cost.ods` and `Plaridel_Extension__Payroll__Replen_.ods`,
and the data model / API design for a React + Express + MySQL dashboard.

---

## 1. What the workbooks actually contain

**Project:** Royale Cold Storage North Inc., Plaridel Extension — Bypass Rd., Brgy. Bulihan,
Plaridel, Bulacan. TIN 008-400-912-002. Budget ≈ PHP 1.334 B, ~61.6% remaining, tracked
weekly from Aug 2025 to Jul 2026.

### Cost workbook

| Sheet | Rows | What it is |
|---|---|---|
| `SUMMARY` | 27 | Master budget-vs-actual, 19 budget items. **The dashboard home page.** |
| `SUMMARY_REVISED_BUDGET` | 24 | Older copy of the same, different figures for two items |
| `PO_MONITORING` | 326 | 272 PO lines grouped under 16 section headers by budget item |
| `DP_MONITORING` | 109 | Payment terms + downpayment schedule per PO (equipment/electrical) |
| `LAND_DEV_AND_CIVIL_WORKS` | 106 | Two side-by-side PO lists in one sheet, plus totals |
| `FOREIGN_TO_PHP` | 98 | USD/EUR contracts converted at 61.57, plus a payment-voucher log |
| `WEEKLY_ADDITIONAL_FOR_BUDGET_` | 27 | Weekly PO/replen/labor additions, one block per week laid **side by side** across 66 columns |
| `PROJECT_COST_MONITORING_` | 18 | Three-item subset of `SUMMARY` |

### Payroll / replenishment workbook

| Sheet | Rows | What it is |
|---|---|---|
| `CIVIL_MATERIALS` | 1478 | 1,473 petty-cash/replenishment lines. The largest real dataset. |
| `Payroll_with_JPL_sept_to_jan` | 263 | Worker × week pivot grid, 43 weeks × 246 workers, each week has an AMOUNT + JPL charge-code column pair |
| `PAY_ROLL` | 54 | 51 weekly payroll control totals |
| `WITH_PO'S` | 89 | PO list overlapping `PO_MONITORING` |
| `CIVIL_EST_REM_COST`, `ELECT__EST_REM_COST` | 53 / 21 | Remaining-cost estimates — **but headed "DRY STORAGE EXPANSION, Brgy. Unzad Villasis, Pangasinan"**, i.e. a different project pasted in |
| `Sheet2`, `Sheet3` | 17 / 5 | Working scratch, snapshot "as of 01-15-2026" |
| 12 `file:///D:/...` sheets | 0–102 | Dead external links to a weekly payroll `.xlsx` on someone's D: drive. One still holds a full DTR (daily rate, hourly rate, Mon–Sun hours, OT, night diff, late/undertime, basic, OT pay). |

---

## 2. The one modelling decision that matters

The `SUMMARY` sheet has six money columns that get summed together, but they are not the
same kind of number. They belong to **three different ledgers**:

```
BUDGET                    what was approved            1,333,876,003
   └─ COMMITMENT          contract value awarded         964,527,157   (72%)
        └─ DISBURSEMENT   cash actually paid out         481,937,708   (36%)
```

`TOTAL COST BY CONTRACT` is a commitment. `PAID P.O. AMOUNT`, `REPLEN AMOUNT`,
`CASH ADVANCED` and `LABOR COST` are disbursements. `REMAINING AMOUNT` in the sheet is
budget − commitment, which answers "how much can I still award?" — not "how much cash do
I still owe?" Those differ by PHP 482.6 M here, so the app must show them as separate
columns and never add commitment to disbursement. That is why `v_budget_vs_actual` exposes
both `remaining_vs_contract` and `remaining_vs_disbursed`.

Everything else follows from four dimensions:

- **budget_items** — the 19 numbered lines (2.0 Land Development … 19.0 Interest)
- **planning_lines** — the JPL/WBS codes (`2.0`, `3.1.2.5`, `3.2.2.26`), 1–7 levels deep,
  90 distinct values. The first segment maps back to the budget item.
- **suppliers** — 309 after normalisation
- **time** — weeks, Mon–Sun, matching the payroll cycle

Every peso lands in exactly one of four fact tables — `po_payments`, `replenishments`,
`cash_advances`, `payroll_entries` — each tagged with a planning line and a date. Any
number on any dashboard is then a `SUM` over those four, sliced by dimension. The
sheets currently maintain ~15 hand-keyed subtotals of the same figures; those all become
views.

See `schema.sql` for the full DDL (17 tables, 7 views).

---

## 3. Data quality — what I found

I wrote `etl_ods_to_csv.py` and ran it on both files. Results:

```
suppliers                   309 rows
planning_lines               90 rows
purchase_orders             265 rows
po_payments                 276 rows
replenishments            1,473 rows
payroll_periods              51 rows
workers                     246 rows
payroll_entries           3,822 rows
weekly_budget_additions      29 rows
```

**Replenishments reconcile exactly:** PHP 12,703,426.52, matching the control total in
`CIVIL_MATERIALS`. Payroll comes to PHP 19,897,979.97 against a control of
PHP 19,712,192.06 — 32 of 43 weeks match to the centavo, 10 need review (below).

Issues you need to decide on before go-live:

1. **`pandas.read_excel` cannot open either file.** It raises
   `ValueError: Unrecognized type error` because several cells hold `#REF!`/`#VALUE!`
   formula errors. The ETL parses `content.xml` from the ODS zip directly instead.

2. **Totals hidden inside the payroll data rows.** Each week's column in
   `Payroll_with_JPL_sept_to_jan` has a grand-total row plus `2.0` and `3.0` subtotal
   rows — placed at a *different row offset for every week* (row 122 for one week, row 260
   for another) and sitting beside unrelated workers' names. Read naively, every weekly
   figure comes out **3× too high**. The ETL filters them by magnitude (no worker's weekly
   net exceeds PHP 12.3k; totals start at PHP 28.4k).

3. **10 payroll weeks don't reconcile** — the worker rows don't add up to the stated weekly
   total. Net effect +PHP 185,788 (0.9%). Largest: 2026-01-26 short by 23,250.48;
   2026-02-23 short by 11,690.94; 2025-12-29 over by 12,276.86. Written to
   `_reconciliation_payroll.csv`; someone who knows the weeks has to adjudicate.

4. **Two budget figures disagree between the summary sheets:**

   | Item | `SUMMARY_REVISED_BUDGET` | `SUMMARY` | Difference |
   |---|---|---|---|
   | 3.0 Civil Works | 385,622,171 | 385,622,172 | −1 |
   | 6.0 Electrical & Communications | 100,599,695 | 94,895,712 | **5,703,983** |

   Totals therefore differ: 1,339,579,985 vs 1,333,876,003. **Which is authoritative?**
   I seeded `SUMMARY`, since it's the fuller sheet.

5. **Three items are over budget** and the sheet shows them as negative remaining:
   Fire Protection −13,191,171.86, Bollards −1,036,735.00, PU Flooring −4.92. The app
   should surface these as a flag, not a negative number buried in a column.

6. **Four impossible dates** in `CIVIL_MATERIALS`: 2015-11-15, 2005-12-09, 1958-04-01,
   1900-01-03. One amount is a literal `-`. Loaded with `needs_review = 1` rather than
   dropped — 11 rows total.

7. **Two unparseable JPL codes:** `Inaguration` and `wire 3.2.2.26 pipe 3.1.2.2.1`
   (one line charged to two codes). 76 payroll entries also have no JPL. These need a
   real code or an explicit "unallocated" bucket.

8. **Supplier names are free text.** `SMC SKYWAY CORPORATION` and
   `SMC SKYWAY STAGE 3 CORPORATION` are genuinely different toll operators, while
   `DUENAS` / `DUEÑAS` and `MARIBOJOC` / `MARIBOHOC` are the same people typed twice.
   The ETL normalises into `suppliers.normalized_name`; review the 309 rows once, by hand.

9. **~39% of replenishment lines are toll and fuel charges** — NLEX 141, SMC Skyway
   141 + 106, SLEX 98, TPLEX 84, EasyTrip 31. Whatever UI you build for replenishment
   entry, these dominate the volume, so give them a fast path (recurring-supplier
   template or CSV import) or data entry stays as painful as the spreadsheet.

10. **Foreign-currency contracts** are converted at a single hardcoded USD rate of 61.57
    (USD 1.868 M civil works, USD 1.913 M refrigeration, USD 2.167 M panels; a EUR column
    exists but is empty). Store native amount + rate per PO, not just the peso figure, or
    you can never explain a variance caused by FX.

11. **Two projects are mixed in one file.** `CIVIL_EST_REM_COST` and
    `ELECT__EST_REM_COST` are headed "DRY STORAGE EXPANSION, Villasis, Pangasinan". The
    schema is multi-project (`projects` table); give that one its own row.

---

## 4. API surface

Express, one router per resource. Read-heavy, so most endpoints are thin wrappers over
the views.

```
GET  /api/projects/:id/summary            -> v_budget_vs_actual, the dashboard table
GET  /api/projects/:id/kpis               -> budget, committed, disbursed, remaining, %
GET  /api/projects/:id/burn?from=&to=     -> v_weekly_burn, stacked weekly chart
GET  /api/projects/:id/wbs?parent=        -> planning_lines tree + v_planning_line_spend

GET  /api/purchase-orders                 -> filter: item, supplier, status, date, q
GET  /api/purchase-orders/:id             -> PO + payment schedule from v_po_balance
POST /api/purchase-orders
POST /api/purchase-orders/:id/payments

GET  /api/replenishments                  -> paginated; ?needs_review=1 for the queue
POST /api/replenishments
POST /api/replenishments/import           -> CSV upload (the toll/fuel fast path)
PATCH /api/replenishments/:id

GET  /api/payroll/periods
GET  /api/payroll/periods/:id/entries     -> worker × amount × JPL for one week
POST /api/payroll/periods/:id/entries     -> bulk upsert one week
GET  /api/payroll/reconciliation          -> extracted vs control per week

GET  /api/suppliers?q=                    -> typeahead
GET  /api/workers
GET  /api/reports/budget-vs-actual.xlsx   -> export, because finance will ask
```

Notes for the Express side:

- **`mysql2/promise` with a connection pool**, and parameterised queries throughout.
  Never string-concatenate the `q` filter.
- **Money as strings, not JS numbers.** `DECIMAL(18,2)` at PHP 1.3 B exceeds safe
  float precision for cent-accurate arithmetic. Set `decimalNumbers: false` in mysql2
  (the default) so it returns strings, and do arithmetic in SQL or with `decimal.js`.
  If you let `JSON.parse` turn these into doubles, your totals will drift by centavos
  and finance will notice.
- **Keep aggregation in SQL.** Don't pull 3,822 payroll entries into Node to sum them.
- **Pagination on `replenishments`** — 1,473 rows now, growing weekly.
- **`ONLY_FULL_GROUP_BY` is on by default** in MySQL 8; the views in `schema.sql` are
  written to satisfy it.
- **Audit trail.** These figures feed billing. Add `created_by`/`updated_by` and an
  append-only `audit_log` before anyone posts real transactions.

---

## 5. Dashboard screens

1. **Overview** — four KPI cards (budget / committed / disbursed / remaining), the
   19-row budget-vs-actual table with a commitment progress bar per row and a red flag on
   the three over-budget items, and the weekly burn chart (stacked PO / replen / labor).
2. **Budget item detail** — drill from a row into its POs, replenishments and labor,
   with the WBS tree beneath it.
3. **Purchase orders** — filterable table from `v_po_balance`, `pct_paid` bar, payment
   schedule in a drawer. Filter "outstanding balance > 0" is the one procurement will live in.
4. **Replenishments** — paginated ledger, supplier typeahead, CSV import, and a
   **review queue** filtered to `needs_review = 1`.
5. **Payroll** — week picker, worker × amount × JPL grid for editing, and the
   reconciliation panel showing extracted vs control per week.
6. **Suppliers** — spend by supplier, plus a merge tool for the duplicate names.

For the frontend: Recharts covers all these charts, TanStack Query for server state and
caching, TanStack Table for the grids (the payroll editor needs virtualisation at
246 × 43 cells). Format everything with `Intl.NumberFormat('en-PH', {currency:'PHP'})`.

---

## 6. Migration steps

```bash
# 1. schema
mysql -u root -p < schema.sql

# 2. extract  (writes 10 CSVs + the reconciliation report)
python3 etl_ods_to_csv.py \
    Plaridel_Extension_Cost.ods \
    Plaridel_Extension__Payroll__Replen_.ods \
    ./seed

# 3. load
cd seed && mysql --local-infile=1 -u root -p rcsni_cost < ../load_seed.sql
```

`load_seed.sql` ends with row counts and a formatted budget-vs-actual printout — compare
that against the `SUMMARY` sheet before trusting anything.

Then, in order:

1. Resolve the item 6.0 budget discrepancy (5,703,983) and pick an authoritative sheet.
2. Work the 11 flagged replenishments and the 10 unreconciled payroll weeks.
3. Review the 309 supplier names for duplicates.
4. Assign JPL codes to the 76 unallocated payroll entries.
5. Backfill `payment_terms` and `budget_item_id` on the POs that came only from
   `DP_MONITORING`.
6. Add `cash_advances` — PHP 2,001,128.33 in `SUMMARY` with no transaction-level detail
   anywhere in either file. Same for `ADDITIONAL PAYMENT` (PHP 26,314,016.36).

That last point is worth flagging: about PHP 28.3 M of disbursement exists only as a
summary figure. The app can't reproduce the `SUMMARY` totals until someone supplies the
underlying transactions.

---

## 7. Open questions

- Which sheet is authoritative for item 6.0's budget — 100,599,695 or 94,895,712?
- Should `2.0`, `3.0` … be treated as planning lines in their own right, or only as
  parents? Currently both, since transactions charge directly to `2.0`.
- Is the payroll grid the source of truth, or the weekly `.xlsx` files it links to?
  Those files have the full DTR (hours, OT, night diff, deductions) that the grid
  flattens to one net figure. If you want the app to *compute* payroll rather than record
  it, you need those files — `timekeeping_detail` is stubbed out for exactly that.
- Multi-user? That decides whether you need auth and roles now or later.
- Is the Villasis "Dry Storage Expansion" in scope, or should it be dropped?
