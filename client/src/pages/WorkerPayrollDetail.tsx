import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkerPayrollEntries } from '../hooks/useWorkers';
import { clientPaginate } from '../lib/clientPaginate';
import { formatMoney, sumMoney } from '../lib/formatMoney';
import { DataTable, type ColumnDef, type FetchParams } from '../components/DataTable';
import { StatusPill } from '../components/StatusPill';
import type { WorkerPayrollEntry } from '../types';

const columns: ColumnDef<WorkerPayrollEntry>[] = [
  { key: 'period_start', label: 'Week', sortable: true, cardTitle: true, render: (_value, row) => row.period_label as string },
  {
    key: 'planning_line_code',
    label: 'JPL Code',
    render: (value) =>
      value ? (
        <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
          {value as string}
        </span>
      ) : (
        '—'
      ),
  },
  {
    key: 'amount',
    label: 'Amount',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
];

export function WorkerPayrollDetail() {
  const { id } = useParams();
  const workerId = Number(id);
  const { data, isLoading, error } = useWorkerPayrollEntries(workerId);

  const fetchEntries = useCallback(
    async (params: FetchParams) => clientPaginate(data?.entries ?? [], params, ['period_label', 'planning_line_code']),
    [data],
  );

  const totalEarned = data ? sumMoney(data.entries.map((e) => e.amount)) : '0.00';

  return (
    <div className="flex flex-col gap-6">
      <Link to="/payroll" className="w-fit text-sm text-accent hover:underline">
        ← Back to Payroll
      </Link>

      {isLoading && <p className="text-[15px] text-ink-muted">Loading…</p>}
      {error && <p className="text-[15px] text-danger">Couldn't reach the API ({error.message}).</p>}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">{data.worker.full_name}</h2>
            {data.worker.is_active ? (
              <StatusPill tone="success">Active</StatusPill>
            ) : (
              <StatusPill tone="info">Separated</StatusPill>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            {data.worker.position ?? '—'}
            {data.worker.employee_no ? ` · Employee No. ${data.worker.employee_no}` : ''}
          </p>

          <div className="grid grid-cols-1 gap-px border border-rule bg-rule sm:grid-cols-2">
            <Stat label="Total Earned" value={formatMoney(totalEarned)} />
            <Stat label="Weeks Worked" value={String(data.entries.length)} />
          </div>

          <DataTable<WorkerPayrollEntry>
            columns={columns}
            fetchData={fetchEntries}
            rowKey="id"
            exportable
            title="Payroll history"
            perPageOptions={[25, 50, 100]}
            searchPlaceholder="Search week or JPL code…"
            emptyMessage="No payroll entries recorded for this worker."
          />
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface p-5">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className="font-display text-2xl tabular-nums text-ink">{value}</span>
    </div>
  );
}
