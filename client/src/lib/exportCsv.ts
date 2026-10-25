// One implementation of everything an export needs: value normalisation,
// CSV/JSON serialisation, filenames, paging, and the browser download
// handshake. DataTable and the hand-rolled Overview panels both route through
// here so quoting, encoding and naming can't drift apart between them.
//
// Takes raw values, never rendered output: a rendered cell may hold JSX,
// icons, or badges, which stringify to unreadable noise in a spreadsheet.

export interface CsvColumn<T> {
  key: string;
  label: string;
  /** Overrides the raw value -- for cells whose display form is the real
   *  datum (e.g. a ratio shown as a percentage). Return a plain scalar. */
  csvValue?: (row: T) => unknown;
}

export type ExportFormat = 'csv' | 'json';

export const EXPORT_FORMATS: { hint: string; label: string; value: ExportFormat }[] = [
  { value: 'csv', label: 'CSV', hint: 'Opens in Excel. Amounts stay unformatted so the spreadsheet can sum them.' },
  { value: 'json', label: 'JSON', hint: 'Exact stored values plus column labels and the export date. For archiving.' },
];

// ─── Value normalisation ──────────────────────────────────────────────────

// Nested keys ("a.b") are supported on screen, so the export has to resolve
// them the same way rather than as a flat property read.
function readPath(row: unknown, path: string): unknown {
  if (!path.includes('.')) return (row as Record<string, unknown> | null | undefined)?.[path];
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
      row,
    );
}

function valueOf<T>(row: T, col: CsvColumn<T>): unknown {
  return col.csvValue ? col.csvValue(row) : readPath(row, col.key);
}

// JSON off the wire isn't typed at runtime, so this is a boundary, not a
// guess: a Date would otherwise stringify to a locale string Excel can't
// parse, and an object to "[object Object]".
function toText(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : isoDate(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Excel and LibreOffice execute a cell starting with = + - @ tab or CR as a
// formula. Every supplier name and description in this app is typed by hand
// (CLAUDE.md: there is no ERP), so an exported file must not be able to carry
// one into her spreadsheet. Numbers are exempt -- "-4920.00" is a negative
// amount, not a formula, and prefixing it would break the sums the export
// exists for.
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMERIC = /^[-+]?\d+(\.\d+)?$/;

function cell(value: unknown): string {
  const text = toText(value);
  const safe = FORMULA_START.test(text) && !NUMERIC.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

// ─── Serialisation ────────────────────────────────────────────────────────

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(valueOf(row, c))).join(','));
  // CRLF per RFC 4180. A quoted field may legally contain a bare LF (a
  // multi-line remark), and only CRLF row terminators keep the two apart.
  return [header, ...body].join('\r\n');
}

export interface ExportMeta {
  dataset: string;
  exportedAt?: string;
  /** Free-text note on what was filtered, so the file explains itself later. */
  scope?: string;
  site?: string;
}

// Peso amounts stay strings here on purpose: DECIMAL(18,2) at PHP 1.3 B
// exceeds float precision (CLAUDE.md #4), and a JSON number literal would
// come back through JSON.parse as a float. This is the format to archive from.
export function buildJson<T>(rows: T[], columns: CsvColumn<T>[], meta: ExportMeta): string {
  const payload = {
    dataset: meta.dataset,
    site: meta.site,
    scope: meta.scope,
    exportedAt: meta.exportedAt ?? new Date().toISOString(),
    rowCount: rows.length,
    columns: columns.map(({ key, label }) => ({ key, label })),
    rows: rows.map((row) => Object.fromEntries(columns.map((c) => [c.key, jsonValue(valueOf(row, c))]))),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function jsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : isoDate(value);
  return value;
}

export function serialize<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  format: ExportFormat,
  meta: ExportMeta,
): string {
  return format === 'json' ? buildJson(rows, columns, meta) : buildCsv(rows, columns);
}

// ─── Validation ───────────────────────────────────────────────────────────

/** Returns a message to show the user, or null when the export is safe to
 *  generate. Runs before serialisation so a broken file never reaches disk. */
