# Weekly Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the accountant pick which individual transactions belong to each week's budget, and see the resulting weekly total.

**Architecture:** A new join table records one row per (week, transaction). Weeks are identified by their Monday date — no week dimension table, because a week is fully described by that date. The five transaction types are referenced by five nullable FK columns with a CHECK that exactly one is set, so MySQL enforces both referential integrity and "a transaction belongs to at most one week". Amounts are never copied into the join table; they are joined from the source rows at read time, so an edited transaction cannot leave a stale figure behind in the weekly total.

**Tech Stack:** MySQL 8, Express (`mysql2/promise`), React + Vite, TanStack Query, Tailwind v4.

**Spec:** This plan's requirements come from the accountant's answer on 2026-09-01, recorded in memory as `weekly-budget-manual-selection`: *"The weekly budget should initially be empty. I will select the PO, CA, Replenishment, Payroll, and Additional Payments that need to be included in the weekly budget."*

---

## Global Constraints

Copied from `CLAUDE.md`. Every task's requirements implicitly include these.

- **Never sum a commitment with a disbursement.** `contract_amount` is a commitment; the five transaction types here are all disbursements. The weekly total is a cash figure only.
- **Money is `DECIMAL` and stays a string in JS.** Do not set `decimalNumbers: true`. Do arithmetic in SQL, or with `decimal.js`. Never `parseFloat` a peso amount.
- **All amounts are VAT-inclusive.** Never add VAT to a stored amount.
- **Parameterised queries only.** Never string-concatenate a filter value.
- **Writes require `created_by` and an `audit_log` row.** Use `recordAudit` from `server/lib/audit.js`, as `server/routes/cashAdvances.js` does.
- **Dates are `DATE`, no times. Weeks run Monday to Sunday.**
- **Do NOT build an approval workflow.** No submit/approve/lock states on a week. This is a selection, not a process. Scope creep is the main project risk.
- **Do NOT backfill `weekly_budget_additions`.** Its four blocks are all mislabelled `JULY 06-JULY 12, 2026` and the real dates are unrecoverable. It is aggregate-only (`additional_po`/`replen`/`labor` columns, no transaction link) so it cannot hold a selection. Leave it untouched; this feature does not read or write it.
- **Project date window:** 2025-01-01 to 2027-12-31.
- **Verification uses runnable node scripts, not a test framework.** This repo has zero tests and no test runner installed; adding one is out of scope. Follow the established pattern in `server/scripts/check-jpl-reconciliation.js`: a script that mounts the router on a spare port, asserts against real data, prints a count, and exits non-zero on failure. Client changes are verified by `npm run build` and `npx oxlint src/`.

---

## Open questions — answer before Task 1

Two of these change the schema. Ask the accountant; do not guess.

1. **For "PO", does she pick the purchase order or an individual PO payment?** This plan assumes **`po_payments`**, because that is where a peso amount and a date live, and it makes all five selectable types payment-shaped. If she means the PO itself, Task 1's `po_payment_id` column becomes `purchase_order_id` and the join in Task 2 changes; nothing else moves.
2. **Can a transaction appear in more than one week?** This plan assumes **no**, enforced by a UNIQUE index per source column. If she wants a transaction to be splittable across weeks, drop the UNIQUE indexes and add an `amount` column — a much larger change, so confirm before building.
3. **Is the week forward-looking (what to fund next week) or retrospective (what was spent)?** Does not change the schema, but decides whether the candidate list in Task 5 defaults to future-dated or past-dated transactions. This plan defaults to showing transactions dated within the selected week, which serves both readings.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `db/migrations/023_weekly_budget_selections.sql` | Create the join table and the read view. |
| `db/schema.sql` | Keep the canonical schema in sync with 023. |
| `server/routes/weeklyBudget.js` | All weekly-budget endpoints. New router, mounted alongside the others. |
| `server/index.js` | Mount the new router. |
| `server/scripts/check-weekly-budget.js` | The runnable check for this feature. |
| `client/src/types.ts` | `WeeklyBudgetWeek`, `WeeklyBudgetSelection`, `WeeklyBudgetCandidate`. |
| `client/src/hooks/useWeeklyBudget.ts` | Queries and mutations. |
| `client/src/pages/WeeklyBudget.tsx` | The page: week picker + selected list + totals. |
| `client/src/components/WeeklyBudgetPicker.tsx` | The add-transactions modal. |
| `client/src/App.tsx` | Route. |
| `client/src/components/Layout.tsx` | Nav link. |

