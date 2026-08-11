const express = require('express');
const Decimal = require('decimal.js');
const pool = require('../db');

const router = express.Router();

// Matches the client's formatMoney (lib/formatMoney.ts) exactly, so amounts
// baked into alert strings read the same as every other peso figure in the
// app. Number() is safe here: these are single already-computed values being
// formatted for display, never operands -- all arithmetic stays in Decimal.
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
function formatPeso(value) {
  return peso.format(Number(value));
}

// An overage is immaterial only when it is small in BOTH absolute and relative
// terms. Either test alone gives the wrong answer at this project's scale:
// 0.4% of a 1.3B budget is ~5M (material), and a 999 overage on a 5,000
// budget is 20% (material). Immaterial overages are downgraded, never hidden
// -- CLAUDE.md is explicit that flagged data is surfaced, not silently
// dropped; the point is only to stop rounding noise sitting in red next to a
// 13M overrun.
const IMMATERIAL_PESO_FLOOR = new Decimal(1000);
const IMMATERIAL_PCT = new Decimal('0.5');

// A material overage can still be a fraction of a percent on a large budget,
// where toFixed(0) would render a misleading "0%" -- and a trivial one can be
// small enough that even 2 decimals round to "0.00%", which reads as zero
// rather than "very nearly zero".
function formatPct(pct) {
  if (pct.gte(1)) return pct.toFixed(0);
  if (pct.lt('0.01')) return '<0.01';
  return pct.toFixed(2);
}

router.get('/:id/alerts', async (req, res, next) => {
  const projectId = req.params.id;
  try {
    const alerts = [];

    // 1. Over-budget items -- commitment vs budget, per CLAUDE.md's
    //    is_over_budget rule. Note v_budget_vs_actual sets that flag whenever
    //    contract_amount > revised_budget, which includes items with no
    //    budget at all -- those are a different finding and worded separately.
    const [overBudget] = await pool.query(
      `SELECT item_no, description, budget, contract_amount
       FROM v_budget_vs_actual WHERE project_id = ? AND is_over_budget = 1`,
      [projectId]
    );
    for (const row of overBudget) {
      const budget = new Decimal(row.budget);
      const committed = new Decimal(row.contract_amount);
      const over = committed.minus(budget);

      // No approved budget line at all -- "over its 0.00 budget (+0%)" is
      // nonsense; the real issue is unbudgeted commitment.
      if (budget.lte(0)) {
        alerts.push({
          severity: 'warn',
          message: `${row.description} has ${formatPeso(committed)} committed but no approved budget`,
          date: null,
        });
        continue;
      }

      const pct = over.dividedBy(budget).times(100);
      const immaterial = over.lt(IMMATERIAL_PESO_FLOOR) && pct.lt(IMMATERIAL_PCT);
      alerts.push({
        severity: immaterial ? 'info' : 'danger',
        message: immaterial
          ? `${row.description} is ${formatPeso(over)} over its ${formatPeso(budget)} budget — immaterial (${formatPct(pct)}%)`
          : `${row.description} is running ${formatPeso(over)} over its ${formatPeso(budget)} budget (+${formatPct(pct)}%)`,
        date: null,
      });
    }

    // 2. Most recent budget revisions. Ordered by when they were recorded,
    //    but dated by effective_on -- that's the accounting-meaningful date,
    //    and it's a DATE, which is what the client's formatter expects (a
    //    TIMESTAMP here renders as "Invalid Date").
    const [revisions] = await pool.query(
      `SELECT br.effective_on, br.amount_before, br.amount_after, bi.description
       FROM budget_revisions br JOIN budget_items bi ON bi.id = br.budget_item_id
       WHERE br.project_id = ? ORDER BY br.created_at DESC LIMIT 5`,
      [projectId]
    );
    for (const row of revisions) {
      alerts.push({
        severity: 'info',
        message: `${row.description} budget revised: ${formatPeso(row.amount_before)} → ${formatPeso(row.amount_after)}`,
        date: row.effective_on,
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
