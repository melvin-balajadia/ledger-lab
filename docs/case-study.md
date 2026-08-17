# LedgerLab — Case Study

> A cost & payroll monitoring system for a large construction project: three
> separate money ledgers, a hand-typed source with no ERP behind it, and a
> migration that had to prove itself against the original spreadsheets before
> anyone would trust a single figure on screen.

**Role:** Solo developer (data modelling + ETL + backend + frontend)
**Stack:** React · TypeScript · Vite · Tailwind CSS · TanStack Query · Express · MySQL 8 · Python (stdlib ETL)
**Note:** Internal tool for a private client. All figures below are code and
schema metrics — no client financial data appears in this write-up.

---

## TL;DR

Two hand-maintained spreadsheets had become the only record of a multi-year
construction project's costs, and reporting from them had stopped working. I
rebuilt them as a single-user web application: a Python extractor that parses the
raw spreadsheet XML, a MySQL schema where the reporting logic lives in views, an
Express API, and a React dashboard. The hard part was never the CRUD — it was
discovering that the source had been summing three different kinds of money into
one column, and building a migration that could *prove* it hadn't lost or altered
anything on the way in.

## The story

The client is an accountant who built both workbooks herself. They worked fine as
a record; what had broken was everything downstream. Answering "how much is left
on this line item" meant reading across sheets that had quietly drifted apart, and
weekly figures could no longer be defended when someone asked where a number came
from.

The two files held around twenty named sheets between them, plus a dozen dead
`file:///D:/…` link sheets pointing at a workbook on somebody else's drive. One
sheet stored payroll as a worker × week pivot grid forty-three weeks wide. Another
laid four separate weekly summaries *side by side* across sixty-six columns.

One answer from the client reshaped the whole project: **there is no ERP.** Every
reference number, supplier name and charge code is typed by hand. If nothing
upstream validates the data, the app isn't a reporting layer over a source of
truth — the app *becomes* the source of truth, and its real value is entry
quality, not charts.

## What it does

**Monitor**
- Budget-vs-actual across every line item, with KPI cards, cost trend, and weekly burn
- Drill-down per budget item into a work-breakdown tree seven levels deep
- Alerts feed for over-budget items and rows needing attention

**Track the ledgers**
- Purchase orders with outstanding balance, structured payment-term milestones, retention holdback, and file attachments
- Petty-cash replenishment ledger — the highest-volume manual work, paginated
- Cash advances with unliquidated balance, and separately-classified additional expenses
- Payroll by period and by worker, with a reconciliation panel against the source's own control totals

**Enter data without repeating the source's mistakes**
- Charge-code tree picker instead of a free-text field
- Supplier autocomplete with near-match warnings
- Duplicate detection, date-window validation, and a split action for one invoice charged across several codes

**Defend the numbers** — every ledger exports to CSV and prints, soft-deletes are
restorable, and every write is recorded in an append-only audit log.

## Architecture & key decisions

- **Aggregation lives in the database.** Eleven views carry the reporting logic —
  budget vs actual, PO balance, per-code spend, weekly burn, retention, VAT
  component, and five per-ledger roll-ups. Rows are never pulled into Node to be
  summed, so there is one definition of every total instead of one per endpoint.
- **Money never becomes a float.** Amounts are `DECIMAL(18,2)`, and the MySQL
  driver returns them as strings — which is deliberately left alone. Arithmetic
  happens in SQL, or in `decimal.js` when it genuinely must happen in JS. No
  amount is ever `parseFloat`-ed and added to another.
- **The ETL is a build artifact, not a one-off.** The extractor is re-runnable and
  prints its own row counts and reconciliation on every run, so the migration
  re-proves itself instead of being trusted from memory.
- **History is append-only.** Budget revisions are inserted with before, after,
  effective date and reason — never `UPDATE`-ed in place — so past variances stay
  explainable.
- **Server owns the query shape.** The client is TanStack Query over a typed API
  layer; components never assemble SQL-shaped logic or re-derive a total the
  server already computed.

## Engineering challenges

**Spreadsheets no library could open.**
`pandas.read_excel` refuses these files outright — they contain formula-error
cells. So the extractor unzips the `.ods` archives and parses `content.xml`
directly, handling the format's repeat-count attributes, merged cells, and the
side-by-side block layout. It's ~670 lines of Python with **zero dependencies**,
which matters for a tool that has to still run on the client's machine in a year.

