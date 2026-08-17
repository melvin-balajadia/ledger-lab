# LedgerLab — Plaridel Extension

Internal tool replacing two hand-maintained spreadsheets. **One user** (an accountant),
running locally. She built the spreadsheets herself and asked for this because monitoring
and reporting from them had become unmanageable.

Stack: React (Vite) + Express + MySQL 8. Read-heavy dashboard first, data entry second.

---

## Domain rules — get these wrong and every number is wrong

### 1. Three ledgers, never added together

```
BUDGET          approved          1,333,876,003
  COMMITMENT    contract awarded    964,527,157   (72%)
  DISBURSEMENT  cash paid out       481,937,708   (36%)
```

`budget_items.contract_amount` is a **commitment**. `po_payments`, `replenishments`,
`cash_advances`, `payroll_entries`, `additional_payments` are **disbursements**.

Never sum a commitment with a disbursement. There are two different "remaining" figures
and both are exposed in `v_budget_vs_actual`:

- `remaining_vs_contract` — budget − commitment. "How much can I still award?"
- `remaining_vs_disbursed` — budget − cash out. "How much have I actually spent?"

The source spreadsheet only ever showed the first. Label both explicitly in the UI.

### 2. Additional payments are cash out but NOT commitment

Confirmed with accounting: "additional expenses of the company, not an increase to
contract value." They are landed cost on imported equipment — customs duty, freight,
terminal handling, marine insurance — PHP 26.6 M on budget items 4.0 and 5.0.

They belong in `total_disbursed`. They must **never** be added to `contract_amount`.

### 3. All amounts are VAT-inclusive

Never add VAT to a stored amount anywhere. To report the VAT portion use
`amount * 12 / 112` (see the `v_vat_component` view). `projects.vat_inclusive` records
this convention.

### 4. Money is DECIMAL, and it stays a string in JS

`DECIMAL(18,2)` at PHP 1.3 B exceeds float precision for cent-accurate arithmetic.

- `mysql2` returns DECIMAL as a string by default — **keep it that way**, do not set
  `decimalNumbers: true`.
- Do arithmetic in SQL, or with `decimal.js` if it must happen in JS.
- Never `parseFloat` a peso amount and add it to another.
- Format for display with `Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })`.

### 5. "Paid" means invoice received and check issued

Not check cleared. So disbursement figures lead the bank balance. UI labels should say
"Paid (check issued)" so nobody reads it as cash gone from the account.

### 6. Split charges: one row per JPL code

One invoice can be charged to several planning-line codes. Each code gets its **own row**;
sibling rows share a `document_no`. `replenishments`, `cash_advances` and
`additional_payments` all have this column. The UI needs a "split across codes" action that
creates siblings and validates that the parts sum to the whole.

### 7. FX rates vary per payment

Not a single constant. Five distinct rates appear in the source (USD 61.57, 59.554, 58.599,
57.554; EUR 72.48). `fx_rate` lives on both the PO and each individual payment.

Note: **no PO is currently recorded in a foreign currency** — the source only holds peso
amounts. The FX columns are in place but dormant. Do not build FX features unless asked.

### 8. Retention applies to SOME POs only

Confirmed with accounting: "retention does not apply to all POs, it depends on the agreed
payment terms." **11 POs carry a holdback totalling PHP 25,319,221.48** — the largest is
LBI Philippines at PHP 12.78 M. `purchase_orders.retention_pct` holds the percentage;
release payments are recorded with `po_payments.payment_type = 'retention'`.

Retention held is **not a payable** — it is money the supplier is not yet entitled to.
Show it as its own line (`v_po_retention`), never folded into an outstanding balance.

`payment_terms` is free text and the source spells ~8 real patterns 31 different ways
('60 PB' with no %, lowercase '50%dp', one cell containing a note instead of terms). It is
kept verbatim for reference, but the truth lives in `po_payment_terms` as milestone rows.
**Entry forms must build terms from milestones, never a text box.**

Careful: '100% Upon Completion' is the whole payment falling due at the end, NOT a 100%
retention. A completion milestone counts as a holdback only when it is a minority tail of a
multi-part schedule.

### 9. Budgets get revised — log, never overwrite

Two items are over budget (Fire Protection +61%, Bollards +19%) and accounting says the
budgets will be adjusted. Never `UPDATE budget_items.revised_budget` in place. Insert into
`budget_revisions` (before, after, effective date, reason) so variances stay explainable.

---

## Do NOT build

- **No approval workflow.** The Coordinator → SVP → CEO chain happens outside this app.
  It's a monitoring tool.
- **No roles or permissions.** One user. `users` table is username + bcrypt hash only.
- **No multi-tenancy inside one running app.** The schema supports a second project
  (`DSEXP`, Villasis) but a given instance's UI still only ever points at one project —
  no project switcher, no per-request tenant resolution. Villasis runs as its own
  separate deployment (own clone, own database, own port) of the same codebase instead;
  see "Running a second site" in `DEPLOYMENT.md` and `client/src/site.config.ts` (gitignored,
  created per checkout from `site.config.example.ts` — the one frontend file that names
  which project + branding a given deployment uses).
