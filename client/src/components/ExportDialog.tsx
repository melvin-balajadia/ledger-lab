import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { SITE_NAME } from '../site.config';
import {
  EXPORT_FORMATS,
  exportFilename,
  downloadText,
  serialize,
  validateExport,
  type CsvColumn,
  type ExportFormat,
} from '../lib/exportCsv';
import { IconCheck, IconDownload, IconAlertCircle } from './icons';

export interface ExportCollectContext {
  /** Called as pages arrive. `total` may be an estimate until the last page. */
  onProgress: (loaded: number, total: number) => void;
  /** Aborted when she cancels or closes the dialog mid-export. */
  signal: AbortSignal;
}

export interface ExportDialogProps<T> {
  /** Every exportable column, in the order they should appear in the file. */
  columns: CsvColumn<T>[];
  /**
   * Produces the rows. In-memory panels just return their array; paged tables
   * hand this straight to fetchAllPages so progress and cancel work.
   */
  collect: (ctx: ExportCollectContext) => Promise<T[]>;
  /** Names the file and the JSON `dataset` field, e.g. "Purchase Orders". */
  dataset: string;
  /** Column keys ticked on open. Defaults to all of them. */
  defaultSelected?: string[];
  /** Row count as currently known, for the button label before it runs. */
  estimatedRows?: number;
  onClose: () => void;
  /** One line describing the active filters, recorded in the JSON header. */
  scope?: string;
}

type Phase = 'configuring' | 'running' | 'done' | 'error';

interface Progress {
  loaded: number;
  total: number;
}

