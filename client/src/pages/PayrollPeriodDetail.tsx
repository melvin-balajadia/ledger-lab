import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  useDeletePayrollEntries,
  useDeletePayrollEntry,
  usePayrollEntries,
  usePayrollPeriod,
  useRestorePayrollEntry,
  useUpdatePayrollPeriod,
  useVoidedPayrollEntries,
} from '../hooks/usePayroll';
import { clientPaginate } from '../lib/clientPaginate';
import { formatMoney } from '../lib/formatMoney';
import { DataTable, type ColumnDef, type FetchParams } from '../components/DataTable';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusPill } from '../components/StatusPill';
import { ReconciliationBadge } from '../components/ReconciliationBadge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { PayrollEntryForm } from '../components/PayrollEntryForm';
import { PayrollPeriodForm } from '../components/PayrollPeriodForm';
import { CopyRosterControl } from '../components/CopyRosterControl';
import { InlineAmountCell } from '../components/InlineAmountCell';
import { InlineJplCell } from '../components/InlineJplCell';
import { DeletedItemsModal } from '../components/DeletedItemsModal';
import { PayrollBudgetBreakdown } from '../components/PayrollBudgetBreakdown';
import type { PayrollEntry, PayrollWorkflowStatus } from '../types';
import type { Tone } from '../lib/tones';

const WORKFLOW_LABEL: Record<PayrollWorkflowStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  paid: 'Paid',
};

const WORKFLOW_TONE: Record<PayrollWorkflowStatus, Tone> = {
  draft: 'info',
  approved: 'warn',
  paid: 'success',
};

