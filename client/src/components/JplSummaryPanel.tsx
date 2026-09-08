import { useState } from 'react';
import { formatAmountCell, formatMoney, sumMoney } from '../lib/formatMoney';
import { compareCodes } from '../lib/sortCodes';
import { COST_CATEGORIES } from '../lib/costCategories';
import { IconCheck, IconChevronRight } from './icons';
import { Panel } from './Panel';
import { JplTransactionsModal } from './JplTransactionsModal';
import type { BudgetSummaryRow, WbsRow } from '../types';

// Contract + the five ledgers per JPL code, grouped under the budget item the
// code belongs to.
//
// Deliberately NOT a nested parent/child tree: code 3.8 carries PHP 3,500
// charged directly to itself while PHP 8.7M sits on its sub-codes, so a
// collapsed "3.8" row showing either figure alone misleads. Flat rows inside a
// group keep every peso visible exactly once, which is also what makes the
// group total a real sum rather than a rollup double-counting its children.
//
// Ledger order comes from COST_CATEGORIES, the app's one fixed order for these
// five, so the columns, the mix bar and the Overview's charts all read left to
// right the same way.
const CASH_COLUMNS = COST_CATEGORIES.map((c) => ({
  key: c.column as keyof WbsRow,
  label: c.short,
  full: c.label,
  color: c.color,
}));

const CONTRACT_KEY = 'contract_amount' as const;
// A neutral, non-series colour on purpose -- Contract is a commitment, not a
// disbursement, and it stays visually distinct from the five ledger colours
// even when she opts it into the total below.
const CONTRACT_COLUMN = { key: CONTRACT_KEY as string, label: 'Contract', full: 'Contract', color: 'var(--color-rule-strong)' };
const DEFAULT_LEDGERS = CASH_COLUMNS.map((c) => c.key as string);
// Everything the "Include" row can toggle: the five ledgers plus Contract,
// which is off by default (see the `ledgers` state below) precisely because
// summing it in double-counts any PO that's been partially paid.
const TOGGLEABLE = [...CASH_COLUMNS, CONTRACT_COLUMN];
const TOGGLE_KEYS = TOGGLEABLE.map((c) => c.key as string);

interface Group {
  key: string;
  label: string;
  rows: WbsRow[];
  totals: Record<string, string>;
}

// Cash out over the chosen ledgers only. Summed from the columns rather than
// read off v_planning_line_spend.total_spend, because a filtered total has no
// stored equivalent -- when all five are on, the two agree to the centavo and
// scripts/check-jpl-reconciliation.js asserts exactly that.
function cashOut(row: WbsRow, ledgers: string[]) {
  return sumMoney(ledgers.map((k) => row[k as keyof WbsRow] as string));
}

function buildGroups(rows: WbsRow[], items: BudgetSummaryRow[], ledgers: string[]): Group[] {
  const labels = new Map(items.map((i) => [i.budget_item_id, `${i.item_no} ${i.description}`.trim()]));
  const byItem = new Map<string, WbsRow[]>();

  for (const row of rows) {
    // budget_item_id is derived from the code's first segment upstream, so an
    // unassigned line is a real data gap, not a code we can bucket ourselves.
    const key = row.budget_item_id == null ? 'unassigned' : String(row.budget_item_id);
    const bucket = byItem.get(key);
    if (bucket) bucket.push(row);
    else byItem.set(key, [row]);
  }

  return [...byItem.entries()]
    .map(([key, groupRows]) => {
      const sorted = [...groupRows].sort((a, b) => compareCodes(a.code, b.code));
      const totals: Record<string, string> = { [CONTRACT_KEY]: sumMoney(sorted.map((r) => r[CONTRACT_KEY])) };
      for (const k of ledgers) totals[k] = sumMoney(sorted.map((r) => r[k as keyof WbsRow] as string));
      totals.cash_out = sumMoney(ledgers.map((k) => totals[k]));
      return {
        key,
        label: key === 'unassigned' ? 'Unassigned' : (labels.get(Number(key)) ?? `Budget item ${key}`),
        rows: sorted,
        totals,
      };
    })
    .sort((a, b) => compareCodes(a.label, b.label));
}

// A 3px stacked rule under each cash-out figure, segments in the app's fixed
// ledger colours. The columns say how much came from where; this says it in one
// glance. Proportions follow the selection, so the bar can never describe a
// different set of ledgers than the number above it.
function MixBar({
  amounts,
  total,
  ledgers,
}: {
  amounts: Record<string, string>;
  ledgers: string[];
  total: string;
}) {
  const whole = Number(total);
  if (whole <= 0) return null;

  const segments = TOGGLEABLE.filter((c) => ledgers.includes(c.key as string))
    .map((col) => ({
      color: col.color,
      label: col.label,
      pct: (Number(amounts[col.key as string]) / whole) * 100,
    }))
    .filter((s) => s.pct > 0);

  return (
    <div
      className="mt-1 flex h-0.75 w-full overflow-hidden rounded-full bg-rule"
      title={segments.map((s) => `${s.label} ${s.pct.toFixed(1)}%`).join(' · ')}
      aria-hidden="true"
    >
      {segments.map((s) => (
        <div key={s.label} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
      ))}
    </div>
  );
}

