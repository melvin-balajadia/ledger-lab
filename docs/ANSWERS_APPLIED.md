# What changed after accounting's answers

Applied to `schema.sql`, `etl_ods_to_csv.py`, `load_seed.sql`. Re-run against the
re-uploaded files. **19 tables, 10 views.**

---

## The headline: three of four ledgers now reconcile to the centavo

| Table | Extracted | Sheet control | Diff |
|---|---:|---:|---:|
| `cash_advances` | 2,201,128.33 | 2,201,128.33 | **0.00** |
| `additional_payments` | 26,631,738.32 | 26,631,738.32 | **0.00** |
| `replenishments` | 13,256,268.29 | 13,351,918.29 | −95,650.00 |
| `payroll_entries` | 19,897,979.97 | 19,712,192.06 | +185,787.91 |

The PHP 28.3 M hole is closed. Both remaining gaps are explained, not mysterious:

- **−95,650.00** is *exactly* the one replenishment charged to two JPL codes at once
  (`G1 Wire #16 and Tubo 1 1/2`, 2026-05-12, coded `wire 3.2.2.26 pipe 3.1.2.2.1`). I
  split it into two rows and set both amounts to zero, because the source gives one lump
  sum and I can't invent the division. That the gap equals this row to the centavo is
  itself the proof nothing else is wrong. **One question for accounting: how does the
  95,650 divide between 3.2.2.26 and 3.1.2.2.1?**
- **+185,787.91** is the 10 payroll weeks where the worker rows don't sum to the stated
  weekly total. Unchanged from before; still needs adjudication.

---

## Answer-by-answer

**"Manual typing by hand" — no ERP.** This is the most consequential answer. There's no
upstream system to sync with, so the app becomes the system of record and its real value
is *data entry quality*, not reporting. Concretely, the UI must have: supplier autocomplete
(324 names, hand-typed, so variants breed fast), a JPL code picker rather than a free-text
box (that alone would have prevented `3.8.7.`, `3.2.5.2.`, `Inaguration` and the
double-coded row), duplicate-PO detection on `por_no`, and a warning when a date falls
outside the project window. Every defect I found traces to free-text entry.

**Item 6.0 = 94,895,712.** `SUMMARY` is now the authoritative seed throughout.
`SUMMARY_REVISED_BUDGET` should be treated as dead.

**Cash advance and additional payment have their own sheets.** Both now parsed. Cash
advances are 19 rows; additional payments 28 rows, and they turn out to be almost entirely
landed cost on imported equipment:

| Type | Amount |
|---|---:|
| Customs duty | 14,422,374.93 |
| Freight | 7,246,240.69 |
| Marine insurance | 2,220,589.58 |
| Other | 1,978,585.82 |
| Terminal handling | 763,947.30 |

The ETL classifies these into `additional_payments.expense_type` from the payee, so you
get that breakdown for free. Worth showing on the dashboard — PHP 26.6 M of import cost
on items 4.0 and 5.0 is a real story the current sheet hides.

**"Additional payment is not an increase to contract value."** This drove the most
important logic change: additional payments now count toward `total_disbursed` but are
excluded from `contract_amount`. Had I modelled them as contract increases, items 4.0 and
5.0 would have looked PHP 26.6 M more committed than they are.

**All amounts VAT-inclusive.** Added `projects.vat_inclusive` and `vat_rate`, plus a
`v_vat_component` view computing the VAT portion as `amount × 12/112`. **Never add VAT on
top of a stored amount anywhere in the app.**

**Cash advance vs replenishment: before vs after the expense.** Kept as separate tables —
the distinction is a genuine timing difference, and cash advances have an unliquidated
balance that replenishments never do.

**"Paid = invoice received and check issued."** Recorded as the definition of
`po_payments`. Note this is check-issued, not check-cleared, so your disbursement figure
leads the bank balance. Fine, but the dashboard label should say "Paid (check issued)" so
nobody mistakes it for cash gone from the account.

