import { useState } from 'react';
import { useCreatePayrollEntry, useUpdatePayrollEntry } from '../hooks/usePayroll';
import { WorkerAutocomplete } from './WorkerAutocomplete';
import { PlanningLinePicker } from './PlanningLinePicker';
import type { PayrollEntry, PlanningLine, Worker } from '../types';

export function PayrollEntryForm({
  periodId,
  entry,
  onClose,
}: {
  entry?: PayrollEntry;
  onClose: () => void;
  periodId: number;
}) {
  const isEdit = Boolean(entry);
  const createMutation = useCreatePayrollEntry(periodId);
  const updateMutation = useUpdatePayrollEntry(periodId);
  const mutation = isEdit ? updateMutation : createMutation;

  const [worker, setWorker] = useState<Worker | null>(
    entry ? { id: entry.worker_id, full_name: entry.worker_name, employee_no: null, position: entry.position, is_active: 1, date_separated: null, total_earned: '0' } : null,
  );
  const [planningLine, setPlanningLine] = useState<PlanningLine | null>(
    entry?.planning_line_id && entry.planning_line_code
      ? { id: entry.planning_line_id, code: entry.planning_line_code, parent_id: null, depth: 0, description: null, budget_item_id: entry.budget_item_id }
      : null,
  );
  const [amount, setAmount] = useState(entry?.amount ?? '');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!worker) return;

    if (isEdit && entry) {
      await updateMutation.mutateAsync({
        entryId: entry.id,
        planning_line_id: planningLine?.id ?? null,
        amount,
      });
    } else {
      await createMutation.mutateAsync({
        worker_id: worker.id,
        planning_line_id: planningLine?.id ?? null,
        amount,
      });
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

      <Field label="Worker">
        <WorkerAutocomplete value={worker} onChange={setWorker} />
      </Field>

      <Field label="JPL / WBS code">
        <PlanningLinePicker value={planningLine?.id ?? null} onChange={setPlanningLine} />
      </Field>

      <Field label="Amount">
        <input
          type="number"
          step="0.01"
          min="0"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
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
          disabled={mutation.isPending || !worker}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add entry'}
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
