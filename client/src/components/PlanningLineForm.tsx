import { useState } from 'react';
import { useCreatePlanningLine, useUpdatePlanningLine } from '../hooks/usePlanningLines';
import type { PlanningLine } from '../types';

export function PlanningLineForm({
  line,
  budgetItemNo,
  onClose,
}: {
  budgetItemNo?: string;
  line?: PlanningLine;
  onClose: () => void;
}) {
  const isEdit = Boolean(line);
  const createMutation = useCreatePlanningLine();
  const updateMutation = useUpdatePlanningLine();
  const mutation = isEdit ? updateMutation : createMutation;

  const [code, setCode] = useState(line?.code ?? '');
  const [description, setDescription] = useState(line?.description ?? '');
  const [budgetAmount, setBudgetAmount] = useState(line?.budget_amount ?? '');
  const [isActive, setIsActive] = useState(Boolean(line?.is_active ?? true));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (isEdit && line) {
      await updateMutation.mutateAsync({
        id: line.id,
        code,
        description: description || null,
        budget_amount: budgetAmount || null,
        is_active: isActive ? 1 : 0,
      });
    } else {
      await createMutation.mutateAsync({
        code,
        description: description || null,
        budget_amount: budgetAmount || null,
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

      <Field label="JPL / WBS code">
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={budgetItemNo ? `e.g. ${budgetItemNo.replace('.0', '')}.2.5` : 'e.g. 3.2.5'}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
        />
        <span className="text-[13px] text-ink-faint">Digits and dots only -- e.g. "3.2.5", no leading/trailing dot.</span>
      </Field>

      <Field label="Description">
        <input
          type="text"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      <Field label="Budget amount (optional)">
        <input
          type="number"
          step="0.01"
          min="0"
          value={budgetAmount ?? ''}
          onChange={(e) => setBudgetAmount(e.target.value)}
          className="w-full max-w-xs rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      {isEdit && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (shown in pickers for new entries)
        </label>
      )}

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
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add line'}
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
