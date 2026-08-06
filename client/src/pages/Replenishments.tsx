import { useCallback, useState } from 'react';
import { fetchJson } from '../lib/api';
import { toPageMeta } from '../lib/dataTablePage';
import { formatMoney } from '../lib/formatMoney';
import { PROJECT_ID } from '../hooks/useProjectData';
import { useRestoreReplenishment, useVoidedReplenishments } from '../hooks/useReplenishments';
import { ReplenishmentFilters, type FilterValues } from '../components/ReplenishmentFilters';
import { ReplenishmentForm } from '../components/ReplenishmentForm';
import { DataTable, type ColumnDef, type FetchParams } from '../components/DataTable';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusPill } from '../components/StatusPill';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { DeletedItemsModal } from '../components/DeletedItemsModal';
import type { Replenishment, ReplenishmentListResponse } from '../types';

const columns: ColumnDef<Replenishment>[] = [
  { key: 'txn_date', label: 'Date', sortable: true },
  { key: 'supplier_name', label: 'Supplier', cardTitle: true },
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
  { key: 'item_description', label: 'Description', cardSubtitle: true },
  {
    key: 'ref_no',
    label: 'Reference',
    render: (value) => <span className="font-mono text-ink-faint">{(value as string) ?? '—'}</span>,
  },
  { key: 'ref_type', label: 'Ref Type', render: (value) => (value as string) ?? '—' },
  {
    key: 'amount',
    label: 'Amount',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
  {
    key: 'needs_review',
    label: 'Status',
    render: (value) =>
      value ? <StatusPill tone="warn">Needs review</StatusPill> : <StatusPill tone="success">OK</StatusPill>,
  },
];

export function Replenishments() {
  const [needsReviewOnly, setNeedsReviewOnly] = useState<'all' | 'flagged'>('all');
  const [filters, setFilters] = useState<FilterValues>({ date_from: '', date_to: '' });
  const [modal, setModal] = useState<'create' | Replenishment | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const voidedQuery = useVoidedReplenishments(showDeleted);
  const restoreMutation = useRestoreReplenishment();

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
      if (filters.ref_type) params.set('ref_type', filters.ref_type);
      if (filters.supplier_id) params.set('supplier_id', String(filters.supplier_id));
      if (filters.planning_line_id) params.set('planning_line_id', String(filters.planning_line_id));
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);

      const json = await fetchJson<ReplenishmentListResponse>(
        `/api/projects/${PROJECT_ID}/replenishments?${params}`,
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
        <h2 className="font-display text-xl font-semibold text-ink">Replenishments</h2>
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

      <ReplenishmentFilters onChange={setFilters} />

      <DataTable<Replenishment>
        columns={columns}
        fetchData={fetchData}
        rowKey="id"
        onView={(row) => setModal(row)}
        exportable
        title="Replenishments"
        perPageOptions={[50, 100, 200]}
        searchPlaceholder="Search description or ref no…"
        emptyMessage="No replenishments match these filters."
        refreshKey={refreshKey}
      />

      {modal && (
        <Modal title={modal === 'create' ? 'New replenishment' : 'Edit replenishment'} onClose={handleModalClose}>
          <ReplenishmentForm replenishment={modal === 'create' ? undefined : modal} onClose={handleModalClose} />
        </Modal>
      )}

      {showDeleted && (
        <DeletedItemsModal<Replenishment>
          title="Deleted replenishments"
          items={voidedQuery.data?.rows}
          isLoading={voidedQuery.isLoading}
          onRestore={async (id) => {
            await restoreMutation.mutateAsync(id);
            setRefreshKey((k) => k + 1);
          }}
          onClose={() => setShowDeleted(false)}
          renderRow={(r) => (
            <>
              <div className="font-medium">
                {r.txn_date} — {r.supplier_name ?? 'No supplier'} — {formatMoney(r.amount)}
              </div>
              <div className="text-xs text-ink-muted">{r.item_description ?? '—'}</div>
              <div className="mt-1 text-xs text-ink-faint">
                Deleted {r.voided_at} by {r.voided_by}
                {r.void_reason ? ` — "${r.void_reason}"` : ''}
              </div>
            </>
          )}
        />
      )}
    </div>
  );
}