- **No payroll calculation.** The app records weekly net pay. The daily rates and DTR
  detail no longer exist in the source. `timekeeping_detail` is a stub — leave it empty.

Scope creep here is the main project risk. She needs a working tool, not a complete one.

---

## Data quality is a feature, not a cleanup task

Rows that could not be confidently parsed are loaded with `needs_review = 1` rather than
dropped. The app surfaces these in a review queue where she fixes them in place. Never
silently drop or auto-correct a flagged row.

| Source                     | Flagged | Why                                               |
| -------------------------- | ------: | ------------------------------------------------- |
| `replenishments`           |       6 | 4 impossible dates, 2 halves of one split-JPL row |
| `payroll_entries` (no JPL) |      19 | Worker had left — not an error, needs a bucket    |
| `purchase_orders`          |       1 | Payment terms do not total 100%                   |
| `weekly_budget_additions`  |      12 | See below                                         |

**`weekly_budget_additions` has a source defect.** Four blocks in
`WEEKLY_ADDITIONAL_FOR_BUDGET_` are all labelled `JULY 06-JULY 12, 2026` — the author copied
the block across without updating the header. They are four different weeks and the real
dates are not recoverable from the file. All rows are kept, disambiguated by `seq` (block
position, left to right) and flagged. **Do not use this table for reporting until the labels
are corrected**; derive weekly figures from the fact tables instead, which are unaffected.

Known and expected discrepancies — do not "fix" these in code:

|                         |      Amount | Why                                                                                                |
| ----------------------- | ----------: | -------------------------------------------------------------------------------------------------- |
| Replenishments vs sheet |  −95,650.00 | One row split across two JPL codes; the division is unknown, both rows are at 0 pending her answer |
| Payroll vs sheet        | +185,787.91 | 10 weeks where the source's own worker rows disagree with its stated weekly total                  |

One PO has payment terms that do not total 100% and is flagged in `remarks`.

`cash_advances` and `additional_payments` reconcile to the centavo. Keep it that way — if a
change makes them stop reconciling, the change is wrong.

---

## Why data entry quality matters more than reporting

**There is no ERP.** Every PO number, supplier name and JPL code is typed by hand. All the
defects found in the source trace to free-text entry: `3.8.7.` and `3.2.5.2.` (trailing
dots), `Inaguration`, one cell holding two JPL codes, and transactions dated 1900, 1958,
2005 and 2015.

So entry forms must have:

- A **JPL code picker** (tree select), never a free-text field
- **Supplier autocomplete** over the existing 324 names, with a warning on near-matches
- **Duplicate detection** on `purchase_orders.por_no`
- **Date range validation** against the project window (2025-01-01 to 2027-12-31)

This is where the tool earns its keep over the spreadsheet.

---

## Schema

`db/schema.sql` — 20 tables, 11 views. Load it before anything else.
`db/load_seed.sql` — `LOAD DATA LOCAL INFILE` for the seed CSVs in `db/seed/`.
`etl/etl_ods_to_csv.py` — regenerates the seed from the original `.ods` files. Standard
library only, no dependencies. It parses `content.xml` directly because
`pandas.read_excel` cannot open these files (formula-error cells).

The views do the aggregation. **Prefer querying a view over writing new aggregate SQL**,
and never pull rows into Node to sum them.

Key views: `v_budget_vs_actual` (the dashboard home), `v_po_balance` (outstanding per PO),
`v_planning_line_spend` (WBS drill-down), `v_weekly_burn`, `v_vat_component`.

Dimensions: `budget_items` (20 numbered lines, 1.0–20.0), `planning_lines` (99 JPL/WBS
codes, self-referencing, 1–7 levels deep), `suppliers` (324), and time (Mon–Sun weeks
matching the payroll cycle).

**Note:** all 99 planning-line codes currently have an empty `description`. The source
never defined them. Show the raw code where a label is missing; do not invent one.

---

## Conventions

- Parameterised queries only. Never string-concatenate a filter value.
- `mysql2/promise` with a connection pool.
- Paginate `replenishments` (1,563 rows and growing weekly) and `payroll_entries` (3,822).
- MySQL 8 runs with `ONLY_FULL_GROUP_BY`; the existing views satisfy it.
- Before enabling any write endpoint, add `created_by` / `updated_by` and an append-only
  `audit_log`. These figures feed billing.
- Dates are `DATE`, no times. Weeks run Monday to Sunday.

---

## Build order

1. `GET /api/projects/1/summary` and `/kpis` → Overview screen. **Ship this first**;
   it validates the whole data model against her spreadsheet.
2. Replenishment ledger + entry form + review queue. Highest-volume manual work.
3. Purchase orders (`v_po_balance`, filter to outstanding > 0).
4. Budget item drill-down + WBS tree.
5. Payroll (read-only, plus the reconciliation panel).
6. Writes, with the audit log.
7. Auth last — one local user, bcrypt cost ≥ 12.

Run the app and the spreadsheet in parallel for 2–4 weekly cycles before retiring the sheet.