---

### Task 1: Schema

**Files:**
- Create: `db/migrations/023_weekly_budget_selections.sql`
- Modify: `db/schema.sql` (append after `v_planning_line_spend`)
- Test: `server/scripts/check-weekly-budget.js`

**Interfaces:**
- Consumes: nothing.
- Produces: table `weekly_budget_selections`, view `v_weekly_budget_lines` with columns `(id, project_id, week_start, source, source_id, txn_date, reference, party, description, amount, note)` — `amount` is a `DECIMAL(18,2)` string. `source` is one of exactly `'PO Paid'`, `'Replenishment'`, `'Cash Advance'`, `'Additional Payment'`, `'Payroll'`; Tasks 3 and 4 depend on those literals matching.

- [ ] **Step 1: Write the migration**

```sql
-- The accountant builds each week's budget by hand: she picks the individual
-- transactions that belong to it (answer of 2026-09-01). This table records
-- those picks and nothing else.
--
-- Amounts are deliberately NOT copied here. The weekly total is joined from
-- the source rows at read time, so correcting a replenishment's amount
-- corrects every week it appears in, instead of leaving a stale copy behind.
--
-- Five nullable FKs with a CHECK rather than a polymorphic (source, source_id)
-- pair: this is money data and MySQL can only enforce referential integrity
-- and ON DELETE CASCADE against real columns. The UNIQUE index on each column
-- is what stops one transaction being funded in two different weeks.
--
-- weekly_budget_additions is NOT touched or backfilled -- it is aggregate-only
-- and its week labels are unrecoverable (see CLAUDE.md).
USE rcsni_cost;

CREATE TABLE IF NOT EXISTS weekly_budget_selections (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id             INT UNSIGNED NOT NULL,
  week_start             DATE NOT NULL,           -- always a Monday
  po_payment_id          INT UNSIGNED NULL,
  replenishment_id       INT UNSIGNED NULL,
  cash_advance_id        INT UNSIGNED NULL,
  additional_payment_id  INT UNSIGNED NULL,
  payroll_entry_id       INT UNSIGNED NULL,
  note                   VARCHAR(255) NULL,
  created_by             VARCHAR(64) NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_wbs_exactly_one CHECK (
    (po_payment_id IS NOT NULL) + (replenishment_id IS NOT NULL) +
    (cash_advance_id IS NOT NULL) + (additional_payment_id IS NOT NULL) +
    (payroll_entry_id IS NOT NULL) = 1
  ),
  UNIQUE KEY uq_wbs_po_payment (po_payment_id),
  UNIQUE KEY uq_wbs_replenishment (replenishment_id),
  UNIQUE KEY uq_wbs_cash_advance (cash_advance_id),
  UNIQUE KEY uq_wbs_additional (additional_payment_id),
  UNIQUE KEY uq_wbs_payroll (payroll_entry_id),
  KEY idx_wbs_week (project_id, week_start),
  CONSTRAINT fk_wbs_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_wbs_pp FOREIGN KEY (po_payment_id) REFERENCES po_payments (id) ON DELETE CASCADE,
  CONSTRAINT fk_wbs_r FOREIGN KEY (replenishment_id) REFERENCES replenishments (id) ON DELETE CASCADE,
  CONSTRAINT fk_wbs_ca FOREIGN KEY (cash_advance_id) REFERENCES cash_advances (id) ON DELETE CASCADE,
  CONSTRAINT fk_wbs_ap FOREIGN KEY (additional_payment_id) REFERENCES additional_payments (id) ON DELETE CASCADE,
  CONSTRAINT fk_wbs_pe FOREIGN KEY (payroll_entry_id) REFERENCES payroll_entries (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per selected transaction, normalised. Voided source rows are kept
-- out here rather than filtered in every caller.
CREATE OR REPLACE VIEW v_weekly_budget_lines AS
SELECT s.id, s.project_id, s.week_start, 'PO Paid' AS source, pp.id AS source_id,
       pp.paid_on AS txn_date, COALESCE(pp.voucher_no, po.por_no) AS reference,
       sup.name AS party, CONCAT('PO ', po.por_no, ' — ', pp.payment_type) AS description,
       pp.amount_php AS amount, s.note
  FROM weekly_budget_selections s
  JOIN po_payments pp ON pp.id = s.po_payment_id AND pp.voided_at IS NULL
  JOIN purchase_orders po ON po.id = pp.purchase_order_id AND po.voided_at IS NULL
  LEFT JOIN suppliers sup ON sup.id = po.supplier_id
UNION ALL
SELECT s.id, s.project_id, s.week_start, 'Replenishment', r.id,
       r.txn_date, COALESCE(r.ref_no, r.document_no), sup.name, r.item_description, r.amount, s.note
  FROM weekly_budget_selections s
  JOIN replenishments r ON r.id = s.replenishment_id AND r.voided_at IS NULL
  LEFT JOIN suppliers sup ON sup.id = r.supplier_id
UNION ALL
SELECT s.id, s.project_id, s.week_start, 'Cash Advance', ca.id,
       ca.txn_date, COALESCE(ca.control_no, ca.document_no), ca.requested_by, ca.purpose, ca.amount, s.note
  FROM weekly_budget_selections s
  JOIN cash_advances ca ON ca.id = s.cash_advance_id AND ca.voided_at IS NULL
UNION ALL
SELECT s.id, s.project_id, s.week_start, 'Additional Payment', ap.id,
       ap.txn_date, COALESCE(ap.voucher_no, ap.document_no), COALESCE(ap.payee, sup.name),
       ap.description, ap.amount_php, s.note
  FROM weekly_budget_selections s
  JOIN additional_payments ap ON ap.id = s.additional_payment_id AND ap.voided_at IS NULL
  LEFT JOIN suppliers sup ON sup.id = ap.supplier_id
UNION ALL
SELECT s.id, s.project_id, s.week_start, 'Payroll', pe.id,
       per.period_end, per.label, w.full_name, w.position, pe.amount, s.note
  FROM weekly_budget_selections s
  JOIN payroll_entries pe ON pe.id = s.payroll_entry_id AND pe.voided_at IS NULL
  LEFT JOIN payroll_periods per ON per.id = pe.payroll_period_id
  LEFT JOIN workers w ON w.id = pe.worker_id;
```

