import { Link } from 'react-router-dom';
import { useUnassignedPayrollEntries } from '../hooks/usePayroll';
import { formatMoney } from '../lib/formatMoney';
import { InlineJplCell } from './InlineJplCell';
import { Modal } from './Modal';
import { Skeleton } from './Skeleton';

// Picking a code here PATCHes the entry directly (InlineJplCell, same as the
// period detail page) -- the row drops off this list on its own once
// budget_item_id resolves, no separate "save" step.
export function UnassignedPayrollEntriesModal({ onClose }: { onClose: () => void }) {
  const { data: entries, isLoading } = useUnassignedPayrollEntries(true);

  return (
    <Modal title="Unassigned payroll entries" onClose={onClose}>
      <p className="mb-4 text-sm text-ink-muted">
        These entries have no JPL code, so they don't count toward any budget item. Pick a code for each to move it
        where it belongs.
      </p>

      {isLoading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4" />
          ))}
        </div>
      )}

      {entries && entries.length === 0 && <p className="text-sm text-ink-muted">Nothing unassigned right now.</p>}

      {entries && entries.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead className="text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
            <tr>
              <th className="border-b border-rule px-2 py-2 text-left">Week</th>
              <th className="border-b border-rule px-2 py-2 text-left">Worker</th>
              <th className="border-b border-rule px-2 py-2 text-right">Amount</th>
              <th className="border-b border-rule px-2 py-2 text-left">JPL code</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-2 py-2">
                  <Link to={`/payroll/${entry.payroll_period_id}`} className="text-accent hover:underline">
                    {entry.period_label}
                  </Link>
                </td>
                <td className="px-2 py-2 text-ink">{entry.worker_name}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-ink">{formatMoney(entry.amount)}</td>
                <td className="py-1">
                  <InlineJplCell entry={entry} periodId={entry.payroll_period_id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
