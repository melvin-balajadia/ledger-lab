const pool = require('../db');

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';

// Every row-level data problem, in one place: the Needs-review screen
// (routes/review.js) lists these rows, and the Overview's alert counts them
// (routes/alerts.js) -- one set of checks, so the two can never disagree.
//
// Every source selects the same columns so one row shape covers them all.
// `parent_id` is what the client opens to fix it: the PO for a PO payment,
// the payroll week for a payroll entry. `flagged` is the needs_review flag,
// the only reason a row can be cleared without changing it.
const COLUMNS = ['id', 'date', 'reference', 'party', 'description', 'amount', 'parent_id', 'flagged'];
const SOURCES = {
  replenishment: {
    from: 'replenishments r LEFT JOIN suppliers s ON s.id = r.supplier_id',
    cols: ['r.id', 'r.txn_date', 'r.ref_no', 's.name', 'r.item_description', 'r.amount', 'NULL', 'r.needs_review'],
    scope: 'r.project_id = ? AND r.voided_at IS NULL',
  },
  cash_advance: {
    from: 'cash_advances c',
    cols: ['c.id', 'c.txn_date', 'c.control_no', 'c.requested_by', 'c.purpose', 'c.amount', 'NULL', 'c.needs_review'],
    scope: 'c.project_id = ? AND c.voided_at IS NULL',
  },
  additional_payment: {
    from: 'additional_payments a',
    cols: ['a.id', 'a.txn_date', 'a.voucher_no', 'a.payee', 'a.description', 'a.amount_php', 'NULL', 'a.needs_review'],
    scope: 'a.project_id = ? AND a.voided_at IS NULL',
  },
  purchase_order: {
    from: 'purchase_orders po JOIN suppliers s ON s.id = po.supplier_id',
    cols: ['po.id', 'po.po_date', 'po.por_no', 's.name', 'po.item_description', 'po.contract_amount_php', 'po.id', '0'],
    scope: 'po.project_id = ? AND po.voided_at IS NULL',
  },
  po_payment: {
    from: `po_payments pp JOIN purchase_orders po ON po.id = pp.purchase_order_id
           JOIN suppliers s ON s.id = po.supplier_id`,
    cols: ['pp.id', 'pp.paid_on', 'po.por_no', 's.name', "CONCAT('Payment ', COALESCE(pp.voucher_no, ''))",
           'pp.amount_php', 'po.id', '0'],
    scope: 'po.project_id = ? AND pp.voided_at IS NULL AND po.voided_at IS NULL',
  },
  payroll_entry: {
    from: `payroll_entries pe JOIN payroll_periods per ON per.id = pe.payroll_period_id
           LEFT JOIN workers w ON w.id = pe.worker_id`,
    cols: ['pe.id', 'per.period_start', 'per.label', 'w.full_name', "'Payroll entry'", 'pe.amount', 'per.id', '0'],
    scope: 'pe.project_id = ? AND pe.voided_at IS NULL',
  },
  payroll_period: {
    from: 'payroll_periods pp',
    cols: ['pp.id', 'pp.period_start', 'pp.label', 'NULL', "'Weekly payroll'", 'pp.total_amount', 'pp.id', '0'],
    scope: 'pp.project_id = ?',
  },
};

const outsideWindow = (col) => ({ cond: `${col} IS NOT NULL AND (${col} < ? OR ${col} > ?)`, params: [PROJECT_DATE_MIN, PROJECT_DATE_MAX] });

