// Extracted from DataTable so hand-rolled tables (the Overview budget vs
// actual table) can export without reimplementing quoting/escaping or
// growing a dependency.
//
// Takes raw values, never rendered output: a rendered cell may hold JSX,
// icons, or badges, which stringify to unreadable noise in a spreadsheet.
export interface CsvColumn<T> {
  key: string;
  label: string;
  /** Overrides the raw value -- for cells whose display form is the real
   *  datum (e.g. a ratio shown as a percentage). Return a plain scalar. */
  csvValue?: (row: T) => string | number | null | undefined;
}

// U+FEFF. Excel on a Windows default locale reads a BOM-less UTF-8 CSV as
// ANSI, which mojibakes every peso sign and en-dash in a supplier name.
const UTF8_BOM = '﻿';

function cell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((row) =>
    columns
      .map((c) => cell(c.csvValue ? c.csvValue(row) : (row as Record<string, unknown>)[c.key]))
      .join(','),
  );
  return [header, ...body].join('\n');
}

export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([UTF8_BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
