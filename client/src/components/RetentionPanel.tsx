import { formatMoney, formatPercent } from '../lib/formatMoney';
import type { RetentionSummary } from '../types';

// Retention held is not a payable -- CLAUDE.md is explicit that it must
// never be folded into an outstanding balance. This used to be a single
// alert-feed sentence; now it's its own section with the full per-PO
// breakdown, using the same v_po_retention data that sentence summarized.
export function RetentionPanel({ data }: { data: RetentionSummary }) {
  return (
    <div className="rounded-md border border-rule bg-surface p-5 shadow-card">
      <div className="mb-4">
        <p className="text-sm font-semibold text-ink">Retention held</p>
        <p className="text-xs text-ink-faint">
          Not a payable — held until the milestone is reached, never counted in an outstanding balance
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Held" value={formatMoney(data.total_held)} />
        <Stat label="Released" value={formatMoney(data.total_released)} />
        <Stat label="Outstanding" value={formatMoney(data.total_outstanding)} />
      </div>

      {data.pos.length === 0 ? (
        <p className="text-sm text-ink-faint">No purchase orders currently carry a retention holdback.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-150 border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                <th className="py-1.5 pr-3">PO No.</th>
                <th className="py-1.5 pr-3">Supplier</th>
                <th className="py-1.5 pr-3 text-right">Rate</th>
                <th className="py-1.5 pr-3 text-right">Held</th>
                <th className="py-1.5 pr-3 text-right">Released</th>
                <th className="py-1.5 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.pos.map((p) => (
                <tr key={p.id} className="border-t border-rule">
                  <td className="py-1.5 pr-3 font-mono">{p.por_no}</td>
                  <td className="py-1.5 pr-3">{p.supplier}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatPercent(p.retention_pct)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{formatMoney(p.retention_amount)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{formatMoney(p.retention_released)}</td>
                  <td className="py-1.5 text-right font-mono">{formatMoney(p.retention_outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className="font-mono text-base font-semibold text-ink">{value}</span>
    </div>
  );
}
