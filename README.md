# Plaridel Extension — Cost & Payroll Monitoring

Internal dashboard replacing two hand-maintained spreadsheets.
React (Vite) + Express + MySQL 8. Single local user.

**Read `CLAUDE.md` before writing any code.** It holds the domain rules —
particularly the three-ledger model, VAT handling, and retention — that are easy
to get wrong and expensive to get wrong.

---

## Setup

### 1. Enable bulk loading (one time)

```
mysql -u root -p
```

```sql
SET GLOBAL local_infile = 1;
EXIT;
```

### 2. Create the schema

Mac / Linux / Git Bash:
```bash
mysql -u root -p < db/schema.sql
```

Windows PowerShell (`<` is not supported there):
```powershell
Get-Content db\schema.sql | mysql -u root -p
```

### 3. Load the seed data

Must run from inside `db/seed` — `LOAD DATA LOCAL INFILE` resolves the CSV
filenames relative to the current directory.

```bash
cd db/seed && mysql --local-infile=1 -u root -p rcsni_cost < ../load_seed.sql
```

```powershell
cd db\seed
Get-Content ..\load_seed.sql | mysql --local-infile=1 -u root -p rcsni_cost
```

### 4. Check the output

The load script prints row counts, a reconciliation, and the retention table.

| Table | Rows |
|---|---:|
| suppliers | 324 |
| planning_lines | 99 |
| purchase_orders | 265 |
| po_payments | 276 |
| po_payment_terms | 85 |
| replenishments | 1,563 |
| cash_advances | 19 |
| additional_payments | 28 |
| payroll_periods | 51 |
| workers | 246 |
| payroll_entries | 3,822 |

Reconciliation against the spreadsheet's own totals:

| | Extracted | Sheet | Diff |
|---|---:|---:|---:|
| cash_advances | 2,201,128.33 | 2,201,128.33 | 0.00 |
| additional_payments | 26,631,738.32 | 26,631,738.32 | 0.00 |
| replenishments | 13,256,268.29 | 13,351,918.29 | −95,650.00 |
| payroll_entries | 19,897,979.97 | 19,712,192.06 | +185,787.91 |

**Both differences are expected.** The −95,650.00 is one replenishment charged
to two JPL codes at once, held at zero until accounting says how it divides.
The +185,787.91 is 10 payroll weeks where the source's own worker rows disagree
with its stated weekly totals. See `db/seed/_reconciliation_payroll.csv`.

Retention should total **PHP 25,319,221.48 across 11 POs**.

---

## Regenerating the seed

Only needed when accounting sends updated spreadsheets. Drop them in
`etl/source/` and run from the project root:

```bash
python etl/etl_ods_to_csv.py \
  etl/source/Plaridel_Extension_Cost__1_.ods \
  etl/source/Plaridel_Extension__Payroll__Replen_.ods \
  db/seed
```

Standard library only — nothing to install. It parses the ODS XML directly
because `pandas.read_excel` cannot open these files (they contain formula-error
cells).

Then re-run step 3. `schema.sql` drops and recreates every table, so re-run
step 2 first if you want a clean slate.

---

## Build order

1. `GET /api/projects/1/summary` + `/kpis` → Overview screen. **Ship first** —
   it validates the whole data model against her spreadsheet.
2. Replenishment ledger, entry form, review queue.
3. Purchase orders (`v_po_balance`, filter outstanding > 0).
4. Budget item drill-down + WBS tree.
5. Payroll, read-only, plus the reconciliation panel.
6. Writes — add `created_by` / `updated_by` and an `audit_log` first.
7. Auth last. One user, bcrypt cost ≥ 12.

Run the app and the spreadsheet in parallel for 2–4 weekly cycles before
retiring the sheet.

---

## Layout

```
CLAUDE.md          domain rules — Claude Code reads this automatically
db/                schema, loader, seed CSVs
etl/               ODS extractor + the source spreadsheets
docs/              analysis, changelog, the query memo sent to accounting
server/            Express API (empty)
client/            React app (empty)
```

## Open items

- How does PHP 95,650 split between JPL `3.2.2.26` and `3.1.2.2.1`?
- 10 payroll weeks that do not reconcile.
- 4 transactions dated 1900, 1958, 2005, 2015 (PHP 63,579 total) — flagged
  `needs_review = 1`.
- All 99 planning-line codes have no description; the source never defined them.
- One PO's payment terms do not total 100% — flagged in `remarks`.
- Do "RETENTION" and "COMPLETION" in payment terms mean the same holdback?
  Currently treated as equivalent.

None of these block development. They are visible in the app's review queue and
get fixed there.
