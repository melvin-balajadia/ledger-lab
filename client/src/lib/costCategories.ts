// The 5 disbursement categories, in one fixed order shared by every chart
// that shows them (trend, breakdown). Color follows the entity, never a
// per-chart rank -- so this lives in one place rather than being redeclared
// per component, where two copies could silently drift out of order.
// The --series-* vars are the dataviz skill's validated categorical order
// (see index.css) -- do not reorder without re-running validate_palette.js.
// `column` is the matching v_planning_line_spend field, so the JPL table's
// columns, its stacked mix bar and the charts all read the same category in
// the same order from this one list.
export const COST_CATEGORIES = [
  { key: 'payroll', label: 'Payroll', short: 'Payroll', column: 'labor_amount', color: 'var(--series-1)' },
  { key: 'replenishments', label: 'Replenishments', short: 'Replen.', column: 'replen_amount', color: 'var(--series-2)' },
  { key: 'po_payments', label: 'PO Payments', short: 'PO paid', column: 'po_paid_amount', color: 'var(--series-3)' },
  { key: 'cash_advances', label: 'Cash Advances', short: 'Cash adv.', column: 'cash_advance_amount', color: 'var(--series-4)' },
  { key: 'additional_payments', label: 'Additional Payments', short: "Add'l", column: 'additional_payment_amount', color: 'var(--series-5)' },
] as const;

export type CostCategoryKey = (typeof COST_CATEGORIES)[number]['key'];
