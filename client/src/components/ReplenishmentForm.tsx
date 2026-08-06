import { useState } from 'react';
import { useCreateReplenishment, useUpdateReplenishment, useVoidReplenishment } from '../hooks/useReplenishments';
import { SupplierAutocomplete } from './SupplierAutocomplete';
import { PlanningLinePicker } from './PlanningLinePicker';
import type { PlanningLine, RefType, Replenishment, Supplier } from '../types';

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';
const REF_TYPES: RefType[] = ['SI', 'CI', 'CSI', 'OR', 'BS', 'MSR', 'other'];

interface CodeLine {
  planningLine: PlanningLine | null;
  amount: string;
}

export function ReplenishmentForm({
  replenishment,
  onClose,
}: {
  onClose: () => void;
  replenishment?: Replenishment;
}) {
  const isEdit = Boolean(replenishment);
  const createMutation = useCreateReplenishment();
  const updateMutation = useUpdateReplenishment();
  const voidMutation = useVoidReplenishment();
  const mutation = isEdit ? updateMutation : createMutation;

  async function handleDelete() {
    if (!replenishment) return;
    const reason = window.prompt('Reason for deleting this entry (optional):');
    if (reason === null) return;
    if (!window.confirm('Delete this replenishment? You can restore it later from "Deleted items".')) return;
    await voidMutation.mutateAsync({ id: replenishment.id, reason: reason || undefined });
    onClose();
  }

  const [txnDate, setTxnDate] = useState(replenishment?.txn_date ?? '');
  const [supplier, setSupplier] = useState<Supplier | null>(
    replenishment?.supplier_id && replenishment.supplier_name
      ? { id: replenishment.supplier_id, name: replenishment.supplier_name, normalized_name: '', category: null, is_active: 1 }
      : null,
  );
  const [itemDescription, setItemDescription] = useState(replenishment?.item_description ?? '');
  const [refNo, setRefNo] = useState(replenishment?.ref_no ?? '');
  const [refType, setRefType] = useState<RefType | ''>(replenishment?.ref_type ?? '');
  const [needsReview, setNeedsReview] = useState(Boolean(replenishment?.needs_review));
  const [totalAmount, setTotalAmount] = useState('');
  const [codeLines, setCodeLines] = useState<CodeLine[]>([
    {
      planningLine:
        replenishment?.planning_line_id && replenishment.planning_line_code
          ? {
              id: replenishment.planning_line_id,
              code: replenishment.planning_line_code,
              parent_id: null,
              depth: 0,
              description: replenishment.planning_line_description,
              budget_item_id: replenishment.budget_item_id,
            }
          : null,
      amount: replenishment?.amount ?? '',
    },
  ]);

  function updateCodeLine(index: number, patch: Partial<CodeLine>) {
    setCodeLines((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (isEdit && replenishment) {
      await updateMutation.mutateAsync({
        id: replenishment.id,
        txn_date: txnDate,
        supplier_id: supplier?.id ?? null,
        planning_line_id: codeLines[0].planningLine?.id ?? null,
        budget_item_id: codeLines[0].planningLine?.budget_item_id ?? null,
        item_description: itemDescription,
        ref_no: refNo,
        ref_type: refType || undefined,
        amount: codeLines[0].amount,
        needs_review: needsReview ? 1 : 0,
      } as never);
    } else {
      await createMutation.mutateAsync({
        lines: codeLines.map((line) => ({
          txn_date: txnDate,
          supplier_id: supplier?.id ?? null,
          planning_line_id: line.planningLine?.id ?? null,
          budget_item_id: line.planningLine?.budget_item_id ?? null,
          item_description: itemDescription,
          ref_no: refNo,
          ref_type: refType || '',
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
        <Field label="Supplier">
          <SupplierAutocomplete value={supplier} onChange={setSupplier} />
        </Field>
      </div>

      <Field label="Item description">
        <input
          type="text"
          value={itemDescription}
          onChange={(e) => setItemDescription(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Reference no.">
          <input
            type="text"
            placeholder="e.g. SI#: 376572"
            value={refNo}
            onChange={(e) => setRefNo(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
        <Field label="Reference type">
          <select
            value={refType}
            onChange={(e) => setRefType(e.target.value as RefType | '')}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          >
            <option value="">—</option>
            {REF_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
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
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
          Needs review
        </label>
      )}

      {voidMutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {voidMutation.error.message}
        </p>
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
