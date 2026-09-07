# Migration runbook — 2026-09-07

Deploying migrations **020, 021, 022, 023** plus the JPL summary/drill-down UI
to the accountant's machine.

---

## Read this first

**Verified against her live data as of `rcsni_cost_2026-09-07_134151.sql`.**
Every figure below was measured by restoring that dump and running the
migrations against it, not extrapolated from an older snapshot.

**She fixed three things herself in the week to 2026-09-07** — check these are
still true before running anything, because two migrations were written for the
old state:

| What | Now |
| --- | --- |
| POR17623 pallets PO | Already **USD at 60.00** = ₱61,570,404.00 |
| The ₱308,000 BMB payment at rate 1.0 | Replaced by **three USD payments** at 58.75 / 59.61 / 61.50, totalling USD 308,000 = ₱18,511,955.00 |
| POR18380 (was unassigned) | Assigned to **item 3.0**, JPL 3.0 |

That last one matters: I had guessed item 5.0 from the description. It was 3.0.
Good reason not to have assigned it myself.

**Neither bug class has recurred.** No foreign PO is tagged PHP at rate 1.0, and
no payment on a foreign PO sits at rate 1.0. No PO is missing a budget item or a
JPL code. Worth re-running those three checks after any week of heavy entry —
they are in Step 6.

The migrations are all **guarded and idempotent** — each matches on the exact
before-value it expects — so the risk is *not* a wrong write.

**The risk is a silent no-op.** If she has already edited one of the rows these
target, the guard matches nothing, the migration reports success, and the
change quietly doesn't happen. Every step below has a verification for exactly
that. Do not skip them.

**Migration 019 is already applied on her machine.** Do not re-run it.

**Run, in this order: 016, 020, 021, 023, 024.**

**Do NOT run 022.** It is superseded. Its first statement fixed the pallets PO's
currency, which she has already done by hand. Its second statement realigned
`budget_items.contract_amount` — pointless once 024 stops reading that column,
and actively harmful, because it would overwrite the historical figure the
spreadsheet carried with a derived one. Skipping it is the more correct choice
now, not just the shorter one.

**Verified impact on her 2026-09-07 data:** Committed **964,927,841.76 →
996,919,910.07 (+₱31,992,068.31)**, disbursed **unchanged** at 714,367,422.64,
the eight item-level gaps go to **zero**, and two false over-budget warnings
clear. The shift decomposes as +30,186,368.31 from deriving Committed from the
POs and +1,805,700.00 from restoring POR17533.

Run the SQL in **MySQL Workbench**. Migrations 020, 022 and 023 set
`SQL_SAFE_UPDATES` off and back on themselves, so Workbench's safe-update mode
(Error 1175) is already handled.

---

## Step 0 — Back up

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup-db.ps1
```

Or click **Backup now** in the app. Confirm a new `.sql` file appeared in
`backups\` and that it is over 1 MB. **This is the rollback.** Do not continue
without it.

---

## Step 1 — Record the "before" numbers

Run this in Workbench and **save the output**. Every check afterwards is a
comparison against it.

```sql
USE rcsni_cost;

SELECT 'A committed total (budget_items)' AS metric,
       FORMAT(SUM(contract_amount), 2) AS value
  FROM budget_items WHERE project_id = 1
UNION ALL SELECT 'B contract total (from POs)',
       FORMAT(COALESCE(SUM(contract_amount_php), 0), 2)
  FROM purchase_orders WHERE project_id = 1 AND voided_at IS NULL
UNION ALL SELECT 'C live PO count',
       COUNT(*) FROM purchase_orders WHERE project_id = 1 AND voided_at IS NULL
UNION ALL SELECT 'D total disbursed',
       FORMAT(SUM(total_disbursed), 2) FROM v_budget_vs_actual WHERE project_id = 1
UNION ALL SELECT 'E item 10.0 committed',
       FORMAT(contract_amount, 2) FROM budget_items WHERE project_id = 1 AND item_no = '10.0'
UNION ALL SELECT 'F item 9.0 committed',
       FORMAT(contract_amount, 2) FROM budget_items WHERE project_id = 1 AND item_no = '9.0'
