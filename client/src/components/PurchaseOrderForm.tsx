import { useState } from 'react';
import Decimal from 'decimal.js';
import { useCreatePurchaseOrder, useUpdatePurchaseOrder } from '../hooks/usePurchaseOrders';
import { useFxRates, suggestFxRate } from '../hooks/useFxRates';
import { formatMoney } from '../lib/formatMoney';
import { SupplierAutocomplete } from './SupplierAutocomplete';
import { PlanningLinePicker } from './PlanningLinePicker';
import type { MilestoneInput, MilestoneKind, PlanningLine, PurchaseOrderDetail, Supplier } from '../types';

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';
const MILESTONE_KINDS: MilestoneKind[] = [
  'downpayment', 'progress', 'before_delivery', 'upon_delivery', 'completion', 'retention', 'other',
];
// Matches CURRENCIES in server/routes/purchaseOrders.js -- what the fx_rates
// reference table is seeded with, not a general-purpose currency list.
const CURRENCIES = ['PHP', 'USD', 'EUR'];

interface MilestoneRow {
  label: string;
  pctPercent: string;
  kind: MilestoneKind;
  is_holdback: boolean;
}

export function PurchaseOrderForm({ po, onClose }: { onClose: () => void; po?: PurchaseOrderDetail }) {
  const isEdit = Boolean(po);
  const createMutation = useCreatePurchaseOrder();
  const updateMutation = useUpdatePurchaseOrder();
  const mutation = isEdit ? updateMutation : createMutation;

  const [porNo, setPorNo] = useState(po?.por_no ?? '');
  const [msrNo, setMsrNo] = useState(po?.msr_no ?? '');
  const [poDate, setPoDate] = useState(po?.po_date ?? '');
  const [supplier, setSupplier] = useState<Supplier | null>(
    po?.supplier_id && po.supplier
      ? { id: po.supplier_id, name: po.supplier, normalized_name: '', category: null, is_active: 1 }
      : null,
  );
  const [planningLine, setPlanningLine] = useState<PlanningLine | null>(
    po?.planning_line_id && po.item_no
      ? { id: po.planning_line_id, code: po.item_no, parent_id: null, depth: 0, description: null, budget_item_id: po.budget_item_id }
      : null,
  );
  const [itemDescription, setItemDescription] = useState(po?.item_description ?? '');
  const [refNo, setRefNo] = useState(po?.ref_no ?? '');
  const [currency, setCurrency] = useState(po?.currency ?? 'PHP');
  const [contractAmount, setContractAmount] = useState(po?.contract_amount ?? '');
  const [fxRate, setFxRate] = useState(po?.fx_rate ?? '');
  const [remarks, setRemarks] = useState(po?.remarks ?? '');
  const { data: fxRates } = useFxRates();
  const fxSuggestion = currency !== 'PHP' ? suggestFxRate(fxRates, currency, poDate) : null;
  const [milestones, setMilestones] = useState<MilestoneRow[]>(
    po && po.milestones.length > 0
      ? po.milestones.map((m) => ({
          label: m.label,
          // pct is stored to 6 decimal places (a fraction), so 4 decimal
          // places as a percentage is the real precision -- rounding here
          // strips float noise like "16.666700000000002" that would
          // otherwise make an exact 100% schedule display as not summing
          // to 100%.
          pctPercent: String(Number((Number(m.pct) * 100).toFixed(4))),
          kind: m.kind as MilestoneKind,
          is_holdback: Boolean(m.is_holdback),
        }))
      : [{ label: '', pctPercent: '', kind: 'downpayment', is_holdback: false }],
  );

  function updateMilestone(index: number, patch: Partial<MilestoneRow>) {
    setMilestones((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  // Rounded to 4 decimal places (pct is stored to 6, i.e. 4 as a percentage)
  // so summing several rows can't leave binary-float noise (e.g.
  // 100.00000000000001) that would make a genuinely-100% schedule look wrong.
  const totalPercentRaw = milestones.reduce((sum, row) => sum + (Number(row.pctPercent) || 0), 0);
  const totalPercent = Number(totalPercentRaw.toFixed(4));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const milestoneInputs: MilestoneInput[] = milestones.map((row) => ({
      label: row.label,
      pct: String(Number(row.pctPercent) / 100),
      kind: row.kind,
      is_holdback: row.is_holdback,
    }));

    const body = {
      por_no: porNo,
      msr_no: msrNo,
      po_date: poDate,
      supplier_id: supplier?.id ?? null,
      planning_line_id: planningLine?.id ?? null,
      item_description: itemDescription,
      ref_no: refNo,
      currency,
      contract_amount: contractAmount,
      fx_rate: currency === 'PHP' ? '1' : fxRate,
      remarks,
      milestones: milestoneInputs,
    };

    if (isEdit && po) {
      await updateMutation.mutateAsync({ id: po.id, ...body });
    } else {
      await createMutation.mutateAsync(body);
    }
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger whitespace-pre-line">
          {mutation.error.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="PO number">
          <input
            type="text"
            required
            value={porNo}
            onChange={(e) => setPorNo(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
        <Field label="MSR number">
          <input
            type="text"
            value={msrNo}
            onChange={(e) => setMsrNo(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="PO date">
          <input
            type="date"
            required
            min={PROJECT_DATE_MIN}
            max={PROJECT_DATE_MAX}
            value={poDate}
            onChange={(e) => setPoDate(e.target.value)}
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
            value={refNo}
            onChange={(e) => setRefNo(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
        <Field label="JPL / WBS code">
          <PlanningLinePicker value={planningLine?.id ?? null} onChange={setPlanningLine} />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
        <Field label="Currency">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Contract amount (${currency})`}>
          <input
            type="number"
            step="0.01"
            min="0.01"
            required
            value={contractAmount}
            onChange={(e) => setContractAmount(e.target.value)}
            className="w-full max-w-xs rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
        </Field>
      </div>

      {currency !== 'PHP' && (
        <Field label={`FX rate (${currency} to PHP)`}>
          <div className="flex items-center gap-3">
            <input
              type="number"
              step="0.000001"
              min="0.000001"
              required
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              className="w-full max-w-40 rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            {fxSuggestion && (
              <button
                type="button"
                onClick={() => setFxRate(fxSuggestion.rate_to_php)}
                className="text-xs text-accent hover:underline"
              >
                Use {fxSuggestion.rate_to_php} (as of {fxSuggestion.effective_on}{fxSuggestion.note ? `, ${fxSuggestion.note}` : ''})
              </button>
            )}
          </div>
          {contractAmount && fxRate && Number(fxRate) > 0 && (
            <p className="text-xs text-ink-faint">
              ≈ {formatMoney(new Decimal(contractAmount).times(fxRate).toFixed(2))}
            </p>
          )}
        </Field>
      )}

      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Payment terms / milestones</span>
          <span className={`text-xs font-semibold tabular-nums ${totalPercent === 100 ? 'text-accent' : 'text-danger'}`}>
            Total: {totalPercent}%
          </span>
        </div>

        {milestones.map((row, index) => (
          <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_6rem_10rem_auto_auto]">
            <input
              type="text"
              required
              placeholder="Label (e.g. DP, PB, Retention)"
              value={row.label}
              onChange={(e) => updateMilestone(index, { label: e.target.value })}
              className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <input
              type="number"
              step="1"
              min="1"
              max="100"
              required
              placeholder="%"
              value={row.pctPercent}
              onChange={(e) => updateMilestone(index, { pctPercent: e.target.value })}
              className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <select
              value={row.kind}
              onChange={(e) => {
                const kind = e.target.value as MilestoneKind;
                // retention_pct is derived from is_holdback alone, not kind --
                // labeling a row "retention" without the checkbox would
                // silently leave it out of that total, so keep them in sync
                // on this specific transition (still overridable below).
                updateMilestone(index, kind === 'retention' ? { kind, is_holdback: true } : { kind });
              }}
              className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            >
              {MILESTONE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm whitespace-nowrap text-ink">
              <input
                type="checkbox"
                checked={row.is_holdback}
                onChange={(e) => updateMilestone(index, { is_holdback: e.target.checked })}
              />
              Holdback
            </label>
            {milestones.length > 1 && (
              <button
                type="button"
                onClick={() => setMilestones((rows) => rows.filter((_, i) => i !== index))}
                className="text-sm text-danger hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setMilestones((rows) => [...rows, { label: '', pctPercent: '', kind: 'progress', is_holdback: false }])
          }
          className="self-start text-sm font-medium text-accent hover:underline"
        >
          + Add milestone
        </button>
      </div>

      <Field label="Remarks">
        <input
          type="text"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
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
          {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create PO'}
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
