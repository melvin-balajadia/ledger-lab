// Run with: npm test  (node --test --experimental-strip-types)
//
// No test framework -- node:test and node:assert are stdlib, and exportCsv.ts
// imports nothing, so this runs without a bundler or a DOM. Only the pure
// half is covered here; downloadText needs a browser and is exercised by
// using the app.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCsv,
  buildJson,
  exportFilename,
  fetchAllPages,
  serialize,
  validateExport,
  type CsvColumn,
} from './exportCsv.ts';

interface Row {
  amount: string;
  supplier: string | null;
  nested?: { code: string };
}

const COLS: CsvColumn<Row>[] = [
  { key: 'supplier', label: 'Supplier' },
  { key: 'amount', label: 'Amount' },
];

const lines = (csv: string) => csv.split('\r\n');

// ─── CSV shape ────────────────────────────────────────────────────────────

test('header comes from labels and rows follow column order', () => {
  const csv = buildCsv([{ supplier: 'LBI', amount: '12780000.00' }], COLS);
  assert.deepEqual(lines(csv), ['"Supplier","Amount"', '"LBI","12780000.00"']);
});

test('rows are separated by CRLF, per RFC 4180', () => {
  const csv = buildCsv(
    [
      { supplier: 'A', amount: '1.00' },
      { supplier: 'B', amount: '2.00' },
    ],
    COLS,
  );
  assert.equal(csv.split('\r\n').length, 3);
  assert.equal(/[^\r]\n/.test(csv), false, 'no bare LF between rows');
});

test('an empty row set still produces a usable header-only file', () => {
  assert.equal(buildCsv([], COLS), '"Supplier","Amount"');
});

// ─── Escaping and encoding ────────────────────────────────────────────────

test('embedded quotes are doubled', () => {
  const csv = buildCsv([{ supplier: 'ACME "Steel" Inc', amount: '0.00' }], COLS);
  assert.equal(lines(csv)[1], '"ACME ""Steel"" Inc","0.00"');
});

test('commas and newlines inside a value stay inside one quoted field', () => {
  const csv = buildCsv([{ supplier: 'Line1\nLine2, Inc', amount: '0.00' }], COLS);
  assert.equal(lines(csv)[1], '"Line1\nLine2, Inc","0.00"');
});

test('unicode survives verbatim', () => {
  const csv = buildCsv([{ supplier: 'Peña — Café ₱ 東京', amount: '0.00' }], COLS);
  assert.match(csv, /Peña — Café ₱ 東京/);
});

test('null and undefined become empty fields, not "null"', () => {
  const csv = buildCsv([{ supplier: null, amount: undefined as unknown as string }], COLS);
  assert.equal(lines(csv)[1], '"",""');
});

test('zero and false are written out, not blanked', () => {
  // Two replenishment rows legitimately sit at 0.00 pending her answer on a
  // split JPL code (CLAUDE.md); a blank there reads as missing data, not zero.
  const cols: CsvColumn<{ n: number; b: boolean }>[] = [
    { key: 'n', label: 'Amount' },
    { key: 'b', label: 'Flag' },
  ];
  assert.equal(lines(buildCsv([{ n: 0, b: false }], cols))[1], '"0","false"');
});

test('a Date renders as a plain ISO date, not a locale string', () => {
  const cols: CsvColumn<{ d: Date }>[] = [{ key: 'd', label: 'Date' }];
  const csv = buildCsv([{ d: new Date(2026, 8, 8) }], cols);
  assert.equal(lines(csv)[1], '"2026-09-08"');
});

// ─── Formula injection ────────────────────────────────────────────────────

test('a formula-looking value is neutralised', () => {
  for (const evil of ['=1+1', '+cmd|calc', '@SUM(A1)', '\tleading tab']) {
    const csv = buildCsv([{ supplier: evil, amount: '0.00' }], COLS);
    assert.equal(lines(csv)[1], `"'${evil}","0.00"`, evil);
  }
  // Neutralising and quote-doubling compose, in that order.
  const csv = buildCsv([{ supplier: '=HYPERLINK("http://x")', amount: '0.00' }], COLS);
  assert.equal(lines(csv)[1], '"\'=HYPERLINK(""http://x"")","0.00"');
});

test('negative amounts are NOT neutralised — they must still sum', () => {
  // Item 7.0 is over budget by PHP 4.92; a leading apostrophe here would turn
  // every negative variance into text in her spreadsheet.
  const csv = buildCsv([{ supplier: 'x', amount: '-4.92' }], COLS);
  assert.equal(lines(csv)[1], '"x","-4.92"');
});

// ─── Nested keys and csvValue ─────────────────────────────────────────────

test('dotted keys resolve the same way the table renders them', () => {
  const cols: CsvColumn<Row>[] = [{ key: 'nested.code', label: 'Code' }];
  const csv = buildCsv([{ supplier: null, amount: '0', nested: { code: '3.8.7' } }], cols);
  assert.equal(lines(csv)[1], '"3.8.7"');
});

test('a missing nested branch is empty, not a crash', () => {
  const cols: CsvColumn<Row>[] = [{ key: 'nested.code', label: 'Code' }];
  const csv = buildCsv([{ supplier: null, amount: '0' }], cols);
  assert.equal(lines(csv)[1], '""');
});

