const express = require('express');
const Decimal = require('decimal.js');
const pool = require('../db');

const router = express.Router();

// Same two constants as every ledger's entry-form validation (replenishments.js,
// cashAdvances.js, additionalPayments.js, purchaseOrders.js, budgetItems.js) --
// duplicated here rather than shared, matching how each of those already
// keeps its own copy instead of importing one.
const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';

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
    if (replenReview > 0) alerts.push({ severity: 'warn', message: `${replenReview} replenishment${replenReview === 1 ? '' : 's'} need review`, date: null, href: '/replenishments' });
    if (addlReview > 0) alerts.push({ severity: 'warn', message: `${addlReview} additional payment${addlReview === 1 ? '' : 's'} need review`, date: null, href: '/additional-payments' });
    if (caReview > 0) alerts.push({ severity: 'warn', message: `${caReview} cash advance${caReview === 1 ? '' : 's'} need review`, date: null, href: '/cash-advances' });
    if (payrollNoJpl > 0) alerts.push({ severity: 'warn', message: `${payrollNoJpl} payroll entries have no JPL code (worker left)`, date: null, href: '/payroll' });

    // 4. Rows with no budget item -- these don't fail any validation, they
    // just silently drop out of every by-budget-item total (Committed, in
    // the PO's case) with nothing else to flag them. Purchase orders is
    // 'danger' rather than 'warn': that's the one CLAUDE.md documents as a
    // real financial-reporting gap (see the 2026-09-07 migration runbook and
    // POR18380), the rest are lower-stakes miscoding.
    const [[{ n: replenUnassigned }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM replenishments WHERE project_id = ? AND budget_item_id IS NULL AND voided_at IS NULL',
      [projectId]
    );
    const [[{ n: caUnassigned }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM cash_advances WHERE project_id = ? AND budget_item_id IS NULL AND voided_at IS NULL',
      [projectId]
    );
    const [[{ n: addlUnassigned }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM additional_payments WHERE project_id = ? AND budget_item_id IS NULL AND voided_at IS NULL',
      [projectId]
    );
    const [[{ n: poUnassigned }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM purchase_orders WHERE project_id = ? AND budget_item_id IS NULL AND voided_at IS NULL',
      [projectId]
    );
    if (replenUnassigned > 0) alerts.push({ severity: 'warn', message: `${replenUnassigned} replenishment${replenUnassigned === 1 ? '' : 's'} with no budget item`, date: null, href: '/replenishments' });
    if (caUnassigned > 0) alerts.push({ severity: 'warn', message: `${caUnassigned} cash advance${caUnassigned === 1 ? '' : 's'} with no budget item`, date: null, href: '/cash-advances' });
    if (addlUnassigned > 0) alerts.push({ severity: 'warn', message: `${addlUnassigned} additional payment${addlUnassigned === 1 ? '' : 's'} with no budget item`, date: null, href: '/additional-payments' });
    if (poUnassigned > 0) alerts.push({ severity: 'danger', message: `${poUnassigned} purchase order${poUnassigned === 1 ? '' : 's'} with no budget item — dropping out of Committed`, date: null, href: '/purchase-orders' });

    // 5. Overpaid POs -- paid exceeding contract is always an anomaly (see
    // the overpaid-PO data-quality finding), never a healthy state, so each
    // one is listed individually rather than folded into a single count --
    // there are normally very few of these, and which PO it is matters.
    const [overpaid] = await pool.query(
      `SELECT por_no, contract_amount_php, paid_php FROM v_po_balance
       WHERE project_id = ? AND contract_amount_php > 0 AND paid_php > contract_amount_php`,
      [projectId]
    );
    for (const row of overpaid) {
      const over = new Decimal(row.paid_php).minus(row.contract_amount_php);
      alerts.push({
        severity: 'danger',
        message: `${row.por_no} is paid ${formatPeso(over)} over its ${formatPeso(row.contract_amount_php)} contract`,
        date: null,
        href: '/purchase-orders',
      });
    }

    // 6. Payroll periods whose worker-list total doesn't match the weekly
    // sheet -- same reconciliation_status the Payroll page itself computes
    // (server/routes/payroll.js's PERIODS_DERIVED_SQL), duplicated here as a
    // single COUNT rather than imported, since that query is a multi-line
    // CTE-shaped string built for pagination, not reuse.
    const [[{ n: payrollAttention }]] = await pool.query(
      `SELECT COUNT(*) AS n FROM (
         SELECT pp.id,
                CASE
                  WHEN COUNT(pe.id) = 0 AND pp.total_amount > 0 THEN 'no_entries'
                  WHEN pp.total_amount = 0 AND COUNT(pe.id) > 0 THEN 'no_control'
                  WHEN ABS(pp.total_amount - COALESCE(SUM(pe.amount), 0)) > 0.01 THEN 'review'
                  ELSE 'ok'
                END AS reconciliation_status
         FROM payroll_periods pp
         LEFT JOIN payroll_entries pe ON pe.payroll_period_id = pp.id AND pe.voided_at IS NULL
         WHERE pp.project_id = ?
         GROUP BY pp.id, pp.total_amount
       ) t WHERE reconciliation_status != 'ok'`,
      [projectId]
    );
    if (payrollAttention > 0) {
      alerts.push({
        severity: 'warn',
        message: `${payrollAttention} payroll period${payrollAttention === 1 ? '' : 's'} need attention — weekly sheet and worker list don't match`,
        date: null,
        href: '/payroll',
      });
    }

    // 8. FX rate outliers -- the exact trap that cost real money once
    // already (item 10.0, db/migrations/022_pallets_po_usd_fx.sql): a
    // foreign-currency row entered at fx_rate = 1.0 reads as if the native
    // amount were pesos, understating the PHP figure by the true rate. This
    // catches the mechanically-detectable half of that bug -- a row honestly
    // tagged non-PHP but left at the 1.0 default. It can't catch the other
    // half (a foreign PO mistakenly tagged currency='PHP' outright, as item
    // 10.0 originally was) -- that one has no signal to query for and needs
    // a human to notice the amount doesn't look like pesos.
    const [[{ n: poFxOutliers }]] = await pool.query(
      "SELECT COUNT(*) AS n FROM purchase_orders WHERE project_id = ? AND currency != 'PHP' AND fx_rate = 1 AND voided_at IS NULL",
      [projectId]
    );
    const [[{ n: paymentFxOutliers }]] = await pool.query(
      `SELECT COUNT(*) AS n FROM po_payments pp JOIN purchase_orders po ON po.id = pp.purchase_order_id
       WHERE po.project_id = ? AND pp.currency != 'PHP' AND pp.fx_rate = 1 AND pp.voided_at IS NULL`,
      [projectId]
    );
    const [[{ n: addlFxOutliers }]] = await pool.query(
      "SELECT COUNT(*) AS n FROM additional_payments WHERE project_id = ? AND currency != 'PHP' AND fx_rate = 1 AND voided_at IS NULL",
      [projectId]
    );
    if (poFxOutliers > 0) alerts.push({ severity: 'danger', message: `${poFxOutliers} purchase order${poFxOutliers === 1 ? '' : 's'} in foreign currency at a 1.0 rate — check the rate is real`, date: null, href: '/purchase-orders' });
    if (paymentFxOutliers > 0) alerts.push({ severity: 'danger', message: `${paymentFxOutliers} PO payment${paymentFxOutliers === 1 ? '' : 's'} in foreign currency at a 1.0 rate — check the rate is real`, date: null, href: '/purchase-orders' });
    if (addlFxOutliers > 0) alerts.push({ severity: 'danger', message: `${addlFxOutliers} additional payment${addlFxOutliers === 1 ? '' : 's'} in foreign currency at a 1.0 rate — check the rate is real`, date: null, href: '/additional-payments' });

    // 9. Transactions dated outside the project window -- CLAUDE.md documents
    // real source rows dated 1900, 1958, 2005 and 2015 from hand-typed entry.
    // Entry forms validate this going forward; this catches anything already
    // in the data, from before that validation existed or entered directly.
    const [[{ n: poDateOutliers }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM purchase_orders WHERE project_id = ? AND voided_at IS NULL AND po_date IS NOT NULL AND (po_date < ? OR po_date > ?)',
      [projectId, PROJECT_DATE_MIN, PROJECT_DATE_MAX]
    );
    const [[{ n: paymentDateOutliers }]] = await pool.query(
      `SELECT COUNT(*) AS n FROM po_payments pp JOIN purchase_orders po ON po.id = pp.purchase_order_id
       WHERE po.project_id = ? AND pp.voided_at IS NULL AND pp.paid_on IS NOT NULL AND (pp.paid_on < ? OR pp.paid_on > ?)`,
      [projectId, PROJECT_DATE_MIN, PROJECT_DATE_MAX]
    );
    const [[{ n: replenDateOutliers }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM replenishments WHERE project_id = ? AND voided_at IS NULL AND txn_date IS NOT NULL AND (txn_date < ? OR txn_date > ?)',
      [projectId, PROJECT_DATE_MIN, PROJECT_DATE_MAX]
    );
    const [[{ n: caDateOutliers }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM cash_advances WHERE project_id = ? AND voided_at IS NULL AND txn_date IS NOT NULL AND (txn_date < ? OR txn_date > ?)',
      [projectId, PROJECT_DATE_MIN, PROJECT_DATE_MAX]
    );
    const [[{ n: addlDateOutliers }]] = await pool.query(
      'SELECT COUNT(*) AS n FROM additional_payments WHERE project_id = ? AND voided_at IS NULL AND txn_date IS NOT NULL AND (txn_date < ? OR txn_date > ?)',
      [projectId, PROJECT_DATE_MIN, PROJECT_DATE_MAX]
    );
    if (poDateOutliers > 0) alerts.push({ severity: 'danger', message: `${poDateOutliers} purchase order${poDateOutliers === 1 ? '' : 's'} dated outside the project window`, date: null, href: '/purchase-orders' });
    if (paymentDateOutliers > 0) alerts.push({ severity: 'danger', message: `${paymentDateOutliers} PO payment${paymentDateOutliers === 1 ? '' : 's'} dated outside the project window`, date: null, href: '/purchase-orders' });
    if (replenDateOutliers > 0) alerts.push({ severity: 'danger', message: `${replenDateOutliers} replenishment${replenDateOutliers === 1 ? '' : 's'} dated outside the project window`, date: null, href: '/replenishments' });
    if (caDateOutliers > 0) alerts.push({ severity: 'danger', message: `${caDateOutliers} cash advance${caDateOutliers === 1 ? '' : 's'} dated outside the project window`, date: null, href: '/cash-advances' });
    if (addlDateOutliers > 0) alerts.push({ severity: 'danger', message: `${addlDateOutliers} additional payment${addlDateOutliers === 1 ? '' : 's'} dated outside the project window`, date: null, href: '/additional-payments' });

    // 10. Duplicate PO numbers -- CLAUDE.md requires duplicate detection on
    // por_no at entry time; this catches one already in the data (entered
    // before that check existed, or two POs a step apart in time that both
    // slipped through).
    const [duplicatePorNos] = await pool.query(
      `SELECT por_no, COUNT(*) AS n FROM purchase_orders
       WHERE project_id = ? AND voided_at IS NULL AND por_no IS NOT NULL AND por_no != ''
       GROUP BY por_no HAVING COUNT(*) > 1`,
      [projectId]
    );
    for (const row of duplicatePorNos) {
      alerts.push({
        severity: 'danger',
        message: `PO number ${row.por_no} is used on ${row.n} purchase orders`,
        date: null,
        href: '/purchase-orders',
      });
    }

    // 11. Most recently completed payroll period.
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
