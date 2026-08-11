import { formatMoney } from '../lib/formatMoney';
import type { VatSummary } from '../types';

// "Gross disbursed" used to sit here as a third card -- it's the exact same
// figure as the "Paid (check issued)" KPI card above (v_vat_component sums
// the same disbursement total), so it was showing the same number twice one
// scroll apart. Only the two figures actually derived FROM that total for
// BIR-style reporting belong here, and they're presented as a quieter strip,
// not full stat tiles -- they're a footnote to the KPI row, not a second
// row of primary numbers competing with it.
export function VatSummaryCards({ data }: { data: VatSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-md border border-rule bg-surface px-4 py-2.5 text-xs shadow-card">
      <span className="font-medium text-ink-faint">VAT (12% of gross, amount × 12/112)</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-ink-faint">Component</span>
        <span className="font-mono font-semibold text-ink-muted">{formatMoney(data.vat_component)}</span>
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-ink-faint">Net of VAT</span>
        <span className="font-mono font-semibold text-ink-muted">{formatMoney(data.net_of_vat)}</span>
      </span>
    </div>
  );
}
