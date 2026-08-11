import { buildCsv, downloadCsv, type CsvColumn } from '../lib/exportCsv';
import { IconDownload } from './icons';

// The Overview panels are hand-rolled tables rather than DataTables, so they
// don't inherit its export. One button here keeps them consistent with each
// other and with DataTable's, instead of three near-copies.
export function ExportButton<T>({
  rows,
  columns,
  filename,
}: {
  columns: CsvColumn<T>[];
  filename: string;
  rows: T[];
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(buildCsv(rows, columns), filename)}
      title="Export CSV"
      disabled={rows.length === 0}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-rule-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
    >
      <IconDownload className="h-3.5 w-3.5" />
      Export
    </button>
  );
}
