const express = require('express');
const Decimal = require('decimal.js');
const pool = require('../db');
const { collectReviewItems } = require('../lib/reviewItems');

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
      `SELECT budget_item_id, item_no, description, budget, contract_amount
       FROM v_budget_vs_actual WHERE project_id = ? AND is_over_budget = 1`,
      [projectId]
    );
    for (const row of overBudget) {
      const budget = new Decimal(row.budget);
      const committed = new Decimal(row.contract_amount);
      const over = committed.minus(budget);
      const href = `/budget-items/${row.budget_item_id}`;

      // No approved budget line at all -- "over its 0.00 budget (+0%)" is
      // nonsense; the real issue is unbudgeted commitment.
      if (budget.lte(0)) {
        alerts.push({
          severity: 'warn',
          message: `${row.description} has ${formatPeso(committed)} committed but no approved budget`,
          date: null,
          href,
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
        href,
      });
    }

    // 2. Most recent budget revisions. Ordered by when they were recorded,
    //    but dated by effective_on -- that's the accounting-meaningful date,
    //    and it's a DATE, which is what the client's formatter expects (a
    //    TIMESTAMP here renders as "Invalid Date").
    const [revisions] = await pool.query(
      `SELECT br.budget_item_id, br.effective_on, br.amount_before, br.amount_after, bi.description
       FROM budget_revisions br JOIN budget_items bi ON bi.id = br.budget_item_id
       WHERE br.project_id = ? ORDER BY br.created_at DESC LIMIT 5`,
      [projectId]
    );
    for (const row of revisions) {
      alerts.push({
        severity: 'info',
        message: `${row.description} budget revised: ${formatPeso(row.amount_before)} → ${formatPeso(row.amount_after)}`,
        date: row.effective_on,
        href: `/budget-items/${row.budget_item_id}`,
      });
    }

    // 3. Every row-level problem (flags, missing budget items, bad dates, 1.0
    //    FX rates, overpaid POs, duplicate PO numbers, payroll gaps) as one
    //    line pointing at the Needs-review screen, which lists the rows. The
    //    count comes from the same checks that screen uses, so they agree.
    const reviewItems = await collectReviewItems(projectId);
    if (reviewItems.length > 0) {
      const urgent = reviewItems.filter((i) => i.severity === 'danger').length;
      alerts.push({
        severity: urgent > 0 ? 'danger' : 'warn',
        message: `${reviewItems.length} row${reviewItems.length === 1 ? ' needs' : 's need'} review`
          + (urgent > 0 ? ` (${urgent} urgent)` : ''),
        date: null,
        href: '/review',
      });
    }

    // 4. Most recently completed payroll period.
    const [[latestPayroll]] = await pool.query(
      `SELECT id, label, period_end FROM payroll_periods WHERE project_id = ? AND status = 'paid' ORDER BY period_end DESC LIMIT 1`,
      [projectId]
    );
    if (latestPayroll) {
      alerts.push({
        severity: 'success',
        message: `Payroll for ${latestPayroll.label} completed and posted`,
        date: latestPayroll.period_end,
        href: `/payroll/${latestPayroll.id}`,
      });
    }

    // Most urgent first, regardless of which section above happened to push
    // it -- a stable sort so ties keep the order they were built in.
    const SEVERITY_RANK = { danger: 0, warn: 1, info: 2, success: 3 };
    alerts.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    res.json(alerts);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
