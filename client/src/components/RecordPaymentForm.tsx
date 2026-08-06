import { useState } from 'react';
import Decimal from 'decimal.js';
import { useRecordPayment } from '../hooks/usePurchaseOrders';
import { useFxRates, suggestFxRate } from '../hooks/useFxRates';
import { formatMoney } from '../lib/formatMoney';
import type { PoPaymentType } from '../types';

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';
const PAYMENT_TYPES: PoPaymentType[] = [
  'downpayment', 'progress', 'before_delivery', 'cod', 'completion', 'retention', 'other',
];

// Currency always matches the PO's contract currency -- a payment settling
// in a different currency than what was contracted isn't a case this app's
// source data has, so it's not a picker here, just carried through.
export function RecordPaymentForm({ poId, currency }: { poId: number; currency: string }) {
  const mutation = useRecordPayment();
  const [paidOn, setPaidOn] = useState('');
  const [paymentType, setPaymentType] = useState<PoPaymentType>('progress');
  const [amount, setAmount] = useState('');
  const [fxRate, setFxRate] = useState('');
  const [voucherNo, setVoucherNo] = useState('');
  const { data: fxRates } = useFxRates();
  const fxSuggestion = currency !== 'PHP' ? suggestFxRate(fxRates, currency, paidOn) : null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await mutation.mutateAsync({
      poId,
      paid_on: paidOn,
      payment_type: paymentType,
      currency,
      amount,
      fx_rate: currency === 'PHP' ? '1' : fxRate,
      voucher_no: voucherNo,
    });
    setPaidOn('');
    setAmount('');
    setFxRate('');
    setVoucherNo('');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-rule pt-4">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Record a payment</span>

      {mutation.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {mutation.error.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_10rem_10rem_1fr_auto]">
        <input
          type="date"
          required
          min={PROJECT_DATE_MIN}
          max={PROJECT_DATE_MAX}
          value={paidOn}
          onChange={(e) => setPaidOn(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <select
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as PoPaymentType)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          {PAYMENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder={currency === 'PHP' ? 'Amount' : `Amount (${currency})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Voucher no."
          value={voucherNo}
          onChange={(e) => setVoucherNo(e.target.value)}
          className="w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {mutation.isPending ? 'Saving…' : 'Record'}
        </button>
      </div>

      {currency !== 'PHP' && (
        <div className="flex items-center gap-3">
          <input
            type="number"
            step="0.000001"
            min="0.000001"
            required
            placeholder={`FX rate (${currency} to PHP)`}
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
          {amount && fxRate && Number(fxRate) > 0 && (
            <span className="text-xs text-ink-faint">≈ {formatMoney(new Decimal(amount).times(fxRate).toFixed(2))}</span>
          )}
        </div>
      )}
    </form>
  );
}
