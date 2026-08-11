import { useState } from 'react';
import { SupplierAutocomplete } from './SupplierAutocomplete';
import { PlanningLinePicker } from './PlanningLinePicker';
import { IconCalendar, IconFilter, IconList, IconUser } from './icons';
import type { RefType, Supplier, PlanningLine } from '../types';

export interface FilterValues {
  date_from: string;
  date_to: string;
  supplier_id?: number;
  planning_line_id?: number;
  ref_type?: RefType;
}

const REF_TYPES: RefType[] = ['SI', 'CI', 'CSI', 'OR', 'BS', 'MSR', 'other'];

// A single always-visible filter bar -- everything lives here (search and
// the needs-review toggle are handled one level up, in Replenishments.tsx's
// segmented control + DataTable's own search box), so there's one place to
// look for "how do I narrow this list," not a bar plus a hidden panel.
export function ReplenishmentFilters({ onChange }: { onChange: (filters: FilterValues) => void }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [planningLine, setPlanningLine] = useState<PlanningLine | null>(null);
  const [refType, setRefType] = useState<RefType | ''>('');

  function emit(overrides: Partial<FilterValues> = {}) {
    onChange({
      date_from: dateFrom,
      date_to: dateTo,
      supplier_id: supplier?.id,
      planning_line_id: planningLine?.id,
      ref_type: refType || undefined,
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
          value={refType}
          onChange={(e) => {
            const next = e.target.value as RefType | '';
            setRefType(next);
            emit({ ref_type: next || undefined });
          }}
          className="rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
        >
          <option value="">All ref. types</option>
          {REF_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
