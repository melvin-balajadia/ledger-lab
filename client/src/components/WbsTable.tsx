import { formatMoney, sumMoney } from '../lib/formatMoney';
import { compareCodes } from '../lib/sortCodes';
import { IconPenLine } from './icons';
import { StatusPill } from './StatusPill';
import type { WbsRow } from '../types';

export function WbsTable({ rows, onEdit }: { onEdit?: (row: WbsRow) => void; rows: WbsRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-ink-faint">No JPL / WBS codes recorded under this item.</p>;
  }

  const sorted = [...rows].sort((a, b) => compareCodes(a.code, b.code));
  const total = sumMoney(sorted.map((row) => row.total_spend));

  return (
    <div className="overflow-x-auto rounded-md border border-rule bg-surface shadow-card">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            <th className="py-2.5 px-3.5">Code</th>
            <th className="py-2.5 px-3.5 text-right">Replenishments</th>
            <th className="py-2.5 px-3.5 text-right">PO Paid</th>
            <th className="py-2.5 px-3.5 text-right">Cash Advances</th>
            <th className="py-2.5 px-3.5 text-right">Additional</th>
            <th className="py-2.5 px-3.5 text-right">Labor</th>
            <th className="py-2.5 px-3.5 text-right">Total</th>
            {onEdit && <th className="py-2.5 px-3.5" />}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.planning_line_id} className="border-t border-rule">
              <td className="py-1.5 px-3.5 whitespace-nowrap" style={{ paddingLeft: `${(row.depth - 2) * 1 + 0.875}rem` }}>
                <span className="inline-flex items-center gap-2">
                  {row.description ? `${row.code} ${row.description}` : row.code}
                  {row.is_active === 0 && <StatusPill tone="info">Inactive</StatusPill>}
                </span>
              </td>
              <td className="py-1.5 px-3.5 text-right font-mono tabular-nums">{formatMoney(row.replen_amount)}</td>
              <td className="py-1.5 px-3.5 text-right font-mono tabular-nums">{formatMoney(row.po_paid_amount)}</td>
              <td className="py-1.5 px-3.5 text-right font-mono tabular-nums">{formatMoney(row.cash_advance_amount)}</td>
              <td className="py-1.5 px-3.5 text-right font-mono tabular-nums">{formatMoney(row.additional_payment_amount)}</td>
              <td className="py-1.5 px-3.5 text-right font-mono tabular-nums">{formatMoney(row.labor_amount)}</td>
              <td className="py-1.5 px-3.5 text-right font-mono font-semibold tabular-nums">{formatMoney(row.total_spend)}</td>
              {onEdit && (
                <td className="py-1.5 px-3.5 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    aria-label={`Edit ${row.code}`}
                    className="text-ink-faint hover:text-accent"
                  >
                    <IconPenLine className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink font-semibold">
            <td className="py-1.5 px-3.5">Total</td>
            <td className="py-1.5 px-3.5" />
            <td className="py-1.5 px-3.5" />
            <td className="py-1.5 px-3.5" />
            <td className="py-1.5 px-3.5" />
            <td className="py-1.5 px-3.5" />
            <td className="py-1.5 px-3.5 text-right font-mono tabular-nums">{formatMoney(total)}</td>
            {onEdit && <td className="py-1.5 px-3.5" />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
