import { formatMoney } from '../lib/formatMoney';
import type { BudgetRevision } from '../types';

export function BudgetRevisionsTable({ revisions }: { revisions: BudgetRevision[] }) {
  if (revisions.length === 0) {
    return <p className="text-sm text-ink-faint">No revisions logged yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-rule bg-surface shadow-card">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-surface-2 text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
            <th className="py-2.5 px-3.5">#</th>
            <th className="py-2.5 px-3.5">Effective</th>
            <th className="py-2.5 px-3.5 text-right">Before</th>
            <th className="py-2.5 px-3.5 text-right">After</th>
            <th className="py-2.5 px-3.5">Reason</th>
            <th className="py-2.5 px-3.5">Approved by</th>
          </tr>
        </thead>
        <tbody>
          {revisions.map((rev) => (
            <tr key={rev.id} className="border-t border-rule">
              <td className="py-1.5 px-3.5 whitespace-nowrap">{rev.revision_no}</td>
              <td className="py-1.5 px-3.5 whitespace-nowrap">{rev.effective_on}</td>
              <td className="py-1.5 px-3.5 text-right whitespace-nowrap font-mono tabular-nums">{formatMoney(rev.amount_before)}</td>
              <td className="py-1.5 px-3.5 text-right whitespace-nowrap font-mono tabular-nums">{formatMoney(rev.amount_after)}</td>
              <td className="min-w-[220px] py-1.5 px-3.5 whitespace-normal">{rev.reason ?? '—'}</td>
              <td className="py-1.5 px-3.5 whitespace-nowrap">{rev.approved_by ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