- [ ] **Step 2: Apply it and verify the table starts empty**

Run:
```bash
cd server && node --env-file=.env -e "
const fs=require('fs'), mysql=require('mysql2/promise');
(async()=>{const c=await mysql.createConnection({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,multipleStatements:true});
await c.query(fs.readFileSync('../db/migrations/023_weekly_budget_selections.sql','utf8'));
const [[n]]=await c.query('SELECT COUNT(*) n FROM v_weekly_budget_lines');
console.log('weekly budget lines:', n.n); await c.end();})();"
```
Expected: `weekly budget lines: 0` — the feature starts empty, as she asked.

- [ ] **Step 3: Verify the CHECK constraint actually rejects a bad row**

Run:
```bash
cd server && node --env-file=.env -e "
const mysql=require('mysql2/promise');
(async()=>{const c=await mysql.createConnection({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
for (const [label,sql] of [['zero sources','INSERT INTO weekly_budget_selections (project_id,week_start) VALUES (1,\"2026-08-17\")'],
                           ['two sources','INSERT INTO weekly_budget_selections (project_id,week_start,replenishment_id,cash_advance_id) VALUES (1,\"2026-08-17\",1,1)']]) {
  try { await c.query(sql); console.log('FAIL - '+label+' was accepted'); }
  catch (e) { console.log('ok - '+label+' rejected:', e.code); }
}
await c.end();})();"
```
Expected: both lines print `ok - ... rejected: ER_CHECK_CONSTRAINT_VIOLATED`. If either says FAIL, the CHECK is not being enforced and the rest of this plan is unsafe.