export function JplSummaryPanel({ rows, items }: { items: BudgetSummaryRow[]; rows: WbsRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openCode, setOpenCode] = useState<WbsRow | null>(null);
  // Always starts with the five ledgers on and Contract off. Deliberately not
  // remembered between visits: a total quietly missing payroll (or quietly
  // including Contract) because of a box ticked last week is the one way this
  // control could do real damage.
  const [ledgers, setLedgers] = useState<string[]>(DEFAULT_LEDGERS);

  const columns = CASH_COLUMNS.filter((c) => ledgers.includes(c.key as string));
  const includesContract = ledgers.includes(CONTRACT_KEY);
  const isFiltered = ledgers.length !== DEFAULT_LEDGERS.length || DEFAULT_LEDGERS.some((k) => !ledgers.includes(k));

  // A row earns its place if any chosen ledger carries money, or if it holds a
  // contract -- awarded-but-unpaid is worth seeing whatever the filter says.
  const active = rows.filter(
    (r) => Number(r[CONTRACT_KEY]) !== 0 || ledgers.some((k) => Number(r[k as keyof WbsRow] as string) !== 0),
  );
  const hiddenCount = rows.length - active.length;
  const groups = buildGroups(active, items, ledgers);

  const grand: Record<string, string> = { [CONTRACT_KEY]: sumMoney(groups.map((g) => g.totals[CONTRACT_KEY])) };
  for (const k of ledgers) grand[k] = sumMoney(groups.map((g) => g.totals[k]));
  grand.cash_out = sumMoney(ledgers.map((k) => grand[k]));

  const allOpen = groups.length > 0 && expanded.size === groups.length;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleLedger(key: string) {
    setLedgers((prev) => {
      // Never let the last one go -- an empty selection means a table of
      // zeroes, which reads as "no spend" rather than "nothing selected".
      if (prev.includes(key)) return prev.length === 1 ? prev : prev.filter((k) => k !== key);
      return TOGGLE_KEYS.filter((k) => prev.includes(k) || k === key);
    });
  }

  return (
    <Panel
      title="Cost by JPL code"
      subtitle={`${active.length} codes · open a budget item to see its codes, a code to see its transactions`}
      bodyClassName="p-0"
      action={
        <button
          type="button"
          onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}
          className="text-[13px] font-medium text-accent hover:underline"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      }
    >
      {/* Which ledgers count toward the total. Chips rather than a checkbox
          list: they carry the same colour as the column and the mix bar, so
          the control and the thing it controls read as one. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-rule px-4 py-2.5 print:hidden">
        <span className="mr-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">Include</span>
        {TOGGLEABLE.map((col) => {
          const on = ledgers.includes(col.key as string);
          const isContractChip = col.key === CONTRACT_KEY;
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => toggleLedger(col.key as string)}
              aria-pressed={on}
              // Contract's chip gets its own divider -- it's not one of the
              // five ledgers, and the gap keeps that visible even before
              // she's read why.
              className={`inline-flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-2 text-[12px] font-medium transition-colors ${isContractChip ? 'ml-2' : ''} ${
                on
                  ? 'border-rule-strong bg-surface-2 text-ink'
                  : 'border-rule bg-surface text-ink-faint hover:text-ink-muted'
              }`}
              title={isContractChip ? 'A commitment, not cash paid -- adding it double-counts any PO already partially paid.' : undefined}
            >
              {on ? (
                <IconCheck className="h-3 w-3" />
              ) : (
                <span className="h-3 w-3" />
              )}
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: on ? col.color : 'var(--color-rule-strong)' }}
              />
              {col.full}
            </button>
          );
        })}
        {isFiltered && (
          <button
            type="button"
            onClick={() => setLedgers(DEFAULT_LEDGERS)}
            className="ml-1 text-[12px] font-medium text-accent hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      <div className="max-h-140 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface-2 text-[10px] font-semibold tracking-wider text-ink-faint uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Budget item / code</th>
              {/* Contract always shows here regardless of the Include chips --
                  the vertical rule marks the boundary the domain cares about
                  (commitment vs. disbursement), not a boundary this column
                  itself enforces. Its own chip lets her fold it into the
                  total anyway, on purpose, with the double-count called out
                  in the footer and the chip's own tooltip. */}
              <th className="px-3 py-2.5 text-right font-semibold">Contract</th>
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${i === 0 ? 'border-l border-rule' : ''}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col.color }} />
                    {col.label}
                  </span>
                </th>
              ))}
              {/* The header names what the number actually is. A filtered total
                  that still said "Total cash out" is the one way this feature
                  could put a wrong figure in front of someone. */}
              <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                {isFiltered ? (
                  <>
                    Selected total
                    <span className="block text-[9px] font-medium normal-case">
                      {ledgers.length} of {TOGGLE_KEYS.length} included
                    </span>
                  </>
                ) : (
                  'Total cash out'
                )}
              </th>
            </tr>
          </thead>

          {groups.map((group) => {
            const isOpen = expanded.has(group.key);
            return (
              <tbody key={group.key} className="border-t border-rule">
                <tr className={isOpen ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2'}>
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => toggle(group.key)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-2 text-left"
                    >
                      <IconChevronRight
                        className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      />
                      <span className="font-display font-semibold text-ink">{group.label}</span>
                      <span className="text-[11px] text-ink-faint">{group.rows.length}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-ink-muted">
                    {formatAmountCell(group.totals[CONTRACT_KEY])}
                  </td>
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 text-right font-mono tabular-nums text-ink ${i === 0 ? 'border-l border-rule' : ''}`}
                    >
                      {formatAmountCell(group.totals[col.key as string])}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right align-middle">
                    <span className="font-mono font-semibold tabular-nums text-ink">
                      {formatAmountCell(group.totals.cash_out)}
                    </span>
                    <MixBar amounts={group.totals} total={group.totals.cash_out} ledgers={ledgers} />
                  </td>
                </tr>

                {isOpen &&
                  group.rows.map((row) => {
                    const total = cashOut(row, ledgers);
                    return (
                      <tr
                        key={row.planning_line_id}
                        onClick={() => setOpenCode(row)}
                        className="cursor-pointer border-t border-rule bg-surface hover:bg-accent-soft"
                        title="Show the transactions behind this code"
                      >
                        <td className="py-1.5 pr-4 pl-11">
                          <span className="font-mono text-[13px] font-medium text-accent">{row.code}</span>
                          {row.description && (
                            <span className="ml-2 text-[13px] text-ink-muted">{row.description}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-[13px] tabular-nums text-ink-faint">
                          {formatAmountCell(row[CONTRACT_KEY])}
                        </td>
                        {columns.map((col, i) => (
                          <td
                            key={col.key}
                            className={`px-3 py-1.5 text-right font-mono text-[13px] tabular-nums text-ink-muted ${i === 0 ? 'border-l border-rule' : ''}`}
                          >
                            {formatAmountCell(row[col.key] as string)}
                          </td>
                        ))}
                        <td className="px-4 py-1.5 text-right">
                          <span className="font-mono text-[13px] tabular-nums text-ink">
                            {formatAmountCell(total)}
                          </span>
                          <MixBar
                            amounts={Object.fromEntries(
                              TOGGLEABLE.map((c) => [c.key as string, row[c.key as keyof WbsRow] as string]),
                            )}
                            total={total}
                            ledgers={ledgers}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            );
          })}

          <tfoot className="sticky bottom-0 bg-surface">
            <tr className="border-t-2 border-ink">
              <td className="px-4 py-2.5 font-semibold text-ink">All codes</td>
              <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-ink-muted">
                {formatAmountCell(grand[CONTRACT_KEY])}
              </td>
              {columns.map((col, i) => (
                <td
                  key={col.key}
                  className={`px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-ink ${i === 0 ? 'border-l border-rule' : ''}`}
                >
                  {formatAmountCell(grand[col.key as string])}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right">
                <span className="font-mono font-semibold tabular-nums text-ink">
                  {formatAmountCell(grand.cash_out)}
                </span>
                <MixBar amounts={grand} total={grand.cash_out} ledgers={ledgers} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t border-rule px-4 py-2.5 text-[13px] text-ink-faint">
        {/* Stated in the body, not just the header, so it survives onto the
            printout where the chips are hidden. */}
        {includesContract && (
          <span className="font-medium text-warn">
            Total includes Contract — a commitment, not cash paid. For any code with a partially paid PO, this
            double-counts the paid portion; don&apos;t read it as a cash figure.{' '}
          </span>
        )}
        {columns.length < CASH_COLUMNS.length && (
          <span className="font-medium text-warn">
            Total covers {columns.length > 0 ? columns.map((c) => c.full).join(', ') : 'no ledgers'} only —{' '}
            {CASH_COLUMNS.filter((c) => !ledgers.includes(c.key as string))
              .map((c) => c.full)
              .join(' and ')}{' '}
            excluded.{' '}
          </span>
        )}
        All figures in PHP.{' '}
        {includesContract
          ? 'Contract is summed from the POs tagged to each code, so it can differ from the Committed column in Budget vs. actual, which is maintained separately.'
          : 'Contract is what has been awarded and is never added to cash out by default — the two answer different questions. Both it and the Committed column in Budget vs. actual are summed from the same POs, so the two always agree.'}
        {hiddenCount > 0 && ` ${hiddenCount} codes with no activity are not listed.`}
      </p>

      {openCode && (
        <JplTransactionsModal
          row={openCode}
          expectedContract={formatMoney(openCode.contract_amount)}
          expectedDisbursed={formatMoney(openCode.total_spend)}
          onClose={() => setOpenCode(null)}
        />
      )}
    </Panel>
  );
}