UNION ALL SELECT 'G payroll on item 2.0',
       FORMAT(COALESCE(SUM(pe.amount), 0), 2)
  FROM payroll_entries pe JOIN budget_items bi ON bi.id = pe.budget_item_id
 WHERE pe.project_id = 1 AND pe.voided_at IS NULL AND bi.item_no = '2.0'
UNION ALL SELECT 'H payroll on item 3.0',
       FORMAT(COALESCE(SUM(pe.amount), 0), 2)
  FROM payroll_entries pe JOIN budget_items bi ON bi.id = pe.budget_item_id
 WHERE pe.project_id = 1 AND pe.voided_at IS NULL AND bi.item_no = '3.0';
```

**Sanity check before going further.** Row E must read **59,060,383.86** and
row F must read **17,805,700.00**. If either differs, she has edited that
budget item since 2026-09-01 — **stop**, and re-check migrations 022/023
against her current values before running them.

---

## Step 2 — Update the code

```powershell
git pull                    # or copy the changed files across
cd client
npm run build               # regenerates client/dist -- she never does this herself
```

Do not restart the server yet; do the database first.

---

## Step 3 — Run the migrations, in order

### 016 — apply the approved budget revisions ⚠️ clears two red warnings

`db/migrations/016_budget_revision_apply_pending.sql`

Accounting confirmed the approved revised budgets are the live figures. Sets
`revised_budget` from the latest revision **that actually changed the amount** —
Fire Protection to 34,661,976.86 and Bollards to 6,534,100.00.

The "actually changed" part matters: Bollards has a no-op revision from
2026-08-31 (5,497,365.00 → 5,497,365.00, no reason, no approver). The original
version of this migration applied the *latest* revision and would have used
that one, fixing Fire Protection and silently doing nothing for Bollards.

**Verify — both `is_over_budget` must be 0:**

```sql
SELECT item_no, description, FORMAT(budget, 2) AS budget,
       FORMAT(contract_amount, 2) AS committed, is_over_budget
  FROM v_budget_vs_actual WHERE project_id = 1 AND item_no IN ('14.0', '17.0');
```

Expect Fire Protection budget **34,661,976.86** and Bollards **6,534,100.00**.

### 020 — payroll budget-item realign

`db/migrations/020_payroll_entries_budget_item_realign_followup.sql`

Moves payroll entry **890** (ADOC, BRYAN ASIONG — ₱5,797.24, JPL code 3.1.2)
from budget item **2.0** to **3.0**, where its JPL code says it belongs.

**Verify — expect 0:**

```sql
SELECT COUNT(*) AS rows_still_wrong
  FROM payroll_entries pe JOIN planning_lines pl ON pl.id = pe.planning_line_id
 WHERE pe.voided_at IS NULL
   AND (pe.budget_item_id IS NULL OR pe.budget_item_id <> pl.budget_item_id);
```

### 021 — contract column on the JPL view

`db/migrations/021_planning_line_contract.sql`

Adds `contract_amount` to `v_planning_line_spend`. **View definition only — no
data changes.** The new Overview panel will not load without it.

**Verify — expect 1:**

```sql
SELECT COUNT(*) AS has_column FROM information_schema.columns
 WHERE table_schema = 'rcsni_cost' AND table_name = 'v_planning_line_spend'
   AND column_name = 'contract_amount';
