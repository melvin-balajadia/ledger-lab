import { useState } from 'react';
import { useUpdateBudgetItem } from '../hooks/useBudgetItemDetail';
import { useEnumValues } from '../hooks/useEnumValues';
import type { BudgetItemPatch } from '../types';

export function BudgetItemDetailsForm({
  budgetItemId,
  description,
  budget,
  contractAmount,
  procurementMode,
  remarks,
  revisionCount,
}: {
  budget: string;
  budgetItemId: number;
  contractAmount: string;
  description: string;
  procurementMode: string;
  remarks: string | null;
  revisionCount: number;
}) {
  const mutation = useUpdateBudgetItem(budgetItemId);
  const { data: modes } = useEnumValues('budget_items', 'procurement_mode');

  const [descriptionText, setDescriptionText] = useState(description);
  const [budgetText, setBudgetText] = useState(budget);
  // No setter -- the field is read-only now (see the input below).
  const contractText = contractAmount;
  const [mode, setMode] = useState(procurementMode);
  const [remarksText, setRemarksText] = useState(remarks ?? '');

  // Once a revision is logged, the budget belongs to budget_revisions and this
  // field would be an untracked overwrite of an audited chain (CLAUDE.md
  // rule 9). The server rejects it too -- this just doesn't offer it.
  const budgetLocked = revisionCount > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // contract_amount is deliberately not sent. Since migration 024 the
    // Committed figure is summed from the POs, so this field only displays it
    // -- and the stored budget_items.contract_amount is kept as the historical
    // record of what the spreadsheet carried. Omitting it from the PATCH
    // leaves that record intact (the endpoint merges missing fields from the
    // existing row); sending the derived figure back would overwrite it.
    const body: BudgetItemPatch = {
      description: descriptionText,
      procurement_mode: mode,
      remarks: remarksText || null,
    };
    if (!budgetLocked) {
      // Both columns, from one input: with no revision logged they're equal by
      // construction, and original_budget must stay the figure any future
      // revision is measured from.
      body.original_budget = budgetText || '0';
      body.revised_budget = budgetText || '0';
    }
    await mutation.mutateAsync(body);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-rule pt-4">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Budget item details</span>

      {mutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {mutation.error.message}
        </p>
      )}

      <input
        type="text"
        required
        maxLength={191}
        placeholder="Description"
        value={descriptionText}
        onChange={(e) => setDescriptionText(e.target.value)}
        className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-muted">Approved budget</span>
          <input
            type="number"
            step="0.01"
            min="0"
            disabled={budgetLocked}
            value={budgetText}
            onChange={(e) => setBudgetText(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:bg-canvas disabled:text-ink-faint"
          />
          {budgetLocked && (
            <span className="text-[13px] text-ink-faint">
              Fixed -- this item has a logged revision. Use "Log a revision" above to change it.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-ink-muted">Committed (contract awarded)</span>
          <input
            type="number"
            step="0.01"
            min="0"
            disabled
            value={contractText}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none disabled:bg-canvas disabled:text-ink-faint"
          />
          {/* Read-only since migration 024: v_budget_vs_actual sums this from
              purchase_orders, so a typed figure here would be ignored -- and
              the hand-kept column is what drifted PHP 21 M behind the POs. */}
          <span className="text-[13px] text-ink-faint">
            Summed from this item's purchase orders. Award or void a PO to change it.
          </span>
        </label>
      </div>

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
