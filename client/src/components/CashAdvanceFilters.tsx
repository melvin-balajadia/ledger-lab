import { useState } from 'react';
import { PlanningLinePicker } from './PlanningLinePicker';
import { IconCalendar, IconFilter, IconList } from './icons';
import type { CashAdvanceStatus, PlanningLine } from '../types';

export interface CashAdvanceFilterValues {
  date_from: string;
  date_to: string;
  planning_line_id?: number;
  status?: CashAdvanceStatus;
}

const STATUSES: CashAdvanceStatus[] = ['open', 'partially_liquidated', 'liquidated'];
const STATUS_LABEL: Record<CashAdvanceStatus, string> = {
  open: 'Open',
  partially_liquidated: 'Partially liquidated',
  liquidated: 'Liquidated',
};

export function CashAdvanceFilters({ onChange }: { onChange: (filters: CashAdvanceFilterValues) => void }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [planningLine, setPlanningLine] = useState<PlanningLine | null>(null);
  const [status, setStatus] = useState<CashAdvanceStatus | ''>('');

  function emit(overrides: Partial<CashAdvanceFilterValues> = {}) {
    onChange({
      date_from: dateFrom,
      date_to: dateTo,
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
            const next = e.target.value as CashAdvanceStatus | '';
            setStatus(next);
            emit({ status: next || undefined });
          }}
          className="rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
