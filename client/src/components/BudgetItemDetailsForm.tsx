import { useState } from 'react';
import { useUpdateBudgetItem } from '../hooks/useBudgetItemDetail';
import { useEnumValues } from '../hooks/useEnumValues';

export function BudgetItemDetailsForm({
  budgetItemId,
  procurementMode,
  remarks,
}: {
  budgetItemId: number;
  procurementMode: string;
  remarks: string | null;
}) {
  const mutation = useUpdateBudgetItem(budgetItemId);
  const { data: modes } = useEnumValues('budget_items', 'procurement_mode');

  const [mode, setMode] = useState(procurementMode);
  const [remarksText, setRemarksText] = useState(remarks ?? '');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await mutation.mutateAsync({ procurement_mode: mode, remarks: remarksText || null });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-rule pt-4">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Procurement details</span>

      {mutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {mutation.error.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr_auto]">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          {(modes?.values ?? [procurementMode]).map((value) => (
            <option key={value} value={value}>
              {value.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Remarks"
          value={remarksText}
          onChange={(e) => setRemarksText(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
