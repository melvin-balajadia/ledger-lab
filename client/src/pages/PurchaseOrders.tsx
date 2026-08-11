import { useCallback, useMemo, useState } from 'react';
import { fetchJson } from '../lib/api';
import { toPageMeta } from '../lib/dataTablePage';
import { formatMoney } from '../lib/formatMoney';
import { budgetItemKeyAndLabel, groupByBudgetItem } from '../lib/budgetItemGrouping';
import { PROJECT_ID } from '../hooks/useProjectData';
import { useRestorePurchaseOrder, useVoidedPurchaseOrders } from '../hooks/usePurchaseOrders';
import { useRetentionSummary } from '../hooks/useDashboardAnalytics';
import { useTableUrlState } from '../hooks/useTableUrlState';
import { PurchaseOrderFilters, type PurchaseOrderFilterValues } from '../components/PurchaseOrderFilters';
import { PurchaseOrderDetail } from '../components/PurchaseOrderDetail';
import { PurchaseOrderForm } from '../components/PurchaseOrderForm';
import { DataTable, type ColumnDef, type FetchParams } from '../components/DataTable';
import { SegmentedControl } from '../components/SegmentedControl';
import { ProgressBar } from '../components/ProgressBar';
import { StatusPill } from '../components/StatusPill';
import { SummaryStats } from '../components/SummaryStats';
import { BudgetItemBreakdown } from '../components/BudgetItemBreakdown';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { DeletedItemsModal } from '../components/DeletedItemsModal';
import type { Tone } from '../lib/tones';
import type { PurchaseOrder, PurchaseOrderListResponse, PurchaseOrderSummary, VoidedPurchaseOrder } from '../types';

const STATUS_LABEL: Record<PurchaseOrder['status'], string> = {
  open: 'Open',
  partially_paid: 'Partially paid',
  fully_paid: 'Fully paid',
  cancelled: 'Cancelled',
};

const STATUS_TONE: Record<PurchaseOrder['status'], Tone> = {
  open: 'info',
  partially_paid: 'warn',
  fully_paid: 'success',
  cancelled: 'info',
};