- [ ] **Step 4: Mirror the change into `db/schema.sql`**

Append the same `CREATE TABLE` and `CREATE OR REPLACE VIEW` text to `db/schema.sql`, after the `v_planning_line_spend` definition. Same convention migrations 021 and 022 follow.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/023_weekly_budget_selections.sql db/schema.sql
git commit -m "Add weekly budget selection table and view"
```

---

### Task 2: Read endpoints

**Files:**
- Create: `server/routes/weeklyBudget.js`
- Modify: `server/index.js` (add the mount beside the other `/api/projects` routers)

**Interfaces:**
- Consumes: `v_weekly_budget_lines` from Task 1.
- Produces:
  - `GET /api/projects/:id/weekly-budget/weeks` → `[{ week_start, week_end, line_count, total_amount }]`, newest first.
  - `GET /api/projects/:id/weekly-budget/:weekStart` → `[{ id, source, source_id, txn_date, reference, party, description, amount, note }]`.

- [ ] **Step 1: Write the router**

```javascript
const express = require('express');
const pool = require('../db');

const router = express.Router();

// A week is its Monday. Reject anything else outright rather than silently
// bucketing a Tuesday into its own one-day "week".
const WEEK_START = /^\d{4}-\d{2}-\d{2}$/;

function isMonday(iso) {
  if (!WEEK_START.test(iso)) return false;
  // Parsed as UTC so the server's timezone cannot shift the weekday.
  return new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;
}