```

### 022 — pallets PO currency fix ⚠️ moves a reported figure

`db/migrations/022_pallets_po_usd_fx.sql`

PO **231 / POR17623** (PT Intraco Pallet Indonesia) holds **USD 1,026,173.40**
but was tagged PHP at rate 1.0. Sets it to USD at **60.00/USD** — the rate
accounting specified for item 10.0 — and realigns item 10.0's committed figure
to the same rate.

**This raises the Committed figure on item 10.0 by ₱2,510,020.14**
(59,060,383.86 → 61,570,404.00), because the old value was struck at 57.554.
She must see and accept this — see Step 6.

**Verify — both must read 61,570,404.00:**

```sql
SELECT contract_amount_php AS po_231 FROM purchase_orders WHERE id = 231;
SELECT contract_amount AS item_10 FROM budget_items WHERE project_id = 1 AND item_no = '10.0';
```

If PO 231 changed but the budget item did not, the guard on the second
statement didn't match — she edited item 10.0 since the snapshot. Fix it by
hand to 61570404.00 and note it.

### 023 — restore POR17533

`db/migrations/023_restore_por17533.sql`

Un-voids **POR17533** (Sansui Tech Solutions, ₱1,805,700.00, item 9.0), which
accounting confirmed was voided by mistake. No payments exist against it, so
**nothing on the disbursement side moves.**

**Verify — expect one row, diff 0.00:**

```sql
SELECT bi.item_no, FORMAT(bi.contract_amount, 2) AS committed,
       FORMAT(COALESCE(SUM(po.contract_amount_php), 0), 2) AS po_sum,
       FORMAT(bi.contract_amount - COALESCE(SUM(po.contract_amount_php), 0), 2) AS diff
  FROM budget_items bi
  LEFT JOIN purchase_orders po ON po.budget_item_id = bi.id AND po.voided_at IS NULL
 WHERE bi.project_id = 1 AND bi.item_no = '9.0'
 GROUP BY bi.id;
```

### 024 — Committed now comes from the POs ⚠️ moves the headline figure

`db/migrations/024_contract_amount_from_pos.sql`

Accounting: *"The system should automatically update the contract total based on
the PO's."* `v_budget_vs_actual` now sums `purchase_orders.contract_amount_php`
instead of reading the hand-kept `budget_items.contract_amount`.

**This raises the project Committed total by ₱21,046,695.77** and closes the six
item-level gaps by construction. Total disbursed does not move.

`budget_items.contract_amount` stays as the historical record but nothing reads
it, and the field on the budget-item form is now read-only.

**Verify — expect 0 rows (every item must equal its POs):**

```sql
SELECT v.item_no, v.contract_amount, COALESCE(SUM(po.contract_amount_php), 0) AS po_sum
  FROM v_budget_vs_actual v
  LEFT JOIN purchase_orders po ON po.budget_item_id = v.budget_item_id AND po.voided_at IS NULL
 WHERE v.project_id = 1
 GROUP BY v.budget_item_id, v.item_no, v.contract_amount
HAVING v.contract_amount <> COALESCE(SUM(po.contract_amount_php), 0);
```

**Also check what is now flagged over budget** — deriving from POs raises
several commitments, so this list changes:

```sql
SELECT item_no, description, FORMAT(budget, 2) AS budget,
       FORMAT(contract_amount, 2) AS committed,
       FORMAT(contract_amount - budget, 2) AS over_by
  FROM v_budget_vs_actual WHERE project_id = 1 AND is_over_budget = 1 ORDER BY item_no + 0;
