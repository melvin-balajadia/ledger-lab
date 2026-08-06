import { useEffect, useState } from 'react';
import { useCreatePayrollPeriod, useNextPeriodSuggestion, useUpdatePayrollPeriod } from '../hooks/usePayroll';
import type { PayrollPeriod } from '../types';

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';

export function PayrollPeriodForm({
  period,
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (period: PayrollPeriod) => void;
  period?: PayrollPeriod;
}) {
  const isEdit = Boolean(period);
  const createMutation = useCreatePayrollPeriod();
  const updateMutation = useUpdatePayrollPeriod();
  const mutation = isEdit ? updateMutation : createMutation;

  const { data: suggestion } = useNextPeriodSuggestion(!isEdit);

  const [label, setLabel] = useState(period?.label ?? '');
  const [periodStart, setPeriodStart] = useState(period?.period_start ?? '');
  const [periodEnd, setPeriodEnd] = useState(period?.period_end ?? '');
  const [totalAmount, setTotalAmount] = useState(period?.control_total ?? '');

  useEffect(() => {
    if (!isEdit && suggestion && !label && !periodStart && !periodEnd) {
      setLabel(suggestion.label);
      setPeriodStart(suggestion.period_start);
      setPeriodEnd(suggestion.period_end);
    }
    // Only auto-fill once, when the suggestion first arrives on a blank form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (isEdit && period) {
      await updateMutation.mutateAsync({
        id: period.id,
        label,
        period_start: periodStart,
        period_end: periodEnd,
        total_amount: totalAmount || '0',
      });
    } else {
      const created = await createMutation.mutateAsync({
        label,
        period_start: periodStart,
        period_end: periodEnd,
        total_amount: totalAmount || '0',
      });
      onCreated?.(created);
    }
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {mutation.error.message}
        </p>
      )}

      <Field label="Week label">
        <input
          type="text"
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. August 4-10, 2025"
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Period start">
          <input
            type="date"
            required
            min={PROJECT_DATE_MIN}
            max={PROJECT_DATE_MAX}
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
        <Field label="Period end">
          <input
            type="date"
            required
            min={PROJECT_DATE_MIN}
            max={PROJECT_DATE_MAX}
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
      </div>

      <Field label="Control total (weekly sheet)">
        <input
          type="number"
          step="0.01"
          min="0"
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
          placeholder="Enter once you have the weekly sheet figure"
          className="w-full max-w-xs rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      <div className="flex justify-end gap-3 border-t border-rule pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-rule-strong px-4 py-2 text-sm text-ink-muted hover:bg-canvas"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create period'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { children: React.ReactNode; label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      {children}
    </label>
  );
}
