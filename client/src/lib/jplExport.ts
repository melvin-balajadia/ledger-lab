import { sumMoney } from './formatMoney.ts';
import { COST_CATEGORIES } from './costCategories.ts';
import type { BudgetSummaryRow, WbsRow } from '../types.ts';

// The money columns of the "Cost by JPL code" export, in file order: Contract,
// the five ledgers, then Total cash out (total_spend -- always all five,
// whatever the on-screen Include chips say).
export const MONEY_KEYS = [
  'contract_amount',
  ...COST_CATEGORIES.map((c) => c.column),
  'total_spend',
] as const;
type MoneyKey = (typeof MONEY_KEYS)[number];

export type JplExportRow = {
  /** 'Budget item' or 'Sub-code' -- so a mixed file can be filtered to one. */
  level: string;
  budget_item: string;
  code: string;
  description: string;
} & Record<MoneyKey, string>;

export interface JplExportGroup {
  /** budget_item_id as a string, or 'unassigned'. */
  key: string;
  label: string;
  rows: WbsRow[];
}

// One row per budget item (the "mother" JPL code -- the same line as her
// SUMMARY sheet), optionally each followed by the sub-codes under it.
//
// A budget item row is the sum of exactly the sub-code rows listed under it,
// so with sub-codes included every peso appears twice: once on its sub-code,
// once in its budget item. The Level column is what lets her filter to one
// level before totalling a column. Grand totals are left out, as before.
export function buildJplExportRows(
  groups: JplExportGroup[],
  items: BudgetSummaryRow[],
  includeSubCodes: boolean,
): JplExportRow[] {
  const byId = new Map(items.map((i) => [String(i.budget_item_id), i]));
  const money = (pick: (k: MoneyKey) => string) =>
    Object.fromEntries(MONEY_KEYS.map((k) => [k, pick(k)])) as Record<MoneyKey, string>;

  return groups.flatMap((g) => {
    const item = byId.get(g.key);
    const parent: JplExportRow = {
      level: 'Budget item',
      budget_item: g.label,
      code: item?.item_no ?? '',
      description: item?.description ?? g.label,
      ...money((k) => sumMoney(g.rows.map((r) => r[k]))),
    };
    if (!includeSubCodes) return [parent];
    return [
      parent,
      ...g.rows.map((r) => ({
        level: 'Sub-code',
        budget_item: g.label,
        code: r.code,
        // Blank in the source for every code (CLAUDE.md) -- never invented.
        description: r.description ?? '',
        ...money((k) => r[k]),
      })),
    ];
  });
}