const columns: ColumnDef<PurchaseOrder>[] = [
  { key: 'por_no', label: 'PO No.', sortable: true, cardTitle: true },
  { key: 'supplier', label: 'Supplier', cardSubtitle: true },
  {
    key: 'item_no',
    label: 'Budget Item',
    render: (value, row) => (value ? `${value as string} ${row.budget_item ?? ''}` : '—'),
  },
  {
    key: 'contract_amount_php',
    label: 'Contract',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
  {
    key: 'paid_php',
    label: 'Paid',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
  {
    key: 'balance_php',
    label: 'Balance',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
  {
    key: 'pct_paid',
    label: '% Paid',
    // Paid exceeding contract is an anomaly (see the overpaid-PO data-quality
    // finding), not a healthy "on track" state -- flag it red, not green.
    render: (value) => (
      <ProgressBar ratio={value as string | null} danger={value != null && Number(value) > 1} />
    ),
  },
  {
    key: 'status',
    label: 'Status',
    render: (value) => <StatusPill tone={STATUS_TONE[value as PurchaseOrder['status']]}>{STATUS_LABEL[value as PurchaseOrder['status']]}</StatusPill>,
  },
];

export function PurchaseOrders() {
  const [outstandingOnly, setOutstandingOnly] = useState<'all' | 'outstanding'>('all');
  const [filters, setFilters] = useState<PurchaseOrderFilterValues>({ date_from: '', date_to: '' });
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDeleted, setShowDeleted] = useState(false);
  const [summary, setSummary] = useState<PurchaseOrderSummary | null>(null);
  const voidedQuery = useVoidedPurchaseOrders(showDeleted);
  const restoreMutation = useRestorePurchaseOrder();
  // Retention held is never folded into the contract/paid/balance totals
  // above (CLAUDE.md) -- pulled from the same source RetentionPanel uses.
  const retentionQuery = useRetentionSummary();
  const { syncToUrl, buildFetchParams } = useTableUrlState({ prefix: 'po', filterKeys: [], defaultPerPage: 10 });

  const fetchData = useCallback(
    async (fetchParams: FetchParams) => {
      const { page, perPage, search, sortKey, sortDir, signal } = fetchParams;
      syncToUrl(fetchParams);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(perPage));
      if (search) params.set('q', search);
      if (sortKey) {
        params.set('sortKey', sortKey);
        params.set('sortDir', sortDir ?? 'asc');
      }
      if (outstandingOnly === 'outstanding') params.set('outstanding', '1');
      if (filters.status) params.set('status', filters.status);
      if (filters.supplier_id) params.set('supplier_id', String(filters.supplier_id));
      if (filters.budget_item_id) params.set('budget_item_id', String(filters.budget_item_id));
      if (filters.planning_line_id) params.set('planning_line_id', String(filters.planning_line_id));
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);

      const json = await fetchJson<PurchaseOrderListResponse>(
        `/api/projects/${PROJECT_ID}/purchase-orders?${params}`,
        { signal },
      );
      setSummary(json.summary);
      return { data: json.rows, meta: toPageMeta(json) };
    },
    [filters, outstandingOnly, syncToUrl],
  );

  const budgetItemGroups = useMemo(
    () =>
      groupByBudgetItem(
        (summary?.by_budget_item ?? []).map((r) => {
          const { key, label } = budgetItemKeyAndLabel(r.budget_item_id, r.budget_item_no, r.budget_item_description);
          return {
            budgetItemKey: key,
            budgetItemLabel: label,
            codeLabel: r.planning_line_code ?? 'No JPL code',
            amount: r.total,
          };
        }),
      ),
    [summary],
  );

  function closeDetail() {
    setSelected(null);
    setRefreshKey((k) => k + 1);
  }

  function closeCreate() {
    setCreating(false);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">Purchase Orders</h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowDeleted(true)}
            className="text-sm font-medium text-ink-muted hover:text-ink hover:underline"
          >
            Deleted items
          </button>
          <Button type="button" onClick={() => setCreating(true)}>
            + New PO
          </Button>
        </div>
      </div>

      {summary && (
        <SummaryStats
          stats={[
            { label: 'Total contract', value: formatMoney(summary.total_contract) },
            { label: 'Total paid', value: formatMoney(summary.total_paid) },
            { label: 'Balance vs. contract', value: formatMoney(summary.total_balance) },
            { label: 'Outstanding POs', value: summary.outstanding_count.toLocaleString() },
          ]}
          breakdown={
            retentionQuery.data
              ? [{ label: 'Retention held', value: formatMoney(retentionQuery.data.total_held) }]
              : undefined
          }
        />
      )}

      <BudgetItemBreakdown groups={budgetItemGroups} title="By budget item (contract amount)" />

      <SegmentedControl
        value={outstandingOnly}
        onChange={setOutstandingOnly}
        options={[
          { label: 'All', value: 'all' },
          { label: 'Outstanding only', value: 'outstanding' },
        ]}
      />

      <PurchaseOrderFilters onChange={setFilters} />

      <DataTable<PurchaseOrder>
        columns={columns}
        fetchData={fetchData}
        rowKey="id"
        onView={(row) => setSelected(row)}
        exportable
        title="Purchase Orders"
        perPageOptions={[10, 25, 50, 100]}
        searchPlaceholder="Search PO no. or description…"
        emptyMessage="No purchase orders match these filters."
        refreshKey={refreshKey}
        initialState={buildFetchParams()}
      />

      {selected && (
        <Modal title={`${selected.por_no} — ${selected.supplier}`} onClose={closeDetail}>
          <PurchaseOrderDetail poId={selected.id} onClose={closeDetail} />
        </Modal>
      )}

      {creating && (
        <Modal title="New purchase order" onClose={closeCreate}>
          <PurchaseOrderForm onClose={closeCreate} />
        </Modal>
      )}

      {showDeleted && (
        <DeletedItemsModal<VoidedPurchaseOrder>
          title="Deleted purchase orders"
          items={voidedQuery.data}
          isLoading={voidedQuery.isLoading}
          onRestore={async (id) => {
            await restoreMutation.mutateAsync(id);
            setRefreshKey((k) => k + 1);
          }}
          onClose={() => setShowDeleted(false)}
          renderRow={(po) => (
            <>
              <div className="font-medium">
                {po.por_no} — {po.supplier} — {formatMoney(po.contract_amount_php)}
              </div>
              <div className="text-xs text-ink-muted">{po.po_date ?? '—'}</div>
              <div className="mt-1 text-xs text-ink-faint">
                Deleted {po.voided_at} by {po.voided_by}
                {po.void_reason ? ` — "${po.void_reason}"` : ''}
              </div>
            </>
          )}
        />
      )}
    </div>
  );
}
