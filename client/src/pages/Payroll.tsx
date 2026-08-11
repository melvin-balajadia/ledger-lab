import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '../lib/api';
import { toPageMeta } from '../lib/dataTablePage';
import { formatMoney } from '../lib/formatMoney';
import { PROJECT_ID } from '../hooks/useProjectData';
import { useTableUrlState } from '../hooks/useTableUrlState';
import { PayrollPeriodFilters, type PayrollPeriodFilterValues } from '../components/PayrollPeriodFilters';
import { WorkerFilters, type WorkerFilterValues } from '../components/WorkerFilters';
import { WorkerForm } from '../components/WorkerForm';
import { PayrollPeriodForm } from '../components/PayrollPeriodForm';
import { DataTable, type ColumnDef, type FetchParams } from '../components/DataTable';
import { SegmentedControl } from '../components/SegmentedControl';
import { StatusPill } from '../components/StatusPill';
import { SummaryStats } from '../components/SummaryStats';
import { ReconciliationBadge } from '../components/ReconciliationBadge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import type { Tone } from '../lib/tones';
import type {
  PayrollPeriod,
  PayrollPeriodListResponse,
  PayrollPeriodSummary,
  PayrollWorkflowStatus,
  Worker,
  WorkerListResponse,
  WorkerSummary,
} from '../types';

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

