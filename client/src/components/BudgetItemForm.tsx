import { useState } from 'react';
import { useCreateBudgetItem } from '../hooks/useBudgetItemDetail';

// Create only. Everything else about an item (procurement mode, remarks, and
// the budget figures once it exists) is edited on its own page, so this form
// stays at the three fields a new line genuinely needs.
export function BudgetItemForm({ suggestedItemNo, onClose }: { onClose: () => void; suggestedItemNo: string }) {
  const mutation = useCreateBudgetItem();

  const [itemNo, setItemNo] = useState(suggestedItemNo);
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await mutation.mutateAsync({
      item_no: itemNo.trim(),
      description: description.trim(),
      original_budget: budget || '0',
      contract_amount: '0',
    });
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {mutation.error.message}
        </p>
      )}

      <Field label="Item number">
        <input
          type="text"
          required
          pattern="\d+\.0"
          value={itemNo}
          onChange={(e) => setItemNo(e.target.value)}
          className="w-full max-w-32 rounded-sm border border-rule-strong bg-surface px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
        />
        <span className="text-[13px] text-ink-faint">
          A number then ".0" -- e.g. "21.0". JPL codes starting "21." attach to this item, so it can't be changed later.
        </span>
      </Field>

      <Field label="Description">
        <input
          type="text"
          required
          maxLength={191}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Land Development"
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      <Field label="Approved budget">
        <input
          type="number"
          step="0.01"
          min="0"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="0.00"
          className="w-full max-w-xs rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <span className="text-[13px] text-ink-faint">
          VAT-inclusive, like every amount in this app. Leave blank to enter it later.
        </span>
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
          {mutation.isPending ? 'Saving…' : 'Add budget item'}
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
