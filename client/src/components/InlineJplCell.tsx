import { useState } from 'react';
import { useUpdatePayrollEntry } from '../hooks/usePayroll';
import { PlanningLinePicker } from './PlanningLinePicker';
import type { PayrollEntry, PlanningLine } from '../types';

// Same in-place-edit pattern as InlineAmountCell -- budget_item_id is
// derived server-side from whichever planning_line_id is sent (see
// resolveBudgetItemId in server/routes/payroll.js), so this only ever
// needs to send the new code; the two can never drift out of sync.
export function InlineJplCell({ entry, periodId }: { entry: PayrollEntry; periodId: number }) {
  const updateEntry = useUpdatePayrollEntry(periodId);
  const [value, setValue] = useState(entry.planning_line_id);

  function handleChange(line: PlanningLine | null) {
    const nextId = line?.id ?? null;
    setValue(nextId);
    if (nextId !== entry.planning_line_id) {
      updateEntry.mutate({ entryId: entry.id, planning_line_id: nextId });
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <PlanningLinePicker
        value={value}
        onChange={handleChange}
        className="w-40 rounded-sm border border-transparent bg-transparent py-1 pl-2 text-sm text-ink outline-none hover:border-rule-strong focus:border-accent focus:bg-surface"
      />
    </div>
  );
}
