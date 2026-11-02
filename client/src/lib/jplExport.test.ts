// Run with: npm test  (node --test --experimental-strip-types)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildJplExportRows } from './jplExport.ts';
import type { BudgetSummaryRow, WbsRow } from '../types.ts';

function code(code: string, amounts: Partial<WbsRow>): WbsRow {
  return {
    planning_line_id: 0, project_id: 1, budget_item_id: 3, code, description: null, parent_id: null,
    depth: 1, budget_amount: null, is_active: 1,
    contract_amount: '0.00', replen_amount: '0.00', po_paid_amount: '0.00', cash_advance_amount: '0.00',
    additional_payment_amount: '0.00', labor_amount: '0.00', total_spend: '0.00',
    ...amounts,
  };
}

const items = [{ budget_item_id: 3, item_no: '3.0', description: 'Civil Works' }] as BudgetSummaryRow[];
const groups = [
  {
    key: '3',
    label: '3.0 Civil Works',
    rows: [
      code('3.1', { contract_amount: '100.10', po_paid_amount: '50.05', total_spend: '50.05' }),
      code('3.8.7', { labor_amount: '0.20', replen_amount: '0.10', total_spend: '0.30' }),
    ],
  },
  { key: 'unassigned', label: 'Unassigned', rows: [code('99.1', { replen_amount: '5.00', total_spend: '5.00' })] },
];

test('budget items only: one row each, summed to the centavo', () => {
  const rows = buildJplExportRows(groups, items, false);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    level: 'Budget item', budget_item: '3.0 Civil Works', code: '3.0', description: 'Civil Works',
    contract_amount: '100.10', labor_amount: '0.20', replen_amount: '0.10', po_paid_amount: '50.05',
    cash_advance_amount: '0.00', additional_payment_amount: '0.00', total_spend: '50.35',
  });
  assert.equal(rows[1].description, 'Unassigned');
  assert.equal(rows[1].code, '');
});

test('with sub-codes: each budget item followed by its codes, which sum to it', () => {
  const rows = buildJplExportRows(groups, items, true);
  assert.deepEqual(rows.map((r) => `${r.level}:${r.code}`), [
    'Budget item:3.0', 'Sub-code:3.1', 'Sub-code:3.8.7', 'Budget item:', 'Sub-code:99.1',
  ]);
  assert.equal(rows[2].description, '');
  assert.equal(rows[2].budget_item, '3.0 Civil Works');
});
