import { useCallback, useState } from 'react';
import { fetchJson } from '../lib/api';
import { toPageMeta } from '../lib/dataTablePage';
import { formatMoney } from '../lib/formatMoney';
import { PROJECT_ID } from '../hooks/useProjectData';
import { useRestoreAdditionalPayment, useVoidedAdditionalPayments } from '../hooks/useAdditionalPayments';
import { AdditionalPaymentFilters, type AdditionalPaymentFilterValues } from '../components/AdditionalPaymentFilters';
import { AdditionalPaymentForm } from '../components/AdditionalPaymentForm';
import { DataTable, type ColumnDef, type FetchParams } from '../components/DataTable';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusPill } from '../components/StatusPill';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { DeletedItemsModal } from '../components/DeletedItemsModal';
import type { AdditionalPayment, AdditionalPaymentListResponse } from '../types';

const columns: ColumnDef<AdditionalPayment>[] = [
  { key: 'txn_date', label: 'Date', sortable: true },
  { key: 'payee', label: 'Payee', cardTitle: true },
  { key: 'description', label: 'Description', cardSubtitle: true, render: (value) => (value as string) ?? '—' },
  {
    key: 'expense_type',
    label: 'Type',
    render: (value) => <span className="capitalize">{(value as string).replace('_', ' ')}</span>,
  },
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
    key: 'amount_php',
    label: 'Amount',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
  {
    key: 'voucher_no',
    label: 'Voucher',
    render: (value) => <span className="font-mono text-ink-faint">{(value as string) ?? '—'}</span>,
  },
  {
    key: 'needs_review',
    label: 'Review',
    render: (value) => (value ? <StatusPill tone="warn">Needs review</StatusPill> : '—'),
  },
];

export function AdditionalPayments() {
  const [needsReviewOnly, setNeedsReviewOnly] = useState<'all' | 'flagged'>('all');
  const [filters, setFilters] = useState<AdditionalPaymentFilterValues>({ date_from: '', date_to: '' });
  const [modal, setModal] = useState<'create' | AdditionalPayment | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const voidedQuery = useVoidedAdditionalPayments(showDeleted);
  const restoreMutation = useRestoreAdditionalPayment();

  const fetchData = useCallback(
    async ({ page, perPage, search, sortKey, sortDir, signal }: FetchParams) => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(perPage));
      if (search) params.set('q', search);
      if (sortKey) {
        params.set('sortKey', sortKey);
        params.set('sortDir', sortDir ?? 'asc');
      }
      if (needsReviewOnly === 'flagged') params.set('needs_review', '1');
      if (filters.expense_type) params.set('expense_type', filters.expense_type);
      if (filters.supplier_id) params.set('supplier_id', String(filters.supplier_id));
      if (filters.planning_line_id) params.set('planning_line_id', String(filters.planning_line_id));
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);

      const json = await fetchJson<AdditionalPaymentListResponse>(
        `/api/projects/${PROJECT_ID}/additional-payments?${params}`,
        { signal },
      );
      return { data: json.rows, meta: toPageMeta(json) };
    },
    [filters, needsReviewOnly],
  );

  function handleModalClose() {
    setModal(null);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">Additional Payments</h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowDeleted(true)}
            className="text-sm font-medium text-ink-muted hover:text-ink hover:underline"
          >
            Deleted items
          </button>
          <Button type="button" onClick={() => setModal('create')}>
            + New entry
          </Button>
        </div>
      </div>

      <SegmentedControl
        value={needsReviewOnly}
        onChange={setNeedsReviewOnly}
        options={[
          { label: 'All', value: 'all' },
          { label: 'Needs review', value: 'flagged' },
        ]}
      />

      <AdditionalPaymentFilters onChange={setFilters} />

      <DataTable<AdditionalPayment>
        columns={columns}
        fetchData={fetchData}
        rowKey="id"
        onView={(row) => setModal(row)}
        exportable
        title="Additional Payments"
        perPageOptions={[25, 50, 100]}
        searchPlaceholder="Search payee, description, or voucher no…"
        emptyMessage="No additional payments match these filters."
        refreshKey={refreshKey}
      />

      {modal && (
        <Modal title={modal === 'create' ? 'New additional payment' : 'Edit additional payment'} onClose={handleModalClose}>
          <AdditionalPaymentForm payment={modal === 'create' ? undefined : modal} onClose={handleModalClose} />
        </Modal>
      )}

      {showDeleted && (
        <DeletedItemsModal<AdditionalPayment>
          title="Deleted additional payments"
          items={voidedQuery.data?.rows}
          isLoading={voidedQuery.isLoading}
          onRestore={async (id) => {
            await restoreMutation.mutateAsync(id);
            setRefreshKey((k) => k + 1);
          }}
          onClose={() => setShowDeleted(false)}
          renderRow={(ap) => (
            <>
              <div className="font-medium">
                {ap.txn_date} — {ap.payee} — {formatMoney(ap.amount_php)}
              </div>
              <div className="text-xs text-ink-muted">{ap.description ?? '—'}</div>
              <div className="mt-1 text-xs text-ink-faint">
                Deleted {ap.voided_at} by {ap.voided_by}
                {ap.void_reason ? ` — "${ap.void_reason}"` : ''}
              </div>
            </>
          )}
        />
      )}
    </div>
  );
}
