import { useState } from 'react';
import { formatMoney } from '../lib/formatMoney';
import { IconChevronRight } from './icons';
import type { BudgetItemGroup } from '../lib/budgetItemGrouping';

// A week (or a filtered ledger page) touching only one budget item collapses
// to a single un-expandable row; one spanning several codes under the same
// item (e.g. 3.1.1 and 3.1.2, both "Civil Works") keeps that split visible
// instead of folding it into one number.
export function BudgetItemBreakdown({ groups, title = 'By budget item' }: { groups: BudgetItemGroup[]; title?: string }) {
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
        <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</span>
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