// Weeks that have at least one selection. Totals are summed in SQL -- these
// are DECIMAL strings and must never be added in Node.
router.get('/:id/weekly-budget/weeks', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT week_start,
              DATE_ADD(week_start, INTERVAL 6 DAY) AS week_end,
              COUNT(*)   AS line_count,
              SUM(amount) AS total_amount
         FROM v_weekly_budget_lines
        WHERE project_id = ?
        GROUP BY week_start
        ORDER BY week_start DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/weekly-budget/:weekStart', async (req, res, next) => {
  try {
    if (!isMonday(req.params.weekStart)) {
      return res.status(400).json({ error: 'weekStart must be a Monday in YYYY-MM-DD form' });
    }
    const [rows] = await pool.query(
      `SELECT id, source, source_id, txn_date, reference, party, description, amount, note
         FROM v_weekly_budget_lines
        WHERE project_id = ? AND week_start = ?
        ORDER BY source, txn_date, reference`,
      [req.params.id, req.params.weekStart]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 2: Mount it**

In `server/index.js`, after the `wbs` mount:

```javascript
app.use('/api/projects', requireAuth, require('./routes/weeklyBudget'));
```

- [ ] **Step 3: Verify both endpoints answer on an empty table**

Run:
```bash
cd server && node --env-file=.env -e "
const express=require('express'); const app=express();
app.use('/api/projects', require('./routes/weeklyBudget'));
const s=app.listen(4097, async()=>{
  for (const p of ['/api/projects/1/weekly-budget/weeks','/api/projects/1/weekly-budget/2026-08-17','/api/projects/1/weekly-budget/2026-08-18']) {
    const r=await fetch('http://localhost:4097'+p); console.log(r.status, p, (await r.text()).slice(0,60));
  }
  s.close(); process.exit(0);});"
```
Expected: `200 .../weeks []`, `200 .../2026-08-17 []`, and `400 .../2026-08-18` (a Tuesday) with the weekStart error.

- [ ] **Step 4: Commit**

```bash
git add server/routes/weeklyBudget.js server/index.js
git commit -m "Add weekly budget read endpoints"
```

---

### Task 3: Candidate endpoint

The list she picks from: transactions dated inside the week that are not already in *any* week.

**Files:**
- Modify: `server/routes/weeklyBudget.js`

**Interfaces:**
- Produces: `GET /api/projects/:id/weekly-budget/:weekStart/candidates` → `[{ source, source_id, txn_date, reference, party, description, amount }]`.

- [ ] **Step 1: Add the route above `module.exports`**

```javascript
// Everything dated in the week that no week has claimed yet. The NOT EXISTS
// against weekly_budget_selections is what keeps an already-budgeted
// transaction out of the picker -- the UNIQUE indexes would reject it at
// insert time anyway, but showing it and then failing is a worse experience.
router.get('/:id/weekly-budget/:weekStart/candidates', async (req, res, next) => {
  try {
    if (!isMonday(req.params.weekStart)) {
      return res.status(400).json({ error: 'weekStart must be a Monday in YYYY-MM-DD form' });
    }
    const ids = [req.params.id, req.params.weekStart, req.params.weekStart];
    const params = [...ids, ...ids, ...ids, ...ids, ...ids];

    const [rows] = await pool.query(
      `SELECT 'PO Paid' AS source, pp.id AS source_id, pp.paid_on AS txn_date,
              COALESCE(pp.voucher_no, po.por_no) AS reference, s.name AS party,
              CONCAT('PO ', po.por_no, ' — ', pp.payment_type) AS description, pp.amount_php AS amount
         FROM po_payments pp
         JOIN purchase_orders po ON po.id = pp.purchase_order_id AND po.voided_at IS NULL
         LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.project_id = ? AND pp.voided_at IS NULL
          AND pp.paid_on BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
          AND NOT EXISTS (SELECT 1 FROM weekly_budget_selections w WHERE w.po_payment_id = pp.id)

       UNION ALL
       SELECT 'Replenishment', r.id, r.txn_date, COALESCE(r.ref_no, r.document_no), s.name,
              r.item_description, r.amount
         FROM replenishments r
         LEFT JOIN suppliers s ON s.id = r.supplier_id
        WHERE r.project_id = ? AND r.voided_at IS NULL
          AND r.txn_date BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
          AND NOT EXISTS (SELECT 1 FROM weekly_budget_selections w WHERE w.replenishment_id = r.id)

       UNION ALL
       SELECT 'Cash Advance', ca.id, ca.txn_date, COALESCE(ca.control_no, ca.document_no),
              ca.requested_by, ca.purpose, ca.amount
         FROM cash_advances ca
        WHERE ca.project_id = ? AND ca.voided_at IS NULL
          AND ca.txn_date BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
          AND NOT EXISTS (SELECT 1 FROM weekly_budget_selections w WHERE w.cash_advance_id = ca.id)

       UNION ALL
       SELECT 'Additional Payment', ap.id, ap.txn_date, COALESCE(ap.voucher_no, ap.document_no),
              COALESCE(ap.payee, s.name), ap.description, ap.amount_php
         FROM additional_payments ap
         LEFT JOIN suppliers s ON s.id = ap.supplier_id
        WHERE ap.project_id = ? AND ap.voided_at IS NULL
          AND ap.txn_date BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
          AND NOT EXISTS (SELECT 1 FROM weekly_budget_selections w WHERE w.additional_payment_id = ap.id)

       UNION ALL
       SELECT 'Payroll', pe.id, per.period_end, per.label, w2.full_name, w2.position, pe.amount
         FROM payroll_entries pe
         LEFT JOIN payroll_periods per ON per.id = pe.payroll_period_id
         LEFT JOIN workers w2 ON w2.id = pe.worker_id
        WHERE pe.project_id = ? AND pe.voided_at IS NULL
          AND per.period_end BETWEEN ? AND DATE_ADD(?, INTERVAL 6 DAY)
          AND NOT EXISTS (SELECT 1 FROM weekly_budget_selections w WHERE w.payroll_entry_id = pe.id)

       ORDER BY source, txn_date, reference`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Verify it returns real candidates for a week with known activity**

Run:
```bash
cd server && node --env-file=.env -e "
const express=require('express'); const app=express();
app.use('/api/projects', require('./routes/weeklyBudget'));
const s=app.listen(4097, async()=>{
  const r=await fetch('http://localhost:4097/api/projects/1/weekly-budget/2026-08-17/candidates');
  const rows=await r.json();
  console.log('candidates:', rows.length);
  console.log('sources:', [...new Set(rows.map(x=>x.source))].join(', '));
  console.log(rows.slice(0,3));
  s.close(); process.exit(0);});"
```
Expected: a non-zero count and at least two distinct sources. 2026-08-17 is a Monday inside the live data range (payroll period `August 17-23,2026` exists). If the count is 0, widen to an earlier week before assuming the query is wrong.

- [ ] **Step 3: Commit**

```bash
git add server/routes/weeklyBudget.js
git commit -m "Add weekly budget candidate endpoint"
```

---

### Task 4: Write endpoints

**Files:**
- Modify: `server/routes/weeklyBudget.js`
- Create: `server/scripts/check-weekly-budget.js`

**Interfaces:**
- Produces:
  - `POST /api/projects/:id/weekly-budget/:weekStart` body `{ source, source_id, note? }` → `201 { id }`.
  - `DELETE /api/projects/:id/weekly-budget/lines/:lineId` → `204`.

- [ ] **Step 1: Add both routes**

```javascript
const { recordAudit } = require('../lib/audit');

// Maps the API's source name to its column. An unknown source must 400 rather
// than fall through to an INSERT with every column null.
const SOURCE_COLUMN = {
  'PO Paid': 'po_payment_id',
  Replenishment: 'replenishment_id',
  'Cash Advance': 'cash_advance_id',
  'Additional Payment': 'additional_payment_id',
  Payroll: 'payroll_entry_id',
};

router.post('/:id/weekly-budget/:weekStart', async (req, res, next) => {
  try {
    if (!isMonday(req.params.weekStart)) {
      return res.status(400).json({ error: 'weekStart must be a Monday in YYYY-MM-DD form' });
    }
    const column = SOURCE_COLUMN[req.body?.source];
    if (!column) {
      return res.status(400).json({ error: `source must be one of ${Object.keys(SOURCE_COLUMN).join(', ')}` });
    }
    const sourceId = Number(req.body?.source_id);
    if (!Number.isInteger(sourceId) || sourceId < 1) {
      return res.status(400).json({ error: 'source_id must be a positive integer' });
    }

    // recordAudit must run on the same connection inside the same transaction
    // as the write it records (see server/lib/audit.js), so this takes a
    // connection rather than using the pool directly.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        `INSERT INTO weekly_budget_selections (project_id, week_start, ${column}, note, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [req.params.id, req.params.weekStart, sourceId, req.body?.note ?? null, req.session.username]
      );
      await recordAudit(conn, {
        table: 'weekly_budget_selections',
        rowId: result.insertId,
        action: 'insert',
        changedBy: req.session.username,
        after: { week_start: req.params.weekStart, source: req.body.source, source_id: sourceId },
      });
      await conn.commit();
      res.status(201).json({ id: result.insertId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    // The UNIQUE index is the authority on "already budgeted" -- report it as
    // a conflict rather than a 500, since it is a normal thing to hit when two
    // weeks are open side by side.
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'That transaction is already in a weekly budget' });
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'No such transaction' });
    }
    next(err);
  }
});