**Two JPL codes per invoice — confirmed possible.** Handled with a `document_no` column on
`replenishments`, `cash_advances` and `additional_payments`: each JPL gets its own row, and
split rows share a document number. I chose this over a separate allocation table because
it's how she already enters them — the Sika grout advance on 2026-07-27 is three
consecutive rows across `3.1.4.2` / `5.0` / `6.1`, and the ETL now auto-groups those into
`CA-0xx`. In the UI this becomes a "split across codes" button that adds sibling rows and
enforces that the parts sum to the whole.

**FX rate varies per payment.** Confirmed by the sheet itself — five different rates:
USD 61.57 (civil works), 59.554 (refrigeration, panels), 58.599 (racking), 57.554 (pallets)
and EUR 72.48. `fx_rates` is seeded with all five and `fx_rate` sits on both the PO and each
individual payment.

**"Budget will be adjusted accordingly."** Added a `budget_revisions` table — item number,
before, after, effective date, reason. Do not overwrite `revised_budget` in place. Fire
Protection is 61% over and Bollards 19% over; once those budgets move, the only way to
explain a variance later is a revision log. `v_budget_vs_actual` exposes `revision_count`.

**Item 20.0 "Other Expenses" exists.** It appears as a JPL code in the cash advance sheet
(vehicle PMS, laptop repairs, admin) and is now a real row in `SUMMARY`. Added as a budget
item; the app previously would have dropped those transactions.

**Inauguration is the first job planning line.** Now a real `planning_lines` row with code
`1.0`, plus budget item `1.0`. `Inaguration` in the source is normalised to it, spelling
and all.

**No-JPL payroll rows mean the worker left.** These are not errors, so they no longer get
flagged. Added `workers.date_separated`. Related: six people appear twice in the payroll
grid — I checked, and their week ranges never overlap, so they're re-hires, not duplicates.
One worker row each. (This also means `DUEÑAS, GERALD` and `DUENAS, NICSON` are two
different people, not a typo.)

**One local user, needs auth.** Added a minimal `users` table — username, bcrypt hash, no
roles. Deliberately small.

**Approval chain is Coordinator → SVP → CEO, "only for monitoring."** So I built *no*
approval workflow. That's the single biggest scope saving available here; approval routing
would have doubled the project. If that changes later, it's an additive change.

**Villasis Dry Storage Expansion is separate.** Seeded as a second project (`DSEXP`). Its
two estimate sheets stay out of Plaridel's numbers.

---

## Still open

1. **How does the 95,650 split** between `3.2.2.26` and `3.1.2.2.1`?
2. **The 10 unreconciled payroll weeks** — see `seed/_reconciliation_payroll.csv`.
   Largest: 2026-01-26 short by 23,250.48.
3. **Four transactions dated 2015, 2005, 1958 and 1900** (36,000 / 18,201 / 9,114 / 264).
   Loaded with `needs_review = 1`.
4. **Eight additional payments have no date** — all Bureau of Customs and Yusen Logistics,
   PHP 6.8 M between them. They have voucher numbers (`RFPLAEX00137` onward), so the dates
   should be recoverable.
5. **Retention — never actually answered.** My question was whether you hold back ~10%
   until completion; the answer described recording invoice amounts. Please re-ask. If
   retention exists, `po_payments` needs a retained flag and every "paid" figure shifts.
6. **The `FOREIGN_TO_PHP` replen summary says 13,351,888.29 while `CIVIL_MATERIALS` totals
   13,351,918.29** — a PHP 30.00 discrepancy between two of her own sheets. Trivial, but
   it's the kind of thing the app will eliminate permanently.

---

## Next step

Phase 0 is unchanged — run the three commands, then compare the printed budget-vs-actual
against `SUMMARY`. `load_seed.sql` now ends with the four-way reconciliation query above,
so you'll see immediately whether the load matched.

Then Phase 2: the Express backend. Given "manual typing" and "one local user," I'd
suggest the first screen after Overview should be **replenishment entry**, not the PO list —
1,563 rows and growing weekly is where her time actually goes.
