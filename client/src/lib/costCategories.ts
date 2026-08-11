// The 5 disbursement categories, in one fixed order shared by every chart
// that shows them (trend, breakdown). Color follows the entity, never a
// per-chart rank -- so this lives in one place rather than being redeclared
// per component, where two copies could silently drift out of order.
// The --series-* vars are the dataviz skill's validated categorical order
// (see index.css) -- do not reorder without re-running validate_palette.js.
export const COST_CATEGORIES = [
  { key: 'payroll', label: 'Payroll', color: 'var(--series-1)' },
  { key: 'replenishments', label: 'Replenishments', color: 'var(--series-2)' },
  { key: 'po_payments', label: 'PO Payments', color: 'var(--series-3)' },
  { key: 'cash_advances', label: 'Cash Advances', color: 'var(--series-4)' },
  { key: 'additional_payments', label: 'Additional Payments', color: 'var(--series-5)' },
] as const;

export type CostCategoryKey = (typeof COST_CATEGORIES)[number]['key'];
