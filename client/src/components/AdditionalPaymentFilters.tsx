import { useState } from 'react';
import { SupplierAutocomplete } from './SupplierAutocomplete';
import { PlanningLinePicker } from './PlanningLinePicker';
import { IconCalendar, IconFilter, IconList, IconUser } from './icons';
import type { ExpenseType, PlanningLine, Supplier } from '../types';

export interface AdditionalPaymentFilterValues {
  date_from: string;
  date_to: string;
  supplier_id?: number;
  planning_line_id?: number;
  expense_type?: ExpenseType;
}

const EXPENSE_TYPES: ExpenseType[] = [
  'customs_duty', 'freight', 'terminal_handling', 'insurance', 'brokerage', 'other',
];
const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  customs_duty: 'Customs duty',
  freight: 'Freight',
  terminal_handling: 'Terminal handling',
  insurance: 'Insurance',
  brokerage: 'Brokerage',
  other: 'Other',
};

export function AdditionalPaymentFilters({ onChange }: { onChange: (filters: AdditionalPaymentFilterValues) => void }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [planningLine, setPlanningLine] = useState<PlanningLine | null>(null);
  const [expenseType, setExpenseType] = useState<ExpenseType | ''>('');

  function emit(overrides: Partial<AdditionalPaymentFilterValues> = {}) {
    onChange({
      date_from: dateFrom,
      date_to: dateTo,
      supplier_id: supplier?.id,
      planning_line_id: planningLine?.id,
      expense_type: expenseType || undefined,
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
        <IconList className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <PlanningLinePicker
          hasIcon
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
          value={expenseType}
          onChange={(e) => {
            const next = e.target.value as ExpenseType | '';
            setExpenseType(next);
            emit({ expense_type: next || undefined });
          }}
          className="rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">All expense types</option>
          {EXPENSE_TYPES.map((type) => (
            <option key={type} value={type}>
              {EXPENSE_TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
