import { useMemo } from 'react';
import { BudgetItemBreakdown } from './BudgetItemBreakdown';
import { budgetItemKeyAndLabel, groupByBudgetItem, type BudgetItemGroup } from '../lib/budgetItemGrouping';
import type { PayrollEntry } from '../types';

function buildGroups(entries: PayrollEntry[]): BudgetItemGroup[] {
  return groupByBudgetItem(
    entries.map((e) => {
      const { key, label } = budgetItemKeyAndLabel(e.budget_item_id, e.budget_item_no, e.budget_item_description);
      return {
        budgetItemKey: key,
        budgetItemLabel: label,
        codeLabel: e.planning_line_code ?? 'No JPL code',
        amount: e.amount,
      };
    }),
  );
}

export function PayrollBudgetBreakdown({ entries }: { entries: PayrollEntry[] }) {
  const groups = useMemo(() => buildGroups(entries), [entries]);
  return <BudgetItemBreakdown groups={groups} />;
}
