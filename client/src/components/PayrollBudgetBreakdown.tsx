import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { formatMoney } from '../lib/formatMoney';
import { IconChevronRight } from './icons';
import type { PayrollEntry } from '../types';

interface CodeTotal {
  code: string;
  total: string;
}

interface BudgetItemGroup {
  key: string;
  label: string;
  total: string;
  codes: CodeTotal[];
}

// Grouped by budget item (the level with real labels -- JPL/planning-line
// descriptions are all blank in the source, see CLAUDE.md) with the
// individual JPL codes nested underneath. A week touching only one budget
// item collapses to a single un-expandable row; a week spanning several
// codes under one item (e.g. 3.1.1 and 3.1.2, both "Civil Works") keeps
// that split visible instead of folding it into one number.
function buildBreakdown(entries: PayrollEntry[]): BudgetItemGroup[] {
  const byItem = new Map<
    string,
    { label: string; total: Decimal; codeTotals: Map<string, Decimal> }
  >();

  for (const e of entries) {
    const itemKey = e.budget_item_id != null ? String(e.budget_item_id) : 'unassigned';
    const itemLabel =
      e.budget_item_id != null
        ? `${e.budget_item_no ?? ''} ${e.budget_item_description ?? ''}`.trim() || `Budget item ${e.budget_item_id}`
        : 'Unassigned';
    const codeLabel = e.planning_line_code ?? 'No JPL code';
    const amount = new Decimal(e.amount);

    let group = byItem.get(itemKey);
    if (!group) {
      group = { label: itemLabel, total: new Decimal(0), codeTotals: new Map() };
      byItem.set(itemKey, group);
    }
    group.total = group.total.plus(amount);
    group.codeTotals.set(codeLabel, (group.codeTotals.get(codeLabel) ?? new Decimal(0)).plus(amount));
  }

  return [...byItem.entries()]
    .map(([key, g]) => ({
      key,
      label: g.label,
      total: g.total,
      codes: [...g.codeTotals.entries()]
        .map(([code, total]) => ({ code, total }))
        .sort((a, b) => b.total.cmp(a.total)),
    }))
    .sort((a, b) => b.total.cmp(a.total))
    .map((g) => ({
      key: g.key,
      label: g.label,
      total: g.total.toFixed(2),
      codes: g.codes.map((c) => ({ code: c.code, total: c.total.toFixed(2) })),
    }));
}

export function PayrollBudgetBreakdown({ entries }: { entries: PayrollEntry[] }) {
  const groups = useMemo(() => buildBreakdown(entries), [entries]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (groups.length === 0) return null;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col rounded-md border border-rule bg-surface">
      <div className="border-b border-rule px-4 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">By budget item</span>
      </div>
      <div className="divide-y divide-rule">
        {groups.map((g) => {
          const expandable = g.codes.length > 1;
          const isOpen = expandable && expanded.has(g.key);
          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={expandable ? () => toggle(g.key) : undefined}
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left ${
                  expandable ? 'hover:bg-surface-2' : 'cursor-default'
                }`}
              >
                <span className="flex items-center gap-2 text-sm text-ink">
                  {expandable && (
                    <IconChevronRight
                      className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                  )}
                  {!expandable && <span className="w-3.5 shrink-0" />}
                  {g.label}
                </span>
                <span className="font-mono text-sm font-semibold text-ink tabular-nums">{formatMoney(g.total)}</span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-1.5 bg-canvas px-4 py-2.5 pl-11">
                  {g.codes.map((c) => (
                    <div key={c.code} className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[11px] font-semibold text-accent">
                        {c.code}
                      </span>
                      <span className="font-mono text-xs text-ink-muted tabular-nums">{formatMoney(c.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
