import { useState } from 'react';
import { ExportDialog } from './ExportDialog';
import { type CsvColumn } from '../lib/exportCsv';
import { IconDownload } from './icons';

// The Overview panels are hand-rolled tables rather than DataTables, so they
// don't inherit its export. One button here keeps them consistent with each
// other and with DataTable's, instead of three near-copies.
//
// Their rows are already in memory (the panel is rendering them), so there is
// nothing to page through -- but they go through the same ExportDialog so the
// format choice, column choice, filename and success state match the tables.
export function ExportButton<T>({
  rows,
  columns,
  dataset,
  defaultSelected,
  scope,
}: {
  columns: CsvColumn<T>[];
  dataset: string;
  /** Column keys ticked on open. Defaults to all of them. */
  defaultSelected?: string[];
  rows: T[];
  scope?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Export ${dataset}`}
        disabled={rows.length === 0}
        // print:hidden -- it's a control, not content, and these panels are
        // on the Overview printout.
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-rule-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 disabled:opacity-50 print:hidden"
      >
        <IconDownload className="h-3.5 w-3.5" />
        Export
      </button>

      {open && (
        <ExportDialog<T>
          columns={columns}
          dataset={dataset}
          defaultSelected={defaultSelected}
          scope={scope}
          estimatedRows={rows.length}
          collect={async () => rows}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
