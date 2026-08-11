import { useCallback, useMemo, useState } from 'react';
import { fetchJson } from '../lib/api';
import { toPageMeta } from '../lib/dataTablePage';
import { formatMoney } from '../lib/formatMoney';
import { budgetItemKeyAndLabel, groupByBudgetItem } from '../lib/budgetItemGrouping';
import { PROJECT_ID } from '../hooks/useProjectData';
import { useRestoreAdditionalPayment, useVoidedAdditionalPayments } from '../hooks/useAdditionalPayments';
import { useTableUrlState } from '../hooks/useTableUrlState';
import { AdditionalPaymentFilters, type AdditionalPaymentFilterValues } from '../components/AdditionalPaymentFilters';
import { AdditionalPaymentForm } from '../components/AdditionalPaymentForm';
import { DataTable, type ColumnDef, type FetchParams } from '../components/DataTable';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusPill } from '../components/StatusPill';
import { SummaryStats } from '../components/SummaryStats';
import { BudgetItemBreakdown } from '../components/BudgetItemBreakdown';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { DeletedItemsModal } from '../components/DeletedItemsModal';
import type { AdditionalPayment, AdditionalPaymentListResponse, AdditionalPaymentSummary } from '../types';

// 'customs_duty' -> 'Customs duty' -- same casing as the Type column's
// capitalize-and-un-underscore treatment, just done once for the summary row.
function expenseTypeLabel(type: string): string {
  const spaced = type.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

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
  const [summary, setSummary] = useState<AdditionalPaymentSummary | null>(null);
  const voidedQuery = useVoidedAdditionalPayments(showDeleted);
  const restoreMutation = useRestoreAdditionalPayment();
  const { syncToUrl, buildFetchParams } = useTableUrlState({ prefix: 'ap', filterKeys: [], defaultPerPage: 10 });

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
      setSummary(json.summary);
      return { data: json.rows, meta: toPageMeta(json) };
    },
    [filters, needsReviewOnly, syncToUrl],
  );

  function handleModalClose() {
    setModal(null);
    setRefreshKey((k) => k + 1);
  }

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

      {summary && (
        <SummaryStats
          stats={[
            { label: 'Total (cash out)', value: formatMoney(summary.total_amount) },
            { label: 'Entries', value: summary.row_count.toLocaleString() },
            {
              label: 'Needs review',
              value: summary.needs_review_count.toLocaleString(),
              tone: summary.needs_review_count > 0 ? 'warn' : undefined,
            },
          ]}
          breakdown={summary.by_expense_type.map((t) => ({
            label: expenseTypeLabel(t.expense_type),
            value: formatMoney(t.total),
          }))}
        />
      )}

      <BudgetItemBreakdown groups={budgetItemGroups} />

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
        perPageOptions={[10, 25, 50, 100]}
        searchPlaceholder="Search payee, description, or voucher no…"
        emptyMessage="No additional payments match these filters."
        refreshKey={refreshKey}
        initialState={buildFetchParams()}
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