test('csvValue overrides the raw value', () => {
  const cols: CsvColumn<Row>[] = [{ key: 'flag', label: 'Over', csvValue: () => 'Yes' }];
  assert.equal(lines(buildCsv([{ supplier: null, amount: '0' }], cols))[1], '"Yes"');
});

// ─── JSON ─────────────────────────────────────────────────────────────────

test('JSON keeps DECIMAL amounts as strings and carries the metadata', () => {
  const json = JSON.parse(
    buildJson([{ supplier: 'LBI', amount: '12780000.00' }], COLS, {
      dataset: 'Retention held',
      site: 'Plaridel Extension',
      scope: 'holdback only',
      exportedAt: '2026-09-08T01:00:00.000Z',
    }),
  );
  assert.equal(json.rows[0].amount, '12780000.00');
  assert.equal(typeof json.rows[0].amount, 'string', 'never a float');
  assert.equal(json.rowCount, 1);
  assert.equal(json.dataset, 'Retention held');
  assert.equal(json.site, 'Plaridel Extension');
  assert.equal(json.scope, 'holdback only');
  assert.deepEqual(json.columns, [
    { key: 'supplier', label: 'Supplier' },
    { key: 'amount', label: 'Amount' },
  ]);
});

test('JSON emits null for a missing value rather than dropping the key', () => {
  const json = JSON.parse(buildJson([{ supplier: null, amount: '0' }], COLS, { dataset: 'x' }));
  assert.equal('supplier' in json.rows[0], true);
  assert.equal(json.rows[0].supplier, null);
});

test('serialize dispatches on format', () => {
  const meta = { dataset: 'x' };
  assert.match(serialize([], COLS, 'csv', meta), /^"Supplier"/);
  assert.match(serialize([], COLS, 'json', meta), /^\{/);
});

// ─── Validation ───────────────────────────────────────────────────────────

test('validateExport rejects no columns, no rows, and duplicate keys', () => {
  assert.match(validateExport([{ supplier: 'a', amount: '1' }], [])!, /at least one column/);
  assert.match(validateExport([], COLS)!, /Nothing to export/);
  assert.match(
    validateExport([{ supplier: 'a', amount: '1' }], [...COLS, COLS[0]])!,
    /Duplicate column "supplier"/,
  );
  assert.equal(validateExport([{ supplier: 'a', amount: '1' }], COLS), null);
});

// ─── Filenames ────────────────────────────────────────────────────────────

const D = new Date(2026, 8, 8);

test('filename carries site, dataset and local date', () => {
  assert.equal(
    exportFilename('Purchase Orders', 'csv', { site: 'Plaridel Extension', date: D }),
    'plaridel-extension-purchase-orders-2026-09-08.csv',
  );
});

test('filename is filesystem-safe: no slashes, colons, accents or spaces', () => {
  const name = exportFilename('Payroll: week 1/2 — Peña', 'json', { site: 'Villasis', date: D });
  assert.equal(name, 'villasis-payroll-week-1-2-pena-2026-09-08.json');
  assert.equal(/[^a-z0-9.-]/.test(name), false);
});

test('filename uses the local date, not UTC (she is at UTC+8)', () => {
  // 00:30 local on the 8th is still the 7th in UTC.
  const name = exportFilename('x', 'csv', { date: new Date(2026, 8, 8, 0, 30) });
  assert.match(name, /-2026-09-08\.csv$/);
});

test('a dataset that slugs to nothing still yields a valid name', () => {
  assert.equal(exportFilename('???', 'csv', { date: D }), '2026-09-08.csv');
  assert.equal(exportFilename('', 'csv', { date: undefined as unknown as Date }).endsWith('.csv'), true);
});

// ─── Paging ───────────────────────────────────────────────────────────────

function pagedSource(total: number, pageSizeCap = 200) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  return async (page: number, perPage: number) => {
    const size = Math.min(perPage, pageSizeCap);
    return { data: all.slice((page - 1) * size, page * size), meta: { total } };
  };
}

test('fetchAllPages walks past the first page instead of truncating', async () => {
  const rows = await fetchAllPages(pagedSource(3822));
  assert.equal(rows.length, 3822);
  assert.equal(rows[3821].id, 3821);
});

test('fetchAllPages reports progress as pages land', async () => {
  const seen: number[] = [];
  await fetchAllPages(pagedSource(450), { onProgress: (loaded) => seen.push(loaded) });
  assert.deepEqual(seen, [200, 400, 450]);
});

test('fetchAllPages handles an empty result set', async () => {
  assert.deepEqual(await fetchAllPages(pagedSource(0)), []);
});

test('fetchAllPages stops on an aborted signal and does not resolve with partial rows', async () => {
  const controller = new AbortController();
  const source = pagedSource(1000);
  await assert.rejects(
    fetchAllPages(
      (page, perPage) => {
        // Cancel while page 2 is in flight.
        if (page === 2) controller.abort();
        return source(page, perPage);
      },
      { signal: controller.signal },
    ),
    (err: Error) => err.name === 'AbortError',
  );
});

test('fetchAllPages refuses to spin forever when the server disagrees with its own total', async () => {
  // A page that always returns rows while total claims far more: without the
  // cap this grows an array until the tab dies.
  await assert.rejects(
    fetchAllPages(async () => ({ data: [{ id: 1 }], meta: { total: Number.MAX_SAFE_INTEGER } })),
    /Export stopped at/,
  );
});
