import { useState } from 'react';
import { useUpdatePayrollEntry } from '../hooks/usePayroll';
import type { PayrollEntry } from '../types';

// The common weekly action (typing ~130 amounts for a copied-forward
// roster) shouldn't need a modal open/close per worker -- this cell is
// always an editable input in place, no separate "click to edit" step.
export function InlineAmountCell({ entry, periodId }: { entry: PayrollEntry; periodId: number }) {
  const updateEntry = useUpdatePayrollEntry(periodId);
  const [value, setValue] = useState(entry.amount);

  function commit() {
    if (value !== entry.amount) {
      updateEntry.mutate({ entryId: entry.id, amount: value || '0' });
    }
  }

  return (
    <input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className="w-28 rounded-sm border border-transparent bg-transparent px-2 py-1 text-right font-mono text-sm text-ink outline-none hover:border-rule-strong focus:border-accent focus:bg-surface"
    />
  );
}