```

Expect four: **1.0** and **16.0** (contracts against a zero budget), **7.0**
(over by ₱4.92, a source rounding artifact) and **10.0** (over by ₱2,355,670.00
after its USD contract was restated at 60.00). None is a bug; all four are worth
showing her.

---

## Step 4 — Restart the app

Close the Plaridel dashboard window, then re-run `scripts\start-plaridel.bat`.

**The server does not hot-reload.** Migration 021 and the new
`/wbs/:id/transactions` endpoint will 404 until this restart happens.

---

## Step 5 — Confirm the deltas

Re-run the **Step 1** query. Compare against what you saved:

Measured on her 2026-09-07 data. Deltas, not absolutes — anything she enters
between the dump and the run shifts the totals on its own, and that is fine.

| Metric | Expected |
| --- | --- |
| **Committed as reported** (`SELECT SUM(contract_amount) FROM v_budget_vs_actual WHERE project_id=1`) | 964,927,841.76 → **996,919,910.07** (+31,992,068.31) |
| A committed total (`budget_items` column) | **unchanged** at 964,927,841.76 — nothing reads it now, and 022 is skipped so nothing writes it |
| B contract total (from POs) | **+1,805,700.00** (POR17533 restored) |
| C live PO count | **+1** |
| D total disbursed | **0.00 — must not move**, stays 714,367,422.64 |
| Items whose Committed ≠ their POs | 8 → **0** |
| G payroll on item 2.0 | **−5,797.24** |
| H payroll on item 3.0 | **+5,797.24** |
| Items flagged over budget | Fire Protection and Bollards **clear**; **1.0, 7.0, 10.0, 16.0 remain** |
| `check-jpl-reconciliation.js` | `104 active JPL codes; 0 mismatches` |

After 024 the reported Committed equals the PO total by construction, so A and B
stop being two numbers anyone has to reconcile.

**If D (total disbursed) moved at all, stop and restore the backup.** None of
these four migrations touches a payment. If cash out changed, something else
did too.

Deltas, not absolutes — her six days of new entries will shift the totals on
their own, and that is expected.

Then run the automated check:

```powershell
cd server
node --env-file=.env scripts\check-jpl-reconciliation.js
```

Expect `checked N active JPL codes; 0 mismatches` and exit code 0. This
verifies every JPL code's drill-down still sums to its summary row, per ledger
and in total.

---

## Step 6 — What to confirm with her

Sit with her for these four. All are visual, none need SQL.

1. **Item 10.0 Plastic Pallets — the ₱2.5M rise.** Open the budget item. Committed
   now reads **₱61,570,404.00**, up ₱2,510,020.14. Explain why: the pallets PO is a
   **USD 1,026,173.40** contract that had been recorded as if it were pesos. The
   old figure used rate 57.554; she set 60.00. **This is the one number in this
   batch that changes what the dashboard reports about money.** She should say
   yes to it out loud.

2. **POR17533 is back.** Open the PO ledger and find it (Sansui Tech Solutions,
   ₱1,805,700.00). Confirm it is the one she meant to restore, and that item 9.0
   now shows Committed and its PO total agreeing.

3. **A ₱5,797.24 payroll entry moved between items.** Bryan Asiong's week under
   JPL 3.1.2 now counts against **3.0 Civil Works** instead of **2.0 Land
   Development**. Both items' Payroll figures shift by that amount; **the
   project total does not change.** Small, but it moves two items she reports on.

4. **The new "Cost by JPL code" panel on the Overview.** Have her open a budget
   item, then a JPL code, and check one code's transactions against her own
   records. This is the first time she will have used it — the drill-down has
   never run on her machine.

---

## Not fixed by this batch — still open

Say these plainly so she doesn't think the numbers are now clean.

- **The FX convention change.** Her instruction to use actual payment rates is
  not implemented as a rule — but note she has been applying it by hand, and
  correctly: the three replacement BMB payments use 58.75 / 59.61 / 61.50, the
  real rates on their dates. Under 024 each PO's own `fx_rate` now sets the
  commitment directly, so this is a per-PO data question rather than a
  system-wide convention. It may not need building at all.
- **Item 5.0 has a PO she says is wrong** ("the PO amount needs to be changed",
  2026-09-07) but she did not say which of the five or what it should be. Its
  gap is still ₱826,789.04, and under 024 that figure is now the reported
  commitment with nothing to contradict it.
- **Item 1.0's 30 centavos.** She gave 614,831.30; the POs total 614,831.60.
  Confirm before treating either as final.
- **The eight item-level gaps are gone by *adopting* the PO figures, not by
  investigating them.** Migration 024 makes Committed equal the POs by
  construction, so ₱31,992,068.31 that used to show as discrepancy is now simply
  the reported number. That is what accounting asked for, and it is the right
  call — but it removes the cross-check. A wrong PO amount now feeds the headline
  figure with nothing to contradict it, which is why the item 5.0 question above
  matters more than its ₱826,789.04 suggests.
- **A PO with no budget item now vanishes from Committed silently.** POR18380 was
  the example and she has since assigned it to item 3.0. But the mechanism
  remains: under 024, a PO with a null `budget_item_id` is in no item's total and
  simply drops out of the reported commitment. Nothing warns about it. The check
  in Step 6 catches it; consider making that an alert rather than a manual query.

---

## Rollback

If anything in Step 5 disagrees, restore the Step 0 backup:

```powershell
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u root -p rcsni_cost < backups\<the-backup-file>.sql
```

Then restart the app. All four migrations are guarded and idempotent, so a
partial run is safe to redo after restoring.