// [source, severity, reason, condition] -- severities match alerts.js.
const CHECKS = [
  ['replenishment', 'warn', 'Flagged for review', { cond: 'r.needs_review = 1' }],
  ['cash_advance', 'warn', 'Flagged for review', { cond: 'c.needs_review = 1' }],
  ['additional_payment', 'warn', 'Flagged for review', { cond: 'a.needs_review = 1' }],
  ['replenishment', 'warn', 'No budget item', { cond: 'r.budget_item_id IS NULL' }],
  ['cash_advance', 'warn', 'No budget item', { cond: 'c.budget_item_id IS NULL' }],
  ['additional_payment', 'warn', 'No budget item', { cond: 'a.budget_item_id IS NULL' }],
  ['purchase_order', 'danger', 'No budget item — not counted in Committed', { cond: 'po.budget_item_id IS NULL' }],
  ['purchase_order', 'danger', 'Paid more than its contract', {
    cond: `po.id IN (SELECT id FROM v_po_balance WHERE contract_amount_php > 0 AND paid_php > contract_amount_php)`,
  }],
  ['purchase_order', 'danger', 'PO number used more than once', {
    cond: `po.por_no IN (SELECT por_no FROM (SELECT por_no FROM purchase_orders
             WHERE project_id = ? AND voided_at IS NULL AND por_no IS NOT NULL AND por_no != ''
             GROUP BY por_no HAVING COUNT(*) > 1) d)`,
    projectParam: true,
  }],
  ['purchase_order', 'danger', 'Foreign currency at a 1.0 rate', { cond: "po.currency != 'PHP' AND po.fx_rate = 1" }],
  ['po_payment', 'danger', 'Foreign currency at a 1.0 rate', { cond: "pp.currency != 'PHP' AND pp.fx_rate = 1" }],
  ['additional_payment', 'danger', 'Foreign currency at a 1.0 rate', { cond: "a.currency != 'PHP' AND a.fx_rate = 1" }],
  ['purchase_order', 'danger', 'Dated outside 2025–2027', outsideWindow('po.po_date')],
  ['po_payment', 'danger', 'Dated outside 2025–2027', outsideWindow('pp.paid_on')],
  ['replenishment', 'danger', 'Dated outside 2025–2027', outsideWindow('r.txn_date')],
  ['cash_advance', 'danger', 'Dated outside 2025–2027', outsideWindow('c.txn_date')],
  ['additional_payment', 'danger', 'Dated outside 2025–2027', outsideWindow('a.txn_date')],
  ['payroll_entry', 'warn', 'No JPL code (worker left)', { cond: 'pe.planning_line_id IS NULL' }],
  ['payroll_period', 'warn', "Weekly sheet and worker list don't match", {
    cond: `pp.id IN (SELECT id FROM (
             SELECT p.id,
                    CASE
                      WHEN COUNT(pe.id) = 0 AND p.total_amount > 0 THEN 'no_entries'
                      WHEN p.total_amount = 0 AND COUNT(pe.id) > 0 THEN 'no_control'
                      WHEN ABS(p.total_amount - COALESCE(SUM(pe.amount), 0)) > 0.01 THEN 'review'
                      ELSE 'ok'
                    END AS reconciliation_status
             FROM payroll_periods p
             LEFT JOIN payroll_entries pe ON pe.payroll_period_id = p.id AND pe.voided_at IS NULL
             WHERE p.project_id = ?
             GROUP BY p.id, p.total_amount
           ) t WHERE reconciliation_status != 'ok')`,
    projectParam: true,
  }],
];

const SEVERITY_RANK = { danger: 0, warn: 1 };

// One row per record, carrying every reason it's listed for -- fixing the
// record is one action however many checks it failed. Most urgent first,
// newest first within that.
async function collectReviewItems(projectId) {
  const items = new Map();
  for (const [source, severity, reason, { cond, params = [], projectParam }] of CHECKS) {
    const { from, cols, scope } = SOURCES[source];
    const select = cols.map((expr, i) => `${expr} AS ${COLUMNS[i]}`).join(', ');
    const [rows] = await pool.query(
      `SELECT ${select} FROM ${from} WHERE ${scope} AND ${cond}`,
      [projectId, ...(projectParam ? [projectId] : []), ...params]
    );
    for (const row of rows) {
      const key = `${source}:${row.id}`;
      const item = items.get(key);
      if (item) {
        item.reasons.push(reason);
        if (SEVERITY_RANK[severity] < SEVERITY_RANK[item.severity]) item.severity = severity;
      } else {
        items.set(key, { key, source, ...row, flagged: row.flagged === 1, severity, reasons: [reason] });
      }
    }
  }
  return [...items.values()].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || String(b.date ?? '').localeCompare(String(a.date ?? ''))
  );
}

module.exports = { collectReviewItems };
