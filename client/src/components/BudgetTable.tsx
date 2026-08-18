import { formatMoneyAccounting } from '../lib/formatMoney';
import { type CsvColumn } from '../lib/exportCsv';
import { ProgressBar } from './ProgressBar';
import { StatusPill } from './StatusPill';
import { ExportButton } from './ExportButton';
import { Panel } from './Panel';
import type { BudgetSummaryRow } from '../types';

// Raw DECIMAL strings, unformatted -- a spreadsheet should receive numbers it
// can sum, not "₱1,333,876,003.00" strings it treats as text. commitment_ratio
// is emitted as the stored fraction for the same reason.
const CSV_COLUMNS: CsvColumn<BudgetSummaryRow>[] = [
  { key: 'item_no', label: 'Item' },
  { key: 'description', label: 'Description' },
  { key: 'budget', label: 'Budget' },
  { key: 'contract_amount', label: 'Committed' },
  { key: 'total_disbursed', label: 'Disbursed' },
  { key: 'remaining_vs_contract', label: 'Remaining (contract)' },
  { key: 'remaining_vs_disbursed', label: 'Remaining (disbursed)' },
  { key: 'commitment_ratio', label: 'Commitment ratio' },
  { key: 'is_over_budget', label: 'Over budget', csvValue: (row) => (row.is_over_budget === 1 ? 'Yes' : 'No') },
];

export function BudgetTable({
  rows,
  onSelect,
  onCreate,
}: {
  onCreate?: () => void;
  onSelect?: (row: BudgetSummaryRow) => void;
  rows: BudgetSummaryRow[];
}) {
  return (
    <Panel
      title="Budget vs. actual"
      action={
        <div className="flex items-center gap-2">
          <ExportButton rows={rows} columns={CSV_COLUMNS} filename="budget-vs-actual" />
          {/* This is the only screen listing every budget item, so it's where
              adding one belongs -- print:hidden because it's a control, not
              content (same reason the Overview's print button is excluded). */}
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="rounded-sm border border-rule-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas print:hidden"
            >
              + New budget item
            </button>
          )}
        </div>
      }
      bodyClassName="overflow-x-auto"
    >
      {/* table-layout: fixed + explicit col widths -- with the default auto
          layout, neither max-width nor width on a <td> caps a column; the
          browser still grows it to fit the longest unbroken content (money
          text can't wrap). Fixed layout makes the widths below authoritative,
          so the long descriptions in "Budget item" actually wrap instead of
          pushing the table wider than its ~1130px container.
          min-w keeps those same proportions below that width instead of
          squeezing every column at once (which overlaps nowrap money text) --
          the panel's overflow-x-auto then scrolls horizontally on mobile,
          same fallback every other wide table in this app already uses. */}
      <table className="w-full min-w-220 table-fixed border-collapse text-[13px] sm:text-sm">
        <colgroup>
          <col className="w-[26%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[9%]" />
        </colgroup>
        <thead>
          <tr>
            {/* Item + Description merged into one column -- CLAUDE.md rule #1
                requires remaining-vs-contract and remaining-vs-disbursed to
                both stay labelled and distinct, so neither of those can give
                up its own column; merging the two identity columns instead is
                what makes all 8 fields fit without a horizontal scroll at
                this app's usual ~1180px container width. */}
            <Th>Budget item</Th>
            <Th align="right">Budget</Th>
            <Th align="right">Committed</Th>
            <Th align="right">Disbursed</Th>
            {/* Deliberate, fixed break point instead of a browser word-wrap
                that lands wherever the column happens to be narrow enough --
                these two are the only headers long enough to need 2 lines,
                so the break should look intentional, not accidental. */}
            <Th align="right">
              <span className="block">Remaining</span>
              <span className="block">(contract)</span>
            </Th>
            <Th align="right">
              <span className="block">Remaining</span>
              <span className="block">(disbursed)</span>
            </Th>
            <Th>Commitment</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.budget_item_id}
              onClick={() => onSelect?.(row)}
              className={`${onSelect ? 'cursor-pointer hover:bg-canvas' : ''} ${row.is_over_budget ? 'bg-danger-soft' : ''}`}
            >
              <Td wrap>
                <span className="font-mono text-ink-faint">{row.item_no}</span> {row.description}
                {/* Its own line, always -- as a plain inline sibling after
                    wrapped text, it landed wherever the last wrapped line
                    happened to end, sometimes inline, sometimes alone below. */}
                {row.is_over_budget === 1 && (
                  <div className="mt-1">
                    <StatusPill tone="danger">Over budget</StatusPill>
                  </div>
                )}
              </Td>
              <Td align="right" className="font-mono">{formatMoneyAccounting(row.budget)}</Td>
              <Td align="right" className="font-mono">{formatMoneyAccounting(row.contract_amount)}</Td>
              <Td align="right" className="font-mono">{formatMoneyAccounting(row.total_disbursed)}</Td>
              <Td align="right" className="font-mono">{formatMoneyAccounting(row.remaining_vs_contract)}</Td>
              <Td align="right" className="font-mono">{formatMoneyAccounting(row.remaining_vs_disbursed)}</Td>
              <Td>
                <ProgressBar ratio={row.commitment_ratio} danger={row.is_over_budget === 1} compact />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Th({ children, align = 'left' }: { align?: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <th
      className={`sticky top-0 bg-surface-2 px-3 py-2.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  className = '',
  wrap = false,
}: {
  align?: 'left' | 'right';
  children: React.ReactNode;
  className?: string;
  wrap?: boolean;
}) {
  return (
    <td
      className={`border-b border-rule px-3 py-2.5 ${wrap ? 'whitespace-normal' : 'whitespace-nowrap'} ${
        align === 'right' ? 'text-right tabular-nums' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}
