const express = require('express');
const Decimal = require('decimal.js');
const pool = require('../db');

const router = express.Router();

const TREND_CATEGORIES = ['payroll', 'replenishments', 'po_payments', 'cash_advances', 'additional_payments'];

router.get('/:id/summary', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM v_budget_vs_actual
       WHERE project_id = ?
       ORDER BY CAST(item_no AS DECIMAL(5,1))`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/kpis', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         SUM(budget)          AS total_budget,
         SUM(contract_amount) AS total_committed,
         SUM(total_disbursed) AS total_disbursed,
         SUM(budget) - SUM(contract_amount) AS remaining_vs_contract,
         SUM(budget) - SUM(total_disbursed) AS remaining_vs_disbursed,
         CASE WHEN SUM(budget) > 0
              THEN ROUND(SUM(contract_amount) / SUM(budget) * 100, 2)
              END AS committed_pct
       FROM v_budget_vs_actual
       WHERE project_id = ?`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/cost-breakdown', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         COALESCE(SUM(labor_cost), 0)         AS payroll,
         COALESCE(SUM(replen_amount), 0)      AS replenishments,
         COALESCE(SUM(paid_po_amount), 0)     AS po_payments,
         COALESCE(SUM(cash_advanced), 0)      AS cash_advances,
         COALESCE(SUM(additional_payment), 0) AS additional_payments
       FROM v_budget_vs_actual
       WHERE project_id = ?`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/cost-trend', async (req, res, next) => {
  const projectId = req.params.id;
  const months = Math.min(24, Math.max(1, Number(req.query.months) || 6));

  try {
    // Anchor the trailing window on the latest real transaction date in the
    // data, not the wall-clock date -- this is seeded historical data, so
    // "now" isn't necessarily where the activity actually ends.
    const [[{ maxDate }]] = await pool.query(
      `SELECT MAX(d) AS maxDate FROM (
         SELECT MAX(period_end) AS d FROM payroll_periods WHERE project_id = ?
         UNION ALL
         SELECT MAX(txn_date) FROM replenishments WHERE project_id = ? AND voided_at IS NULL
         UNION ALL
         SELECT MAX(pay.paid_on) FROM po_payments pay
           JOIN purchase_orders po ON po.id = pay.purchase_order_id
           WHERE po.project_id = ? AND po.voided_at IS NULL AND pay.voided_at IS NULL
         UNION ALL
         SELECT MAX(txn_date) FROM cash_advances WHERE project_id = ? AND voided_at IS NULL
         UNION ALL
         SELECT MAX(txn_date) FROM additional_payments WHERE project_id = ? AND voided_at IS NULL
       ) t`,
      [projectId, projectId, projectId, projectId, projectId]
    );

    if (!maxDate) return res.json([]);

    const anchor = new Date(`${maxDate}T00:00:00Z`);
    const cutoff = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - (months - 1), 1));
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const monthKeys = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + i, 1));
      monthKeys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }

    const [[payroll], [replenishments], [poPayments], [cashAdvances], [additionalPayments], [commitment]] = await Promise.all([
      pool.query(
        `SELECT DATE_FORMAT(pp.period_start, '%Y-%m') AS month, SUM(pe.amount) AS amt
         FROM payroll_entries pe JOIN payroll_periods pp ON pp.id = pe.payroll_period_id
         WHERE pe.project_id = ? AND pe.voided_at IS NULL AND pp.period_start >= ? GROUP BY month`,
        [projectId, cutoffStr]
      ),
      pool.query(
        `SELECT DATE_FORMAT(txn_date, '%Y-%m') AS month, SUM(amount) AS amt
         FROM replenishments
         WHERE project_id = ? AND needs_review = 0 AND voided_at IS NULL AND txn_date >= ? GROUP BY month`,
        [projectId, cutoffStr]
      ),
      pool.query(
        `SELECT DATE_FORMAT(pay.paid_on, '%Y-%m') AS month, SUM(pay.amount_php) AS amt
         FROM po_payments pay JOIN purchase_orders po ON po.id = pay.purchase_order_id
         WHERE po.project_id = ? AND po.voided_at IS NULL AND pay.voided_at IS NULL
           AND pay.paid_on >= ? GROUP BY month`,
        [projectId, cutoffStr]
      ),
      pool.query(
        `SELECT DATE_FORMAT(txn_date, '%Y-%m') AS month, SUM(amount) AS amt
         FROM cash_advances WHERE project_id = ? AND voided_at IS NULL AND txn_date >= ? GROUP BY month`,
        [projectId, cutoffStr]
      ),
      pool.query(
        `SELECT DATE_FORMAT(txn_date, '%Y-%m') AS month, SUM(amount_php) AS amt
         FROM additional_payments
         WHERE project_id = ? AND needs_review = 0 AND voided_at IS NULL AND txn_date >= ? GROUP BY month`,
        [projectId, cutoffStr]
      ),
      // Commitment isn't a disbursement category, but the KPI card for
      // "Committed" wants a real vs-last-month delta too: new contract
      // value awarded that month (POs by po_date), same trailing window.
      pool.query(
        `SELECT DATE_FORMAT(po_date, '%Y-%m') AS month, SUM(contract_amount_php) AS amt
         FROM purchase_orders WHERE project_id = ? AND voided_at IS NULL AND po_date >= ? GROUP BY month`,
        [projectId, cutoffStr]
      ),
    ]);

    const byCategory = {
      payroll: Object.fromEntries(payroll.map((r) => [r.month, r.amt])),
      replenishments: Object.fromEntries(replenishments.map((r) => [r.month, r.amt])),
      po_payments: Object.fromEntries(poPayments.map((r) => [r.month, r.amt])),
      cash_advances: Object.fromEntries(cashAdvances.map((r) => [r.month, r.amt])),
      additional_payments: Object.fromEntries(additionalPayments.map((r) => [r.month, r.amt])),
    };
    const commitmentByMonth = Object.fromEntries(commitment.map((r) => [r.month, r.amt]));

    const trend = monthKeys.map((month) => {
      const row = { month };
      let total = new Decimal(0);
      for (const cat of TREND_CATEGORIES) {
        const amt = byCategory[cat][month] || '0.00';
        row[cat] = amt;
        total = total.plus(amt);
      }
      row.total = total.toFixed(2);
      row.commitment = commitmentByMonth[month] || '0.00';
      return row;
    });

    res.json(trend);
  } catch (err) {
    next(err);
  }
});

// Retention is never folded into an outstanding balance (CLAUDE.md) -- this
// is its own first-class total plus the per-PO breakdown, not just the one
// alert-feed sentence it used to be.
router.get('/:id/retention', async (req, res, next) => {
  try {
    const [pos] = await pool.query(
      `SELECT id, por_no, supplier, item_no, contract_amount_php, retention_pct,
              retention_amount, retention_released, retention_outstanding
       FROM v_po_retention WHERE project_id = ? ORDER BY retention_outstanding DESC`,
      [req.params.id]
    );
    const [[totals]] = await pool.query(
      `SELECT COALESCE(SUM(retention_amount), 0) AS total_held,
              COALESCE(SUM(retention_released), 0) AS total_released,
              COALESCE(SUM(retention_outstanding), 0) AS total_outstanding
       FROM v_po_retention WHERE project_id = ?`,
      [req.params.id]
    );
    res.json({ ...totals, pos });
  } catch (err) {
    next(err);
  }
});

// v_vat_component was built for BIR-style reporting but had no UI surface
// at all -- this aggregates it project-wide (per-item rounding, same as the
// view itself; summing already-rounded parts is the same convention used
// everywhere else in this app that totals per-budget-item figures).
router.get('/:id/vat-summary', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT COALESCE(SUM(gross_amount), 0) AS gross_amount,
              COALESCE(SUM(vat_component), 0) AS vat_component,
              COALESCE(SUM(net_of_vat), 0) AS net_of_vat
       FROM v_vat_component WHERE project_id = ?`,
      [req.params.id]
    );
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// Where the money is concentrated -- combines the three disbursement
// sources that actually carry a supplier_id (po_payments via purchase_orders,
// replenishments, additional_payments; cash_advances/payroll have no
// supplier). A row with no supplier_id can't be attributed to anyone, so
// it's excluded from the ranking rather than counted as a phantom supplier.
router.get('/:id/top-suppliers', async (req, res, next) => {
  const projectId = req.params.id;
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 10));
  try {
    const [[{ totalDisbursed }]] = await pool.query(
      'SELECT COALESCE(SUM(total_disbursed), 0) AS totalDisbursed FROM v_budget_vs_actual WHERE project_id = ?',
      [projectId]
    );
    const [rows] = await pool.query(
      `SELECT s.id, s.name,
              COALESCE(SUM(t.amount), 0) AS total_spend,
              CASE WHEN ? > 0 THEN ROUND(COALESCE(SUM(t.amount), 0) / ?, 4) END AS pct_of_total
       FROM suppliers s
       JOIN (
         SELECT po.supplier_id, pay.amount_php AS amount
           FROM po_payments pay
           JOIN purchase_orders po ON po.id = pay.purchase_order_id
          WHERE po.project_id = ? AND po.voided_at IS NULL AND pay.voided_at IS NULL
         UNION ALL
         SELECT supplier_id, amount
           FROM replenishments
          WHERE project_id = ? AND supplier_id IS NOT NULL AND needs_review = 0 AND voided_at IS NULL
         UNION ALL
         SELECT supplier_id, amount_php
           FROM additional_payments
          WHERE project_id = ? AND supplier_id IS NOT NULL AND needs_review = 0 AND voided_at IS NULL
       ) t ON t.supplier_id = s.id
       GROUP BY s.id, s.name
       ORDER BY total_spend DESC
       LIMIT ?`,
      [totalDisbursed, totalDisbursed, projectId, projectId, projectId, limit]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// v_weekly_burn (schema) sources from weekly_budget_additions, which
// CLAUDE.md flags as having a source defect (four blocks all mislabeled the
// same week) -- "derive weekly figures from the fact tables instead." This
// rebuilds weekly totals the same way cost-trend rebuilds monthly ones, at
// weekly grain, Monday-anchored to match the payroll cycle.
router.get('/:id/weekly-burn', async (req, res, next) => {
  const projectId = req.params.id;
  const weeks = Math.min(52, Math.max(1, Number(req.query.weeks) || 12));

  try {
    const [[{ maxDate }]] = await pool.query(
      `SELECT MAX(d) AS maxDate FROM (
         SELECT MAX(period_end) AS d FROM payroll_periods WHERE project_id = ?
         UNION ALL
         SELECT MAX(txn_date) FROM replenishments WHERE project_id = ? AND voided_at IS NULL
         UNION ALL
         SELECT MAX(pay.paid_on) FROM po_payments pay
           JOIN purchase_orders po ON po.id = pay.purchase_order_id
           WHERE po.project_id = ? AND po.voided_at IS NULL AND pay.voided_at IS NULL
         UNION ALL
         SELECT MAX(txn_date) FROM cash_advances WHERE project_id = ? AND voided_at IS NULL
         UNION ALL
         SELECT MAX(txn_date) FROM additional_payments WHERE project_id = ? AND voided_at IS NULL
       ) t`,
      [projectId, projectId, projectId, projectId, projectId]
    );

    if (!maxDate) return res.json([]);

    // Anchor on the Monday of the latest activity's week, then walk back
    // `weeks` Mondays -- weeks run Monday-Sunday project-wide (CLAUDE.md),
    // matching payroll_periods.period_start exactly so payroll needs no
    // day-of-week correction below.
    const anchor = new Date(`${maxDate}T00:00:00Z`);
    const anchorMonday = new Date(anchor);
    anchorMonday.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
    const cutoff = new Date(anchorMonday);
    cutoff.setUTCDate(anchorMonday.getUTCDate() - (weeks - 1) * 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const weekKeys = [];
    for (let i = 0; i < weeks; i++) {
      const d = new Date(cutoff);
      d.setUTCDate(cutoff.getUTCDate() + i * 7);
      weekKeys.push(d.toISOString().slice(0, 10));
    }

    const [rows] = await pool.query(
      `SELECT week_start, SUM(amt) AS total FROM (
         SELECT pp.period_start AS week_start, pe.amount AS amt
           FROM payroll_entries pe JOIN payroll_periods pp ON pp.id = pe.payroll_period_id
          WHERE pe.project_id = ? AND pe.voided_at IS NULL AND pp.period_start >= ?
         UNION ALL
         SELECT DATE_SUB(txn_date, INTERVAL WEEKDAY(txn_date) DAY) AS week_start, amount AS amt
           FROM replenishments
          WHERE project_id = ? AND needs_review = 0 AND voided_at IS NULL AND txn_date >= ?
         UNION ALL
         SELECT DATE_SUB(pay.paid_on, INTERVAL WEEKDAY(pay.paid_on) DAY) AS week_start, pay.amount_php AS amt
           FROM po_payments pay JOIN purchase_orders po ON po.id = pay.purchase_order_id
          WHERE po.project_id = ? AND po.voided_at IS NULL AND pay.voided_at IS NULL AND pay.paid_on >= ?
         UNION ALL
         SELECT DATE_SUB(txn_date, INTERVAL WEEKDAY(txn_date) DAY) AS week_start, amount AS amt
           FROM cash_advances
          WHERE project_id = ? AND voided_at IS NULL AND txn_date >= ?
         UNION ALL
         SELECT DATE_SUB(txn_date, INTERVAL WEEKDAY(txn_date) DAY) AS week_start, amount_php AS amt
           FROM additional_payments
          WHERE project_id = ? AND needs_review = 0 AND voided_at IS NULL AND txn_date >= ?
       ) t
       GROUP BY week_start`,
      [projectId, cutoffStr, projectId, cutoffStr, projectId, cutoffStr, projectId, cutoffStr, projectId, cutoffStr]
    );

    const byWeek = Object.fromEntries(rows.map((r) => [r.week_start, r.total]));
    res.json(weekKeys.map((week_start) => ({ week_start, total: byWeek[week_start] || '0.00' })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