// The Export button used to open a bare column checklist that closed the
// moment the loop finished -- no format choice, no progress on a 3,822-row
// payroll export, no way to stop one, and no confirmation that a file was
// actually written. This is that dialog with the whole flow in it, shared by
// DataTable and the Overview panels so both behave the same.
export function ExportDialog<T>({
  columns,
  collect,
  dataset,
  defaultSelected,
  estimatedRows,
  onClose,
  scope,
}: ExportDialogProps<T>) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSelected ?? columns.map((c) => c.key)),
  );
  const [phase, setPhase] = useState<Phase>('configuring');
  const [progress, setProgress] = useState<Progress>({ loaded: 0, total: estimatedRows ?? 0 });
  const [message, setMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // Guards a second run from a double-click or an Enter keypress landing
  // between the click and React committing phase === "running". Without it
  // the browser gets two downloads of the same file.
  const runningRef = useRef(false);

  // Closing (X, Escape, backdrop) while rows are still coming in has to stop
  // the loop, otherwise it keeps paging against an unmounted dialog and
  // eventually drops a surprise file into Downloads.
  useEffect(() => () => abortRef.current?.abort(), []);

  const chosenColumns = columns.filter((c) => selected.has(c.key));

  async function run() {
    if (runningRef.current) return;
    runningRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setMessage(null);
    setProgress({ loaded: 0, total: estimatedRows ?? 0 });

    try {
      const rows = await collect({
        signal: controller.signal,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      });
      if (controller.signal.aborted) return;

      // Validate before serialising, so a file is never written from an
      // export that can't be right.
      const problem = validateExport(rows, chosenColumns);
      if (problem) {
        setMessage(problem);
        setPhase('error');
        return;
      }

      const filename = exportFilename(dataset, format, { site: SITE_NAME });
      downloadText(
        serialize(rows, chosenColumns, format, { dataset, site: SITE_NAME, scope }),
        filename,
        format,
      );
      setProgress({ loaded: rows.length, total: rows.length });
      setMessage(filename);
      setPhase('done');
    } catch (err) {
      if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        setPhase('configuring');
        return;
      }
      // Surface the real reason where there is one -- "Export failed, please
      // try again" told her nothing about a dropped session or a 500.
      setMessage(err instanceof Error ? err.message : 'Export failed. Please try again.');
      setPhase('error');
    } finally {
      runningRef.current = false;
    }
  }

  function cancel() {
    // runningRef is cleared by run()'s finally, so the aborted call still
    // owns it until it actually unwinds -- a fast re-click can't overlap.
    abortRef.current?.abort();
    setPhase('configuring');
  }

  const running = phase === 'running';
  const pct = progress.total > 0 ? Math.min(100, (progress.loaded / progress.total) * 100) : 0;

  return (
    <Modal title={`Export ${dataset}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {phase === 'done' ? (
          <DoneState
            filename={message ?? ''}
            rowCount={progress.loaded}
            onAgain={() => setPhase('configuring')}
            onClose={onClose}
          />
        ) : (
          <>
            {phase === 'error' && message && (
              <p className="flex items-start gap-2 rounded-sm border border-danger bg-danger-soft px-3 py-2 text-xs text-danger">
                <IconAlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{message}</span>
              </p>
            )}

            <Fieldset label="Format">
              <div className="flex flex-col gap-1.5">
                {EXPORT_FORMATS.map((f) => (
                  <label
                    key={f.value}
                    className="flex cursor-pointer items-start gap-2.5 rounded-sm px-1 py-1 hover:bg-surface-2"
                  >
                    <input
                      type="radio"
                      name="export-format"
                      checked={format === f.value}
                      onChange={() => setFormat(f.value)}
                      disabled={running}
                      className="mt-0.5 h-4 w-4 border-rule-strong text-accent focus:ring-accent"
                    />
                    <span>
                      <span className="block text-sm text-ink">{f.label}</span>
                      <span className="block text-xs text-ink-faint">{f.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Fieldset>

            <Fieldset
              label={`Columns (${chosenColumns.length} of ${columns.length})`}
              action={
                <div className="flex gap-3 text-xs font-medium">
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => setSelected(new Set(columns.map((c) => c.key)))}
                    className="text-accent hover:underline disabled:opacity-50"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => setSelected(new Set())}
                    className="text-accent hover:underline disabled:opacity-50"
                  >
                    None
                  </button>
                </div>
              }
            >
              <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
                {columns.map((col) => (
                  <label
                    key={col.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-sm px-1 py-1.5 text-sm text-ink hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(col.key)}
                      disabled={running}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(col.key)) next.delete(col.key);
                          else next.add(col.key);
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-rule-strong text-accent focus:ring-accent"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            </Fieldset>

            {running && (
              <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    // An indeterminate source (an in-memory panel) reports no
                    // total, so show a filled bar rather than a stuck-at-zero one.
                    style={{ width: progress.total > 0 ? `${pct}%` : '100%' }}
                  />
                </div>
                <p className="font-mono text-xs tabular-nums text-ink-muted">
                  {progress.total > 0
                    ? `${progress.loaded.toLocaleString()} of ${progress.total.toLocaleString()} rows`
                    : 'Collecting rows…'}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-rule pt-3">
              <button
                type="button"
                onClick={running ? cancel : onClose}
                className="rounded-sm border border-rule-strong px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={run}
                disabled={running || chosenColumns.length === 0}
                className="inline-flex items-center gap-1.5 rounded-sm bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                <IconDownload className="h-3.5 w-3.5" />
                {running
                  ? 'Exporting…'
                  : `Export${estimatedRows ? ` ${estimatedRows.toLocaleString()} rows` : ''} as ${format.toUpperCase()}`}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function DoneState({
  filename,
  rowCount,
  onAgain,
  onClose,
}: {
  filename: string;
  onAgain: () => void;
  onClose: () => void;
  rowCount: number;
}) {
  return (
    <>
      <div className="flex items-start gap-2.5 rounded-sm border border-success bg-success-soft px-3 py-3">
        <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {rowCount.toLocaleString()} row{rowCount === 1 ? '' : 's'} exported
          </p>
          {/* break-all: the filename carries the site, dataset and date, so
              it is long enough to overflow the dialog on a narrow window. */}
          <p className="break-all font-mono text-xs text-ink-muted">{filename}</p>
        </div>
      </div>
      <p className="text-xs text-ink-faint">
        Check your browser's Downloads folder. Amounts are exported unformatted so the spreadsheet can sum them.
      </p>
      <div className="flex items-center justify-end gap-2 border-t border-rule pt-3">
        <button
          type="button"
          onClick={onAgain}
          className="rounded-sm border border-rule-strong px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2"
        >
          Export again
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm bg-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-strong"
        >
          Done
        </button>
      </div>
    </>
  );
}

function Fieldset({
  label,
  action,
  children,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
