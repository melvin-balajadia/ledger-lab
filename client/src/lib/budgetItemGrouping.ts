import Decimal from 'decimal.js';

export interface BudgetItemGroup {
  key: string;
  label: string;
  total: string;
  codes: { code: string; total: string }[];
}

interface NormalizedRow {
  budgetItemKey: string;
  budgetItemLabel: string;
  codeLabel: string;
  amount: string;
}

// budget_item_id resolves to real labels (item_no + description); JPL/
// planning-line descriptions are all blank in the source (see CLAUDE.md), so
// codes are shown by their raw code only.
export function budgetItemKeyAndLabel(
  budgetItemId: number | null,
  itemNo: string | null,
  description: string | null,
): { key: string; label: string } {
  if (budgetItemId == null) return { key: 'unassigned', label: 'Unassigned' };
  const label = `${itemNo ?? ''} ${description ?? ''}`.trim() || `Budget item ${budgetItemId}`;
  return { key: String(budgetItemId), label };
}

// Shared by PayrollBudgetBreakdown (groups raw entries client-side, for a
// single already-small dataset) and the paginated ledger pages (group a
// server-side aggregate instead, since only one page of rows is ever held
// client-side there) -- both normalize to this shape first, then share this
// one aggregation+sort+format step.
export function groupByBudgetItem(rows: NormalizedRow[]): BudgetItemGroup[] {
  const byItem = new Map<string, { label: string; total: Decimal; codes: Map<string, Decimal> }>();

  for (const r of rows) {
    let group = byItem.get(r.budgetItemKey);
    if (!group) {
      group = { label: r.budgetItemLabel, total: new Decimal(0), codes: new Map() };
      byItem.set(r.budgetItemKey, group);
    }
    const amount = new Decimal(r.amount);
    group.total = group.total.plus(amount);
    group.codes.set(r.codeLabel, (group.codes.get(r.codeLabel) ?? new Decimal(0)).plus(amount));
  }

  return [...byItem.entries()]
    .map(([key, g]) => ({
      key,
      label: g.label,
      total: g.total,
      codes: [...g.codes.entries()]
        .map(([code, total]) => ({ code, total }))
        .sort((a, b) => b.total.cmp(a.total)),
    }))
    .sort((a, b) => b.total.cmp(a.total))
    .map((g) => ({
      key: g.key,
      label: g.label,
      total: g.total.toFixed(2),
      codes: g.codes.map((c) => ({ code: c.code, total: c.total.toFixed(2) })),
    }));
}
