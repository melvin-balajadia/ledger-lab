import { useState } from 'react';
import { useCreateAdditionalPayment, useUpdateAdditionalPayment, useVoidAdditionalPayment } from '../hooks/useAdditionalPayments';
import { SupplierAutocomplete } from './SupplierAutocomplete';
import { PlanningLinePicker } from './PlanningLinePicker';
import type { AdditionalPayment, ExpenseType, PlanningLine, Supplier } from '../types';

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';
const EXPENSE_TYPES: ExpenseType[] = [
  'customs_duty', 'freight', 'terminal_handling', 'insurance', 'brokerage', 'other',
];

interface CodeLine {
  planningLine: PlanningLine | null;
  amount: string;
}

export function AdditionalPaymentForm({
  payment,
  onClose,
}: {
  onClose: () => void;
  payment?: AdditionalPayment;
}) {
  const isEdit = Boolean(payment);
  const createMutation = useCreateAdditionalPayment();
  const updateMutation = useUpdateAdditionalPayment();
  const voidMutation = useVoidAdditionalPayment();
  const mutation = isEdit ? updateMutation : createMutation;

  const [txnDate, setTxnDate] = useState(payment?.txn_date ?? '');
  const [payee, setPayee] = useState(payment?.payee ?? '');
  const [supplier, setSupplier] = useState<Supplier | null>(
    payment?.supplier_id && payment.supplier_name
      ? { id: payment.supplier_id, name: payment.supplier_name, normalized_name: '', category: null, is_active: 1 }
      : null,
  );
  const [description, setDescription] = useState(payment?.description ?? '');
  const [voucherNo, setVoucherNo] = useState(payment?.voucher_no ?? '');
  const [expenseType, setExpenseType] = useState<ExpenseType>(payment?.expense_type ?? 'other');
  const [needsReview, setNeedsReview] = useState(Boolean(payment?.needs_review));
  const [totalAmount, setTotalAmount] = useState('');
  const [codeLines, setCodeLines] = useState<CodeLine[]>([
    {
      planningLine:
        payment?.planning_line_id && payment.planning_line_code
          ? {
              id: payment.planning_line_id,
              code: payment.planning_line_code,
              parent_id: null,
              depth: 0,
              description: payment.planning_line_description,
              budget_item_id: payment.budget_item_id,
            }
          : null,
      amount: payment?.amount ?? '',
    },
  ]);

  function updateCodeLine(index: number, patch: Partial<CodeLine>) {
    setCodeLines((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function handleDelete() {
    if (!payment) return;
    const reason = window.prompt('Reason for deleting this payment (optional):');
    if (reason === null) return;
    if (!window.confirm('Delete this additional payment? You can restore it later from "Deleted items".')) return;
    await voidMutation.mutateAsync({ id: payment.id, reason: reason || undefined });
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (isEdit && payment) {
      await updateMutation.mutateAsync({
        id: payment.id,
        txn_date: txnDate,
        payee,
        supplier_id: supplier?.id ?? null,
        planning_line_id: codeLines[0].planningLine?.id ?? null,
        budget_item_id: codeLines[0].planningLine?.budget_item_id ?? null,
        description,
        voucher_no: voucherNo,
        expense_type: expenseType,
        amount: codeLines[0].amount,
        needs_review: needsReview ? 1 : 0,
      } as never);
    } else {
      await createMutation.mutateAsync({
        lines: codeLines.map((line) => ({
          txn_date: txnDate,
          payee,
          supplier_id: supplier?.id ?? null,
          planning_line_id: line.planningLine?.id ?? null,
          budget_item_id: line.planningLine?.budget_item_id ?? null,
          description,
          voucher_no: voucherNo,
          expense_type: expenseType,
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
        <Field label="Payee">
          <input
            type="text"
            required
            placeholder="e.g. BUREAU OF CUSTOMS"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Supplier (if applicable)">
          <SupplierAutocomplete value={supplier} onChange={setSupplier} />
        </Field>
        <Field label="Expense type">
          <select
            value={expenseType}
            onChange={(e) => setExpenseType(e.target.value as ExpenseType)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          >
            {EXPENSE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Description">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

      <Field label="Voucher no.">
        <input
          type="text"
          placeholder="e.g. RFPLAEX00101"
          value={voucherNo}
          onChange={(e) => setVoucherNo(e.target.value)}
          className="w-full max-w-xs rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
      </Field>

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