export function PayrollPeriodDetail() {
  const { id } = useParams();
  const periodId = Number(id);
  const navigate = useNavigate();
  const { data: period, isLoading, error } = usePayrollPeriod(periodId);
  const { data: entries } = usePayrollEntries(periodId);

  const updatePeriod = useUpdatePayrollPeriod();
  const deleteEntry = useDeletePayrollEntry(periodId);
  const deleteEntries = useDeletePayrollEntries(periodId);

  const columns: ColumnDef<PayrollEntry>[] = useMemo(
    () => [
      { key: 'worker_name', label: 'Worker', sortable: true, cardTitle: true },
      { key: 'position', label: 'Position', cardSubtitle: true, render: (value) => (value as string) ?? '—' },
      {
        key: 'planning_line_code',
        label: 'JPL Code',
        // Always-editable in place, same reasoning as the Amount column --
        // fixing a miscoded row (a common source of the accountant's own
        // manual-entry errors, per CLAUDE.md) shouldn't need a modal.
        render: (_value, row) => <InlineJplCell entry={row} periodId={periodId} />,
      },
      {
        key: 'amount',
        label: 'Amount',
        sortable: true,
        align: 'right',
        // Always-editable in place -- the common weekly action (typing
        // amounts for a copied-forward roster) shouldn't need a modal per
        // worker. The modal (via onEdit) stays available for the rarer
        // edit -- changing who's charged or which JPL code.
        render: (_value, row) => <InlineAmountCell entry={row} periodId={periodId} />,
      },
    ],
    [periodId],
  );

  const [entryModal, setEntryModal] = useState<'create' | PayrollEntry | null>(null);
  const [showEditPeriod, setShowEditPeriod] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState<PayrollEntry[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const voidedEntries = useVoidedPayrollEntries(periodId, showDeleted);
  const restoreEntry = useRestorePayrollEntry(periodId);

  const fetchEntries = useCallback(
    async (params: FetchParams) => clientPaginate(entries ?? [], params, ['worker_name', 'position']),
    [entries],
  );

  // Catches the one gap copy-roster's exact-pair matching can't: a worker
  // manually entered under the wrong code before copying ends up with two
  // rows (one per code) instead of the mistake being caught and merged.
  // Informational only -- not specific to copy-roster, so it also catches
  // the same situation however it happens (e.g. two manual adds by mistake).
  const duplicateWorkerNames = useMemo(() => {
    if (!entries) return [];
    const counts = new Map<number, number>();
    for (const e of entries) counts.set(e.worker_id, (counts.get(e.worker_id) ?? 0) + 1);
    const names = new Set<string>();
    for (const e of entries) {
      if ((counts.get(e.worker_id) ?? 0) > 1) names.add(e.worker_name);
    }
    return [...names];
  }, [entries]);

  function handleDelete(row: PayrollEntry) {
    if (window.confirm(`Remove ${row.worker_name}'s entry for this week?`)) {
      deleteEntry.mutate(row.id);
    }
  }

  function handleBulkDelete() {
    if (window.confirm(`Remove ${selectedEntries.length} selected entries for this week?`)) {
      deleteEntries.mutate(
        selectedEntries.map((row) => row.id),
        { onSuccess: () => setSelectedEntries([]) },
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/payroll" className="w-fit text-sm text-accent hover:underline">
        ← Back to Payroll
      </Link>

      {isLoading && <p className="text-[15px] text-ink-muted">Loading…</p>}
      {error && <p className="text-[15px] text-danger">Couldn't reach the API ({error.message}).</p>}

      {period && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-xl font-semibold text-ink">{period.label}</h2>
              <StatusPill tone={WORKFLOW_TONE[period.status]}>{WORKFLOW_LABEL[period.status]}</StatusPill>
              <ReconciliationBadge status={period.reconciliation_status} />
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setShowDeleted(true)}
                className="text-sm font-medium text-ink-muted hover:text-ink hover:underline"
              >
                Deleted entries
              </button>
              <button
                type="button"
                onClick={() => setShowEditPeriod(true)}
                className="rounded-sm border border-rule-strong px-3 py-1.5 text-sm text-ink-muted hover:bg-canvas"
              >
                Edit period
              </button>
            </div>
          </div>

          <SegmentedControl
            value={period.status}
            onChange={(status) => updatePeriod.mutate({ id: period.id, status })}
            options={[
              { label: 'Draft', value: 'draft' },
              { label: 'Approved', value: 'approved' },
              { label: 'Paid', value: 'paid' },
            ]}
          />

          <div className="grid grid-cols-1 gap-px border border-rule bg-rule sm:grid-cols-3">
            <Stat label="Weekly Sheet" value={formatMoney(period.control_total)} />
            <Stat label="Worker List" value={formatMoney(period.extracted_total)} />
            <Stat label="Difference" value={formatMoney(period.delta)} />
          </div>

          {entries && <PayrollBudgetBreakdown entries={entries} />}

          {duplicateWorkerNames.length > 0 && (
            <p className="rounded-sm border border-warn bg-warn-soft px-3 py-2 text-sm text-ink">
              {duplicateWorkerNames.length} worker{duplicateWorkerNames.length > 1 ? 's have' : ' has'} entries under
              more than one code this week — check these aren't duplicates: {duplicateWorkerNames.join(', ')}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <CopyRosterControl periodId={period.id} periodStart={period.period_start} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="self-start" onClick={() => setEntryModal('create')}>
              + Add entry
            </Button>
            {selectedEntries.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={deleteEntries.isPending}
                className="rounded-sm border border-danger px-4 py-2 text-sm text-danger hover:bg-danger-soft disabled:opacity-60"
              >
                {deleteEntries.isPending ? 'Deleting…' : `Delete ${selectedEntries.length} selected`}
              </button>
            )}
          </div>

          <DataTable<PayrollEntry>
            columns={columns}
            fetchData={fetchEntries}
            rowKey="id"
            onView={(row) => navigate(`/payroll/workers/${row.worker_id}`)}
            onEdit={(row) => setEntryModal(row)}
            onDelete={handleDelete}
            selectable
            onSelectionChange={setSelectedEntries}
            exportable
            title="Worker entries"
            perPageOptions={[10, 25, 50, 100]}
            searchPlaceholder="Search worker or position…"
            emptyMessage="No entries recorded for this week."
          />

          {entryModal && (
            <Modal title={entryModal === 'create' ? 'Add entry' : 'Edit entry'} onClose={() => setEntryModal(null)}>
              <PayrollEntryForm
                periodId={period.id}
                entry={entryModal === 'create' ? undefined : entryModal}
                onClose={() => setEntryModal(null)}
              />
            </Modal>
          )}

          {showEditPeriod && (
            <Modal title="Edit period" onClose={() => setShowEditPeriod(false)}>
              <PayrollPeriodForm period={period} onClose={() => setShowEditPeriod(false)} />
            </Modal>
          )}

          {showDeleted && (
            <DeletedItemsModal<PayrollEntry>
              title="Deleted entries — this week"
              items={voidedEntries.data}
              isLoading={voidedEntries.isLoading}
              onRestore={(id) => restoreEntry.mutateAsync(id)}
              onClose={() => setShowDeleted(false)}
              renderRow={(e) => (
                <>
                  <div className="font-medium">
                    {e.worker_name} — {e.planning_line_code ?? 'no JPL code'} — {formatMoney(e.amount)}
                  </div>
                  {e.void_reason && <div className="mt-1 text-xs text-ink-faint">&quot;{e.void_reason}&quot;</div>}
                </>
              )}
            />
          )}
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