router.delete('/:id/weekly-budget/lines/:lineId', async (req, res, next) => {
  try {
    const [[before]] = await pool.query(
      'SELECT * FROM weekly_budget_selections WHERE id = ? AND project_id = ?',
      [req.params.lineId, req.params.id]
    );
    if (!before) return res.status(404).json({ error: 'No such weekly budget line' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM weekly_budget_selections WHERE id = ?', [req.params.lineId]);
      await recordAudit(conn, {
        table: 'weekly_budget_selections',
        rowId: Number(req.params.lineId),
        action: 'update',
        changedBy: req.session.username,
        before,
        after: null,
      });
      await conn.commit();
      res.status(204).end();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});
```

**Verified against the existing code, not assumed:** `recordAudit(conn, { table, rowId, action, changedBy, before, after })` is the real signature in `server/lib/audit.js`, and its own comment requires the same connection and transaction as the write — hence `getConnection()` rather than `pool`. The session field is `req.session.username`, matching `server/routes/cashAdvances.js:221`. `audit_log.action` is an ENUM of only `'insert'` and `'update'`, which is why a delete is recorded as `'update'` with a null `after`.

- [ ] **Step 2: Write the check script**

```javascript
// Verifies the weekly budget's guarantees against the live schema:
//   - a selected transaction cannot be added to a second week
//   - a selected transaction disappears from the candidate list
//   - the week total equals the sum of its lines
// Adds rows, asserts, then removes them, leaving the table as it found it.
//
// Run:  node --env-file=.env scripts/check-weekly-budget.js
const express = require('express');
const Decimal = require('decimal.js');

const PROJECT_ID = 1;
const WEEK = '2026-08-17';
const PORT = 4097;

const app = express();
app.use(express.json());
app.use('/api/projects', require('../routes/weeklyBudget'));

const server = app.listen(PORT, async () => {
  const base = `http://localhost:${PORT}/api/projects/${PROJECT_ID}/weekly-budget`;
  let failures = 0;
  const added = [];

  const fail = (msg) => { failures++; console.error('FAIL:', msg); };

  try {
    const candidates = await (await fetch(`${base}/${WEEK}/candidates`)).json();
    if (candidates.length === 0) throw new Error(`no candidates in ${WEEK} to test with`);
    const pick = candidates[0];

    const post = await fetch(`${base}/${WEEK}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: pick.source, source_id: pick.source_id }),
    });
    if (post.status !== 201) fail(`expected 201 adding a line, got ${post.status}`);
    added.push((await post.json()).id);

    const dup = await fetch(`${base}/${WEEK}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: pick.source, source_id: pick.source_id }),
    });
    if (dup.status !== 409) fail(`re-adding the same transaction should be 409, got ${dup.status}`);

    const after = await (await fetch(`${base}/${WEEK}/candidates`)).json();
    if (after.some((c) => c.source === pick.source && c.source_id === pick.source_id)) {
      fail('a selected transaction is still offered as a candidate');
    }

    const lines = await (await fetch(`${base}/${WEEK}`)).json();
    const weeks = await (await fetch(`${base}/weeks`)).json();
    const week = weeks.find((w) => String(w.week_start).startsWith(WEEK));
    const lineSum = lines.reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
    if (!week || !lineSum.equals(week.total_amount)) {
      fail(`week total ${week?.total_amount} != sum of its lines ${lineSum.toFixed(2)}`);
    }
  } catch (err) {
    fail(err.message);
  } finally {
    for (const id of added) {
      await fetch(`http://localhost:${PORT}/api/projects/${PROJECT_ID}/weekly-budget/lines/${id}`, {
        method: 'DELETE',
      });
    }
  }

  console.log(failures === 0 ? 'weekly budget checks passed' : `${failures} failures`);
  server.close();
  process.exit(failures ? 1 : 0);
});
```

- [ ] **Step 3: Run it**

Run: `cd server && node --env-file=.env scripts/check-weekly-budget.js`
Expected: `weekly budget checks passed`, exit 0.

- [ ] **Step 4: Confirm the check can fail**

Temporarily change `if (dup.status !== 409)` to `!== 200`, re-run, confirm it reports a failure and exits 1, then change it back. A check that cannot fail is not a check.

- [ ] **Step 5: Commit**

```bash
git add server/routes/weeklyBudget.js server/scripts/check-weekly-budget.js
git commit -m "Add weekly budget write endpoints with audit logging"
```

---

### Task 5: Client data layer

**Files:**
- Modify: `client/src/types.ts`
- Create: `client/src/hooks/useWeeklyBudget.ts`

**Interfaces:**
- Consumes: the four endpoints from Tasks 2–4.
- Produces: `useWeeklyBudgetWeeks()`, `useWeeklyBudgetLines(weekStart)`, `useWeeklyBudgetCandidates(weekStart)`, `useAddWeeklyBudgetLine()`, `useRemoveWeeklyBudgetLine()`.

- [ ] **Step 1: Add the types**

```typescript
export interface WeeklyBudgetWeek {
  week_start: string;
  week_end: string;
  line_count: number;
  total_amount: string;
}

