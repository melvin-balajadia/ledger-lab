import { useState } from 'react';
import { IconCalendar, IconFilter } from './icons';
import type { PayrollWorkflowStatus, ReconciliationStatus } from '../types';

export interface PayrollPeriodFilterValues {
  date_from: string;
  date_to: string;
  workflow_status?: PayrollWorkflowStatus;
  reconciliation_status?: ReconciliationStatus;
}

const WORKFLOW_OPTIONS: { label: string; value: PayrollWorkflowStatus }[] = [
  { label: 'Draft', value: 'draft' },
  { label: 'Approved', value: 'approved' },
  { label: 'Paid', value: 'paid' },
];

const RECONCILIATION_OPTIONS: { label: string; value: ReconciliationStatus }[] = [
  { label: 'OK', value: 'ok' },
  { label: 'Needs review', value: 'review' },
  { label: 'No control total', value: 'no_control' },
  { label: 'No worker entries', value: 'no_entries' },
];

// A single always-visible filter bar, matching the ReplenishmentFilters /
// PurchaseOrderFilters pattern -- the quick "Needs attention" toggle lives
// one level up as a SegmentedControl; this bar is for everything else.
export function PayrollPeriodFilters({ onChange }: { onChange: (filters: PayrollPeriodFilterValues) => void }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [workflowStatus, setWorkflowStatus] = useState<PayrollWorkflowStatus | ''>('');
  const [reconciliationStatus, setReconciliationStatus] = useState<ReconciliationStatus | ''>('');

  function emit(overrides: Partial<PayrollPeriodFilterValues> = {}) {
    onChange({
      date_from: dateFrom,
      date_to: dateTo,
      workflow_status: workflowStatus || undefined,
      reconciliation_status: reconciliationStatus || undefined,
      ...overrides,
    });
  }

  return (
    <div className="flex flex-wrap gap-2.5">
      <div className="relative">
        <IconCalendar className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            emit({ date_from: e.target.value });
          }}
          className="rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
        />
      </div>
      <div className="relative">
        <IconCalendar className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            emit({ date_to: e.target.value });
          }}
          className="rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
        />
      </div>
      <div className="relative">
        <IconFilter className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <select
          value={workflowStatus}
          onChange={(e) => {
            const next = e.target.value as PayrollWorkflowStatus | '';
            setWorkflowStatus(next);
            emit({ workflow_status: next || undefined });
          }}
          className="rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">All workflow statuses</option>
          {WORKFLOW_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="relative">
        <IconFilter className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <select
          value={reconciliationStatus}
          onChange={(e) => {
            const next = e.target.value as ReconciliationStatus | '';
            setReconciliationStatus(next);
            emit({ reconciliation_status: next || undefined });
          }}
          className="rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">All reconciliation statuses</option>
          {RECONCILIATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