export function validateExport<T>(rows: T[], columns: CsvColumn<T>[]): string | null {
  if (columns.length === 0) return 'Pick at least one column to export.';
  if (rows.length === 0) return 'Nothing to export — no rows match the current filters.';
  const seen = new Set<string>();
  for (const col of columns) {
    // Duplicate keys silently collapse into one property in the JSON form,
    // which would drop a column without raising anything.
    if (seen.has(col.key)) return `Duplicate column "${col.key}" — cannot export.`;
    seen.add(col.key);
  }
  return null;
}

// ─── Filenames ────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoDate(date: Date): string {
  // Local date, not toISOString() -- she is at UTC+8, so anything exported
  // before 8am would otherwise be stamped with yesterday's date.
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

const MAX_SLUG = 60;

function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SLUG)
    .replace(/^-+|-+$/g, '');
}

// e.g. "plaridel-extension-purchase-orders-2026-09-08.csv". The site name is
// in there because Plaridel and Villasis run as separate deployments of this
// same codebase (CLAUDE.md) and their downloads land in the same folder;
// before this the file was named from the table title alone ("Purchase
// Orders.csv"), so every export overwrote the last one.
export function exportFilename(
  dataset: string,
  format: ExportFormat,
  { site, date = new Date() }: { date?: Date; site?: string } = {},
): string {
  const parts = [slug(site ?? ''), slug(dataset), isoDate(date)].filter(Boolean);
  return `${parts.join('-') || 'export'}.${format}`;
}

// ─── Paging ───────────────────────────────────────────────────────────────

export interface PageResult<T> {
  data: T[];
  meta: { total: number };
}

// Every paginated server route caps pageSize at 200 (MAX_PAGE_SIZE in
// server/routes/*.js), so exporting the full filtered set means paging
// through in chunks this size -- the rows in state are only the page on
// screen, and exporting those silently truncated 3,822 payroll entries to 25.
export const EXPORT_PAGE_SIZE = 200;

// ponytail: 100k rows is ~25x the largest table today (payroll, 3,822). Raise
// it if a table ever legitimately gets there; it exists only so a server that
// keeps returning a full page while `total` disagrees stops instead of growing
// an array until the tab dies.
const MAX_EXPORT_PAGES = 500;

function abort(): never {
  throw new DOMException('Export cancelled', 'AbortError');
}

export async function fetchAllPages<T>(
  fetchPage: (page: number, perPage: number) => Promise<PageResult<T>>,
  { signal, onProgress }: { onProgress?: (loaded: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    if (signal?.aborted) abort();
    const result = await fetchPage(page, EXPORT_PAGE_SIZE);
    // Checked again after the await: she may have cancelled while this
    // request was in flight, and appending its rows would leave a partial
    // export looking complete.
    if (signal?.aborted) abort();
    for (const row of result.data) all.push(row);
    onProgress?.(all.length, Math.max(result.meta.total, all.length));
    if (result.data.length === 0 || all.length >= result.meta.total) return all;
    if (page >= MAX_EXPORT_PAGES) {
      throw new Error(
        `Export stopped at ${all.length.toLocaleString()} rows — the server kept returning more than it reported. Narrow the filters and try again.`,
      );
    }
  }
}

// ─── Download ─────────────────────────────────────────────────────────────

const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8;',
  json: 'application/json;charset=utf-8;',
};

// U+FEFF. Excel on a Windows default locale reads a BOM-less UTF-8 CSV as
// ANSI, which mojibakes every peso sign and en-dash in a supplier name.
const UTF8_BOM = '\uFEFF';

export function downloadText(text: string, filename: string, format: ExportFormat): void {
  const body = format === 'csv' ? UTF8_BOM + text : text;
  const url = URL.createObjectURL(new Blob([body], { type: MIME[format] }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  // Firefox only fires the download for a link that is actually in the
  // document, and revoking the object URL in the same tick as click() can
  // cancel a download that hasn't started yet. Both show up as an Export
  // button that appears to work and produces no file.
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
