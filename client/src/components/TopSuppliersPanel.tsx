import { formatMoney, formatPercent } from '../lib/formatMoney';
import { type CsvColumn } from '../lib/exportCsv';
import { ExportButton } from './ExportButton';
import { Panel } from './Panel';
import type { TopSupplier } from '../types';

// Rank isn't stored -- it's the row's position in an already-sorted result, so
// it's derived here rather than read from a field.
const csvColumns = (suppliers: TopSupplier[]): CsvColumn<TopSupplier>[] => [
  { key: 'rank', label: 'Rank', csvValue: (row) => suppliers.indexOf(row) + 1 },
  { key: 'name', label: 'Supplier' },
  { key: 'total_spend', label: 'Total spend' },
  { key: 'pct_of_total', label: 'Share of total' },
];

// Combines the three disbursement sources that carry a supplier_id (PO
// payments, replenishments, additional payments) -- there was nowhere in
// the app to see where money concentrates by supplier before this.
export function TopSuppliersPanel({ suppliers }: { suppliers: TopSupplier[] }) {
  const maxPct = Math.max(...suppliers.map((s) => Number(s.pct_of_total ?? 0)), 0.0001);

  return (
    <Panel
      title="Top suppliers by spend"
      subtitle="PO payments, replenishments, and additional payments combined"
      action={<ExportButton rows={suppliers} columns={csvColumns(suppliers)} filename="top-suppliers" />}
    >
      {suppliers.length === 0 ? (
        <p className="text-sm text-ink-faint">No supplier-attributed spend recorded yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {suppliers.map((s, i) => {
            const pct = Number(s.pct_of_total ?? 0);
            // Relative to the LONGEST bar in this list, not to 100% of
            // spend -- suppliers rank against each other here, so #1
            // should visibly read as the longest bar, not a mostly-empty
            // track sized against a share nothing in the list is close to.
            const fillPct = (pct / maxPct) * 100;
            return (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-right text-xs font-semibold text-ink-faint">{i + 1}</span>
                <span className="w-40 shrink-0 truncate text-sm text-ink" title={s.name}>
                  {s.name}
                </span>
                {/* The bar is the flexible element, not the name -- a short
                    supplier name next to a fixed-width bar used to leave a
                    dead gap between them; now the bar itself absorbs
                    whatever width is available, so it reads as a real
                    ranked bar chart at any panel width. */}
                <div className="h-2.5 min-w-0 flex-1 rounded-full bg-accent-soft">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right font-mono text-sm text-ink">{formatMoney(s.total_spend)}</span>
                <span className="w-11 shrink-0 text-right text-xs text-ink-faint">{formatPercent(s.pct_of_total)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
