import { formatMoney } from '../lib/formatMoney';
import { ProgressBar } from './ProgressBar';
import { StatusPill } from './StatusPill';
import type { BudgetSummaryRow } from '../types';

export function BudgetTable({
  rows,
  onSelect,
}: {
  onSelect?: (row: BudgetSummaryRow) => void;
  rows: BudgetSummaryRow[];
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-rule bg-surface shadow-card">
      <table className="w-full min-w-[900px] border-collapse text-[13px] sm:text-sm">
        <thead>
          <tr>
            <Th>Item</Th>
            <Th>Description</Th>
            <Th align="right">Budget</Th>
            <Th align="right">Committed</Th>
            <Th align="right">Disbursed</Th>
            <Th align="right">Remaining (contract)</Th>
            <Th align="right">Remaining (disbursed)</Th>
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
              <Td>{row.item_no}</Td>
              <Td className="min-w-[220px] whitespace-normal">
                {row.description}
                {row.is_over_budget === 1 && (
                  <span className="ml-2.5 inline-block align-middle">
                    <StatusPill tone="danger">Over budget</StatusPill>
                  </span>
                )}
              </Td>
              <Td align="right" className="font-mono">{formatMoney(row.budget)}</Td>
              <Td align="right" className="font-mono">{formatMoney(row.contract_amount)}</Td>
              <Td align="right" className="font-mono">{formatMoney(row.total_disbursed)}</Td>
              <Td align="right" className="font-mono">{formatMoney(row.remaining_vs_contract)}</Td>
              <Td align="right" className="font-mono">{formatMoney(row.remaining_vs_disbursed)}</Td>
              <Td>
                <ProgressBar ratio={row.commitment_ratio} danger={row.is_over_budget === 1} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align = 'left' }: { align?: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <th
      className={`sticky top-0 bg-surface-2 px-3.5 py-2.5 text-[11px] font-semibold tracking-wide text-ink-muted uppercase ${
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
}: {
  align?: 'left' | 'right';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`whitespace-nowrap border-b border-rule px-3.5 py-2.5 ${
        align === 'right' ? 'text-right tabular-nums' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  );
}