const periodColumns: ColumnDef<PayrollPeriod>[] = [
  {
    key: 'period_start',
    label: 'Week',
    sortable: true,
    cardTitle: true,
    render: (_value, row) => row.label as string,
  },
  {
    key: 'status',
    label: 'Workflow',
    render: (value) => (
      <StatusPill tone={WORKFLOW_TONE[value as PayrollWorkflowStatus]}>
        {WORKFLOW_LABEL[value as PayrollWorkflowStatus]}
      </StatusPill>
    ),
  },
  {
    key: 'control_total',
    label: 'Weekly Sheet',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
  {
    key: 'extracted_total',
    label: 'Worker List',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
  {
    key: 'delta',
    label: 'Difference',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
  {
    key: 'reconciliation_status',
    label: 'Reconciliation',
    cardSubtitle: true,
    render: (value) => <ReconciliationBadge status={value as PayrollPeriod['reconciliation_status']} />,
  },
];

const workerColumns: ColumnDef<Worker>[] = [
  { key: 'employee_no', label: 'Employee No.', render: (value) => (value as string) ?? '—' },
  { key: 'full_name', label: 'Full Name', sortable: true, cardTitle: true },
  { key: 'position', label: 'Position', cardSubtitle: true, render: (value) => (value as string) ?? '—' },
  {
    key: 'is_active',
    label: 'Status',
    render: (value) =>
      value ? <StatusPill tone="success">Active</StatusPill> : <StatusPill tone="info">Separated</StatusPill>,
  },
  {
    key: 'total_earned',
    label: 'Total Earned',
    sortable: true,
    align: 'right',
    render: (value) => <span className="font-mono">{formatMoney(value as string)}</span>,
  },
];

export function Payroll() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'periods' | 'workers'>('periods');

  const [attentionOnly, setAttentionOnly] = useState<'all' | 'attention'>('all');
  const [periodFilters, setPeriodFilters] = useState<PayrollPeriodFilterValues>({ date_from: '', date_to: '' });

  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'separated'>('all');
  const [workerFilters, setWorkerFilters] = useState<WorkerFilterValues>({ position: '' });
  const [workerModal, setWorkerModal] = useState<'create' | Worker | null>(null);
  const [workerRefreshKey, setWorkerRefreshKey] = useState(0);
  const [showNewPeriod, setShowNewPeriod] = useState(false);
  const [periodSummary, setPeriodSummary] = useState<PayrollPeriodSummary | null>(null);
  const [workerSummary, setWorkerSummary] = useState<WorkerSummary | null>(null);
  // Distinct prefixes -- "By Week" and "By Worker" are two separate
  // DataTables sharing this one route, so their page/sort/search state
  // (and the sessionStorage/URL keys the hook stores it under) must not collide.
  const { syncToUrl: syncPeriodsToUrl, buildFetchParams: buildPeriodsFetchParams } = useTableUrlState({
    prefix: 'payp',
    filterKeys: [],
    defaultPerPage: 10,
  });
  const { syncToUrl: syncWorkersToUrl, buildFetchParams: buildWorkersFetchParams } = useTableUrlState({
    prefix: 'payw',
    filterKeys: [],
    defaultPerPage: 10,
  });

  const fetchPeriods = useCallback(
    async (fetchParams: FetchParams) => {
      const { page, perPage, search, sortKey, sortDir, signal } = fetchParams;
      syncPeriodsToUrl(fetchParams);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(perPage));
      if (search) params.set('q', search);
      if (sortKey) {
        params.set('sortKey', sortKey);
        params.set('sortDir', sortDir ?? 'asc');
      }
      if (periodFilters.date_from) params.set('date_from', periodFilters.date_from);
      if (periodFilters.date_to) params.set('date_to', periodFilters.date_to);
      if (periodFilters.workflow_status) params.set('workflow_status', periodFilters.workflow_status);
      if (periodFilters.reconciliation_status) {
        params.set('reconciliation_status', periodFilters.reconciliation_status);
      } else if (attentionOnly === 'attention') {
        params.set('reconciliation_status', 'attention');
      }

      const json = await fetchJson<PayrollPeriodListResponse>(
        `/api/projects/${PROJECT_ID}/payroll-periods?${params}`,
        { signal },
      );
      setPeriodSummary(json.summary);
      return { data: json.rows, meta: toPageMeta(json) };
    },
    [periodFilters, attentionOnly, syncPeriodsToUrl],
  );

  const fetchWorkers = useCallback(
    async (fetchParams: FetchParams) => {
      const { page, perPage, search, sortKey, sortDir, signal } = fetchParams;
      syncWorkersToUrl(fetchParams);
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(perPage));
      if (search) params.set('search', search);
      if (sortKey) {
        params.set('sortKey', sortKey);
        params.set('sortDir', sortDir ?? 'asc');
      }
      if (workerFilters.position) params.set('position', workerFilters.position);
      if (activeFilter !== 'all') params.set('is_active', activeFilter === 'active' ? '1' : '0');

      const json = await fetchJson<WorkerListResponse>(`/api/projects/${PROJECT_ID}/workers?${params}`, { signal });
      setWorkerSummary(json.summary);
      return { data: json.rows, meta: toPageMeta(json) };
    },
    [workerFilters, activeFilter, syncWorkersToUrl],
  );

  function handleWorkerModalClose() {
    setWorkerModal(null);
    setWorkerRefreshKey((k) => k + 1);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-semibold text-ink">Payroll</h2>
        <div className="flex items-center gap-3">
          {viewMode === 'periods' && (
            <Button type="button" onClick={() => setShowNewPeriod(true)}>
              + New period
            </Button>
          )}
          {viewMode === 'workers' && (
            <Button type="button" onClick={() => setWorkerModal('create')}>
              + New worker
            </Button>
          )}
          <div className="flex gap-1 self-start rounded-sm border border-rule-strong p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('periods')}
              className={`rounded-sm px-3 py-1.5 text-sm font-medium ${viewMode === 'periods' ? 'bg-accent text-white' : 'text-ink-muted'}`}
            >
              By Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('workers')}
              className={`rounded-sm px-3 py-1.5 text-sm font-medium ${viewMode === 'workers' ? 'bg-accent text-white' : 'text-ink-muted'}`}
            >
              By Worker
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'periods' ? (
        <>
          {periodSummary && (
            <SummaryStats
              stats={[
                { label: 'Total weekly sheet', value: formatMoney(periodSummary.total_control) },
                { label: 'Total worker list', value: formatMoney(periodSummary.total_extracted) },
                { label: 'Total difference', value: formatMoney(periodSummary.total_delta) },
                {
                  label: 'Needs attention',
                  value: periodSummary.attention_count.toLocaleString(),
                  tone: periodSummary.attention_count > 0 ? 'warn' : undefined,
                },
              ]}
            />
          )}

          <SegmentedControl
            value={attentionOnly}
            onChange={setAttentionOnly}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Needs attention', value: 'attention' },
            ]}
          />
          <PayrollPeriodFilters onChange={setPeriodFilters} />
          <DataTable<PayrollPeriod>
            key="periods"
            columns={periodColumns}
            fetchData={fetchPeriods}
            rowKey="id"
            onView={(row) => navigate(`/payroll/${row.id}`)}
            exportable
            title="Payroll periods"
            perPageOptions={[10, 25, 50, 100]}
            searchPlaceholder="Search week label…"
            emptyMessage="No payroll periods match these filters."
            initialState={buildPeriodsFetchParams()}
          />
        </>
      ) : (
        <>
          {workerSummary && (
            <SummaryStats
              stats={[
                { label: 'Total earned', value: formatMoney(workerSummary.total_earned) },
                { label: 'Workers', value: workerSummary.row_count.toLocaleString() },
              ]}
            />
          )}

          <SegmentedControl
            value={activeFilter}
            onChange={setActiveFilter}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Separated', value: 'separated' },
            ]}
          />
          <WorkerFilters onChange={setWorkerFilters} />
          <DataTable<Worker>
            key="workers"
            columns={workerColumns}
            fetchData={fetchWorkers}
            rowKey="id"
            onView={(row) => navigate(`/payroll/workers/${row.id}`)}
            onEdit={(row) => setWorkerModal(row)}
            exportable
            title="Workers"
            perPageOptions={[10, 25, 50, 100]}
            searchPlaceholder="Search worker name…"
            emptyMessage="No workers match these filters."
            refreshKey={workerRefreshKey}
            initialState={buildWorkersFetchParams()}
          />
        </>
      )}

      {workerModal && (
        <Modal title={workerModal === 'create' ? 'New worker' : 'Edit worker'} onClose={handleWorkerModalClose}>
          <WorkerForm worker={workerModal === 'create' ? undefined : workerModal} onClose={handleWorkerModalClose} />
        </Modal>
      )}

      {showNewPeriod && (
        <Modal title="New payroll period" onClose={() => setShowNewPeriod(false)}>
          <PayrollPeriodForm
            onClose={() => setShowNewPeriod(false)}
            onCreated={(created) => navigate(`/payroll/${created.id}`)}
          />
        </Modal>
      )}
    </div>
  );
}
