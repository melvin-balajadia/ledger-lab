import { formatMoney } from '../lib/formatMoney';
import { ProgressBar } from './ProgressBar';
import type { TopSupplier } from '../types';

// Combines the three disbursement sources that carry a supplier_id (PO
// payments, replenishments, additional payments) -- there was nowhere in
// the app to see where money concentrates by supplier before this.
export function TopSuppliersPanel({ suppliers }: { suppliers: TopSupplier[] }) {
  return (
    <div className="rounded-md border border-rule bg-surface p-5 shadow-card">
      <div className="mb-4">
        <p className="text-sm font-semibold text-ink">Top suppliers by spend</p>
        <p className="text-xs text-ink-faint">PO payments, replenishments, and additional payments combined</p>
      </div>

      {suppliers.length === 0 ? (
        <p className="text-sm text-ink-faint">No supplier-attributed spend recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {suppliers.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-right text-xs font-semibold text-ink-faint">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink" title={s.name}>
                {s.name}
              </span>
              <span className="shrink-0 font-mono text-sm text-ink">{formatMoney(s.total_spend)}</span>
              <div className="w-28 shrink-0">
                <ProgressBar ratio={s.pct_of_total} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
