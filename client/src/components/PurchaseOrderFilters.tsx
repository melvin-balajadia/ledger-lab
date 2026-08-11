import { useState } from 'react';
import { SupplierAutocomplete } from './SupplierAutocomplete';
import { PlanningLinePicker } from './PlanningLinePicker';
import { useProjectSummary } from '../hooks/useProjectData';
import { IconCalendar, IconFilter, IconList, IconUser } from './icons';
import type { PlanningLine, PoStatus, Supplier } from '../types';

export interface PurchaseOrderFilterValues {
  date_from: string;
  date_to: string;
  supplier_id?: number;
  budget_item_id?: number;
  planning_line_id?: number;
  status?: PoStatus;
}

const STATUS_OPTIONS: { label: string; value: PoStatus }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Partially paid', value: 'partially_paid' },
  { label: 'Fully paid', value: 'fully_paid' },
  { label: 'Cancelled', value: 'cancelled' },
];

// A single always-visible filter bar -- everything lives here (search and
// the outstanding-only toggle are handled one level up, in
// PurchaseOrders.tsx's segmented control + DataTable's own search box), so
// there's one place to look for "how do I narrow this list."
export function PurchaseOrderFilters({ onChange }: { onChange: (filters: PurchaseOrderFilterValues) => void }) {
  const { data: summary = [] } = useProjectSummary();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [budgetItemId, setBudgetItemId] = useState('');
  const [planningLine, setPlanningLine] = useState<PlanningLine | null>(null);
  const [status, setStatus] = useState<PoStatus | ''>('');

  function emit(overrides: Partial<PurchaseOrderFilterValues> = {}) {
    onChange({
      date_from: dateFrom,
      date_to: dateTo,
      supplier_id: supplier?.id,
      budget_item_id: budgetItemId ? Number(budgetItemId) : undefined,
      planning_line_id: planningLine?.id,
      status: status || undefined,
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
      <div className="relative min-w-50 flex-1">
        <IconUser className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <SupplierAutocomplete
          hasIcon
          value={supplier}
          onChange={(s) => {
            setSupplier(s);
            emit({ supplier_id: s?.id });
          }}
        />
      </div>
      <div className="relative min-w-55 flex-1">
        <IconList className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <select
          value={budgetItemId}
          onChange={(e) => {
            setBudgetItemId(e.target.value);
            emit({ budget_item_id: e.target.value ? Number(e.target.value) : undefined });
          }}
          className="w-full rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">All budget categories</option>
          {summary.map((row) => (
            <option key={row.budget_item_id} value={row.budget_item_id}>
              {row.item_no} {row.description}
            </option>
          ))}
        </select>
      </div>
      <div className="relative min-w-55 flex-1">
        <IconList className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <PlanningLinePicker
          hasIcon
          filterMode
          value={planningLine?.id ?? null}
          onChange={(pl) => {
            setPlanningLine(pl);
            emit({ planning_line_id: pl?.id });
          }}
        />
      </div>
      <div className="relative">
        <IconFilter className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <select
          value={status}
          onChange={(e) => {
            const next = e.target.value as PoStatus | '';
            setStatus(next);
            emit({ status: next || undefined });
          }}
          className="rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
