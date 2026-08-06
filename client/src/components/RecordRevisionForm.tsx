import { useState } from 'react';
import { useRecordRevision } from '../hooks/useBudgetItemDetail';
import { formatMoney } from '../lib/formatMoney';

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';

export function RecordRevisionForm({ budgetItemId, currentBudget }: { budgetItemId: number; currentBudget: string }) {
  const mutation = useRecordRevision(budgetItemId);
  const [effectiveOn, setEffectiveOn] = useState('');
  const [amountAfter, setAmountAfter] = useState('');
  const [reason, setReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await mutation.mutateAsync({ effective_on: effectiveOn, amount_after: amountAfter, reason, approved_by: approvedBy });
    setEffectiveOn('');
    setAmountAfter('');
    setReason('');
    setApprovedBy('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-rule pt-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Log a revision</span>
        <span className="text-[13px] text-ink-faint">Current budget: {formatMoney(currentBudget)}</span>
      </div>

      {mutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {mutation.error.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_10rem_1fr_10rem_auto]">
        <input
          type="date"
          required
          min={PROJECT_DATE_MIN}
          max={PROJECT_DATE_MAX}
          value={effectiveOn}
          onChange={(e) => setEffectiveOn(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="New budget"
          value={amountAfter}
          onChange={(e) => setAmountAfter(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Approved by"
          value={approvedBy}
          onChange={(e) => setApprovedBy(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : 'Log revision'}
        </button>
      </div>
    </form>
  );
}