**Three ledgers presented as one column of money.**
The summary sheet had six money columns that were routinely summed. They aren't
the same kind of number: an approved *budget*, a contract *commitment*, and actual
*disbursements* are three ledgers, and adding across them produces a figure that
describes nothing. The clearest symptom is one word with two meanings — "remaining"
is either budget minus commitment ("how much can I still award?") or budget minus
cash out ("how much have I actually spent?"). Those are wildly different answers.
The schema exposes both as separate, explicitly labelled columns, and no view ever
mixes a commitment with a disbursement.

A related trap: a category of expense in the source *looked* like contract value
but is actually landed cost on imported equipment. Modelled the obvious way, two
line items would have read as significantly more committed than they were. It
counts toward cash out; it never touches contract value.

**A migration that had to prove itself.**
The first extraction pass didn't reconcile against the workbook's own control
totals. Rather than adjust numbers until they matched, I traced each gap to a
cause: two ledgers now reconcile **to the centavo**, and the two remaining
differences are each pinned to a specific defect in the source — one invoice
charged to two codes in a single cell with no stated division, and a set of weeks
where the source's own detail rows disagree with its own stated totals. A residual
that equals a known row exactly is itself evidence that nothing else is wrong.

**Bad rows are a feature, not a cleanup task.**
The tempting move is to drop or auto-correct rows that won't parse. Both destroy
evidence. Anything ambiguous loads with `needs_review = 1` and surfaces in a queue
where the client — the only person who knows the answer — fixes it in place. Under
1% of rows are flagged, and **zero rows were dropped**.

**Making the observed defects unrepresentable.**
Every entry control exists because a specific, countable defect was found in the
source — not because it's good practice in the abstract. Charge codes with
trailing dots and a misspelt supplier name became a tree picker and an
autocomplete. Transactions dated 1900 and 1958 became date-window validation. One
free-text terms field spelling roughly eight real patterns thirty-one different
ways became structured milestone rows that must total 100%. The original text is
still stored verbatim for reference — it's just no longer the truth.

**One invoice, several charge codes.**
A single document can be charged across multiple planning-line codes. Rather than
overload one row, siblings share a document number and each carries its own code,
with a split action that validates the parts sum to the whole. Every ledger table
that can be split carries the same column, so the reporting views handle it
uniformly.

**Knowing what not to build.**
One user, one project, one local machine. I explicitly cut the approval workflow
(that chain happens outside the app), roles and permissions, multi-tenancy, and
payroll calculation — the underlying rate data no longer exists in the source, so
the app records net pay and says so. Foreign-currency columns exist because the
domain needs them, but no feature was built on them until there's a transaction
that requires it. **Sixteen runtime dependencies across both halves of the stack,
total.**

## Design

This is a tool that gets scanned and operated, not read, so the craft went into
information design rather than decoration. The three-ledger model drives the whole
interface: the overview shows commitment and disbursement as nested proportions of
budget rather than as peer numbers, and both "remaining" figures appear
side by side with their question spelled out underneath. Labels do real work —
"Paid (check issued)" instead of "Paid", because the disbursement figures lead the
bank balance and nobody should read them as cash already gone.

Retention holdback gets its own line rather than being folded into an outstanding
balance, because it isn't a payable. Rows needing review are surfaced, never
hidden. Where the source never defined a label for a code, the UI shows the raw
code instead of inventing one. Amounts are right-aligned with tabular figures and
a single currency formatter, so columns actually line up and a misplaced decimal is
visible at a glance.

## What I learned

- Domain modelling is the deliverable. Four weeks of questions — what kind of money
  is this column, why doesn't this total match, is this an expense or a contract
  increase — produced more value than any feature I wrote afterwards.
- Migrations need a proof, not a vibe. A reconciliation harness that runs on every
  extraction turned "I think it's right" into something checkable by someone else.
- Precision is a schema decision, not a formatting one. Floats fail quietly at
  scale, and the fix has to be enforced end to end or it leaks back in.
- Data quality belongs in the product. A review queue beats a cleanup script,
  because the person who can resolve the ambiguity isn't the person running the
  script.
- Constraints beat validation messages. The most effective bug fixes were pickers
  and structured inputs that made the bad state impossible to enter.

## If I kept going

Fuller cost forecasting off the weekly burn trend, variance explanations attached
to budget revisions, a proper diffing view for the audit log, and automated tests
around the ETL's parsing edge cases — currently it's verified by its own
reconciliation output rather than by a test suite.

---

**By the numbers (code, not client data):** 22 tables · 11 reporting views ·
17 forward migrations · 71 REST endpoints · 12 screens · 55 React components ·
18 data hooks · ~18.7k lines · 16 runtime dependencies · ~670-line
zero-dependency Python extractor · ~6,800 rows migrated, 0 dropped.
