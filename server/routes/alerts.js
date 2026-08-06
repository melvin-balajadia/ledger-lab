const express = require('express');
const Decimal = require('decimal.js');
const pool = require('../db');

const router = express.Router();

router.get('/:id/alerts', async (req, res, next) => {
  const projectId = req.params.id;
  try {
    const alerts = [];

    // 1. Over-budget items -- commitment vs budget, per CLAUDE.md's is_over_budget rule.
    const [overBudget] = await pool.query(
      `SELECT item_no, description, budget, contract_amount
       FROM v_budget_vs_actual WHERE project_id = ? AND is_over_budget = 1`,
      [projectId]
    );
    for (const row of overBudget) {
      const budget = new Decimal(row.budget);
      const over = new Decimal(row.contract_amount).minus(budget);
      const pct = budget.gt(0) ? over.dividedBy(budget).times(100).toFixed(0) : '0';
      alerts.push({
        severity: 'danger',
        message: `${row.description} is running ₱${over.toFixed(2)} over its ₱${budget.toFixed(2)} budget (+${pct}%)`,
        date: null,
      });
    }

    // 2. Most recent budget revisions.
    const [revisions] = await pool.query(
      `SELECT br.effective_on, br.amount_before, br.amount_after, br.created_at, bi.description
       FROM budget_revisions br JOIN budget_items bi ON bi.id = br.budget_item_id
       WHERE br.project_id = ? ORDER BY br.created_at DESC LIMIT 5`,
      [projectId]
    );
    for (const row of revisions) {
      alerts.push({
        severity: 'info',
        message: `${row.description} budget revised: ₱${new Decimal(row.amount_before).toFixed(2)} → ₱${new Decimal(row.amount_after).toFixed(2)}`,
        date: row.created_at,
      });
    }

    // 3. needs_review counts across the fact tables (purchase_orders has no
    // needs_review column -- only free-text remarks -- so it's not included here).
    const [[{ n: replenReview }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM replenishments WHERE project_id = ? AND needs_review = 1 AND voided_at IS NULL',
      [projectId]
    );
    const [[{ n: addlReview }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM additional_payments WHERE project_id = ? AND needs_review = 1 AND voided_at IS NULL',
      [projectId]
    );
    const [[{ n: caReview }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM cash_advances WHERE project_id = ? AND needs_review = 1 AND voided_at IS NULL',
      [projectId]
    );
    const [[{ n: payrollNoJpl }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM payroll_entries WHERE project_id = ? AND planning_line_id IS NULL AND voided_at IS NULL',
      [projectId]
    );
    if (replenReview > 0) alerts.push({ severity: 'warn', message: `${replenReview} replenishment${replenReview === 1 ? '' : 's'} need review`, date: null });
    if (addlReview > 0) alerts.push({ severity: 'warn', message: `${addlReview} additional payment${addlReview === 1 ? '' : 's'} need review`, date: null });
    if (caReview > 0) alerts.push({ severity: 'warn', message: `${caReview} cash advance${caReview === 1 ? '' : 's'} need review`, date: null });
    if (payrollNoJpl > 0) alerts.push({ severity: 'info', message: `${payrollNoJpl} payroll entries have no JPL code (worker left)`, date: null });

    // 4. Most recently completed payroll period.
    const [[latestPayroll]] = await pool.query(
      `SELECT label, period_end FROM payroll_periods WHERE project_id = ? AND status = 'paid' ORDER BY period_end DESC LIMIT 1`,
      [projectId]
    );
    if (latestPayroll) {
      alerts.push({ severity: 'success', message: `Payroll for ${latestPayroll.label} completed and posted`, date: latestPayroll.period_end });
    }

    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
