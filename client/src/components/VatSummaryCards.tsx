import { formatMoney } from '../lib/formatMoney';
import type { VatSummary } from '../types';

// v_vat_component was built for BIR-style reporting (all amounts are
// VAT-inclusive; the VAT portion is amount * 12/112) but had no UI surface
// at all until now.
export function VatSummaryCards({ data }: { data: VatSummary }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
      <Card label="Gross disbursed" value={formatMoney(data.gross_amount)} note="All cash out, VAT-inclusive" />
      <Card label="VAT component" value={formatMoney(data.vat_component)} note="12% of gross (amount × 12/112)" />
      <Card label="Net of VAT" value={formatMoney(data.net_of_vat)} note="For BIR-style reporting" />
    </div>
  );
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-md border border-rule bg-surface p-4 shadow-card">
      <span className="mb-2.5 block text-xs font-medium text-ink-muted">{label}</span>
      <span
        className="mb-2 block truncate font-mono text-lg leading-tight font-semibold tracking-tight text-ink"
        title={value}
      >
        {value}
      </span>
      <span className="text-[13px] text-ink-faint">{note}</span>
    </div>
  );
}