export interface WeeklyBudgetLine {
  id: number;
  source: string;
  source_id: number;
  txn_date: string | null;
  reference: string | null;
  party: string | null;
  description: string | null;
  amount: string;
  note: string | null;
}

export type WeeklyBudgetCandidate = Omit<WeeklyBudgetLine, 'id' | 'note'>;
```

- [ ] **Step 2: Write the hooks**

Follow the shape of `client/src/hooks/useWbs.ts` for queries, and any existing mutation hook (for example in `useCashAdvances.ts`) for the invalidation pattern. Both mutations must invalidate `['weekly-budget-weeks']`, `['weekly-budget-lines', weekStart]` and `['weekly-budget-candidates', weekStart]`, or the picker will keep offering a transaction that was just added.

- [ ] **Step 3: Verify it compiles**

Run: `cd client && npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add client/src/types.ts client/src/hooks/useWeeklyBudget.ts
git commit -m "Add weekly budget client data layer"
```

---

### Task 6: The page

**Files:**
- Create: `client/src/pages/WeeklyBudget.tsx`
- Create: `client/src/components/WeeklyBudgetPicker.tsx`
- Modify: `client/src/App.tsx` (route `weekly-budget`), `client/src/components/Layout.tsx` (nav link "Weekly budget")

**Interfaces:**
- Consumes: the hooks from Task 5.

- [ ] **Step 1: Build the page**

Layout, in the app's existing `Panel` + table idiom:
- A week selector. Weeks with selections come from `useWeeklyBudgetWeeks()`; to start a new one, a `<input type="date">` snapped back to its Monday. Use the native date input — no picker dependency.
- Selected lines grouped by source, each group subtotalled, with a grand total. Reuse the per-ledger summary shape from `JplTransactionsModal.tsx`; the two are the same idea.
- A remove control per line.
- An "Add transactions" button opening the picker.
- **Empty state:** "No transactions in this week's budget yet. Add the ones to fund." An empty screen is an invitation to act, and the accountant's own instruction was that it starts empty — it should not look broken.

- [ ] **Step 2: Build the picker**

A `Modal` listing `useWeeklyBudgetCandidates(weekStart)` grouped by source, each row with a checkbox, a running total of what is ticked, and one "Add selected" button that posts each pick. Show the running total against the same `formatMoney` used everywhere else.

- [ ] **Step 3: Verify**

Run: `cd client && npm run build && npx oxlint src/`
Expected: a clean build and no lint output.

- [ ] **Step 4: Check it in the running app**

Restart the server (`scripts/start-plaridel.bat`), open Weekly budget, add two transactions to a week, remove one, and confirm the total matches the remaining line. Then re-run `node --env-file=.env scripts/check-weekly-budget.js` to confirm the API still agrees.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/WeeklyBudget.tsx client/src/components/WeeklyBudgetPicker.tsx client/src/App.tsx client/src/components/Layout.tsx
git commit -m "Add weekly budget page and transaction picker"
```

---

## Deliberately not in scope

- **No approval/lock states on a week.** CLAUDE.md: no approval workflow.
- **No editing amounts here.** A wrong amount is fixed in its own ledger; this feature only chooses which transactions count.
- **No touching `weekly_budget_additions`.** Not read, not written, not backfilled.
- **No split of one transaction across two weeks.** Open question 2 — build it only if she says she needs it.
- **No Overview panel for weekly budget** until she has used the page and asked for one.
