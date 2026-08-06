import { useState } from 'react';
import { useCreateCashAdvance, useUpdateCashAdvance, useVoidCashAdvance } from '../hooks/useCashAdvances';
import { PlanningLinePicker } from './PlanningLinePicker';
import type { CashAdvance, CashAdvanceStatus, PlanningLine } from '../types';

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';

interface CodeLine {
  planningLine: PlanningLine | null;
  amount: string;
}

export function CashAdvanceForm({
  cashAdvance,
  onClose,
}: {
  onClose: () => void;
  cashAdvance?: CashAdvance;
}) {
  const isEdit = Boolean(cashAdvance);
  const createMutation = useCreateCashAdvance();
  const updateMutation = useUpdateCashAdvance();
  const voidMutation = useVoidCashAdvance();
  const mutation = isEdit ? updateMutation : createMutation;

  const [txnDate, setTxnDate] = useState(cashAdvance?.txn_date ?? '');
  const [requestedBy, setRequestedBy] = useState(cashAdvance?.requested_by ?? '');
  const [purpose, setPurpose] = useState(cashAdvance?.purpose ?? '');
  const [controlNo, setControlNo] = useState(cashAdvance?.control_no ?? '');
  const [liquidatedAmount, setLiquidatedAmount] = useState(cashAdvance?.liquidated_amount ?? '0');
  const [status, setStatus] = useState<CashAdvanceStatus>(cashAdvance?.status ?? 'open');
  const [needsReview, setNeedsReview] = useState(Boolean(cashAdvance?.needs_review));
  const [totalAmount, setTotalAmount] = useState('');
  const [codeLines, setCodeLines] = useState<CodeLine[]>([
    {
      planningLine:
        cashAdvance?.planning_line_id && cashAdvance.planning_line_code
          ? {
              id: cashAdvance.planning_line_id,
              code: cashAdvance.planning_line_code,
              parent_id: null,
              depth: 0,
              description: cashAdvance.planning_line_description,
              budget_item_id: cashAdvance.budget_item_id,
            }
          : null,
      amount: cashAdvance?.amount ?? '',
    },
  ]);

  function updateCodeLine(index: number, patch: Partial<CodeLine>) {
    setCodeLines((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function handleDelete() {
    if (!cashAdvance) return;
    const reason = window.prompt('Reason for deleting this cash advance (optional):');
    if (reason === null) return;
    if (!window.confirm('Delete this cash advance? You can restore it later from "Deleted items".')) return;
    await voidMutation.mutateAsync({ id: cashAdvance.id, reason: reason || undefined });
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (isEdit && cashAdvance) {
      await updateMutation.mutateAsync({
        id: cashAdvance.id,
        txn_date: txnDate,
        planning_line_id: codeLines[0].planningLine?.id ?? null,
        budget_item_id: codeLines[0].planningLine?.budget_item_id ?? null,
        requested_by: requestedBy,
        purpose,
        control_no: controlNo,
        amount: codeLines[0].amount,
        liquidated_amount: liquidatedAmount,
        status,
        needs_review: needsReview ? 1 : 0,
      } as never);
    } else {
      await createMutation.mutateAsync({
        lines: codeLines.map((line) => ({
          txn_date: txnDate,
          planning_line_id: line.planningLine?.id ?? null,
          budget_item_id: line.planningLine?.budget_item_id ?? null,
          requested_by: requestedBy,
          purpose,
          control_no: controlNo,
          amount: line.amount,
        })),
        total_amount: totalAmount || undefined,
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
      {voidMutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {voidMutation.error.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date">
          <input
            type="date"
            required
            min={PROJECT_DATE_MIN}
            max={PROJECT_DATE_MAX}
            value={txnDate}
            onChange={(e) => setTxnDate(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
        <Field label="Requested by">
          <input
            type="text"
            value={requestedBy}
            onChange={(e) => setRequestedBy(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Purpose">
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
        <Field label="Control number">
          <input
            type="text"
            value={controlNo}
            onChange={(e) => setControlNo(e.target.value)}
            placeholder="For your reference"
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {codeLines.length > 1 ? 'Split across codes' : 'JPL / WBS code'}
        </span>
        {codeLines.map((line, index) => (
          <div key={index} data-codeline className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto]">
            <PlanningLinePicker
              value={line.planningLine?.id ?? null}
              onChange={(planningLine) => updateCodeLine(index, { planningLine })}
            />
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="Amount"
              value={line.amount}
              onChange={(e) => updateCodeLine(index, { amount: e.target.value })}
              className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            {!isEdit && codeLines.length > 1 && (
              <button
                type="button"
                onClick={() => setCodeLines((lines) => lines.filter((_, i) => i !== index))}
                className="text-sm text-danger hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        ))}

        {!isEdit && (
          <button
            type="button"
            onClick={() => setCodeLines((lines) => [...lines, { planningLine: null, amount: '' }])}
            className="self-start text-sm font-medium text-accent hover:underline"
          >
            + Add another code
          </button>
        )}

        {!isEdit && codeLines.length > 1 && (
          <Field label="Total amount (optional — validated against the lines above)">
            <input
              type="number"
              step="0.01"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className="w-full max-w-xs rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </Field>
        )}
      </div>

      {isEdit && (
        <div className="grid grid-cols-1 gap-4 border-t border-rule pt-4 sm:grid-cols-2">
          <Field label="Liquidated amount">
            <input
              type="number"
              step="0.01"
              min="0"
              value={liquidatedAmount}
              onChange={(e) => setLiquidatedAmount(e.target.value)}
              className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as CashAdvanceStatus)}
              className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="open">Open</option>
              <option value="partially_liquidated">Partially liquidated</option>
              <option value="liquidated">Liquidated</option>
            </select>
          </Field>
        </div>
      )}

      {isEdit && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
          Needs review
        </label>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-rule pt-4">
        {isEdit ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={voidMutation.isPending}
            className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
          >
            {voidMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-3">
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
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add entry'}
          </button>
        </div>
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
