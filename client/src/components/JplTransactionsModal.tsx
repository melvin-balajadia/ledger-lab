import { useWbsTransactions } from '../hooks/useWbs';
import { formatMoney, sumMoney } from '../lib/formatMoney';
import { Modal } from './Modal';
import { StatusPill } from './StatusPill';
import type { WbsRow, WbsTransaction } from '../types';

// What is actually inside one JPL code, summarised per ledger first and then
// listed in full. Contract rows (the PO award) are kept and totalled apart
// from the cash-out rows -- CLAUDE.md rule #1 -- so no figure in here ever
// mixes a commitment with cash paid.
//
// Fixed ledger order rather than whatever the data happens to return, and it
// matches the column order on the Cost by JPL code panel so the two read the
// same way round.
const LEDGER_ORDER = ['Replenishment', 'PO Paid', 'Cash Advance', 'Additional Payment', 'Payroll'];

function byLedger(rows: WbsTransaction[]) {
  const groups = new Map<string, WbsTransaction[]>();
  for (const row of rows) {
    const bucket = groups.get(row.source);
    if (bucket) bucket.push(row);
    else groups.set(row.source, [row]);
  }
  return [...groups.entries()]
    .map(([source, items]) => ({ source, items, total: sumMoney(items.map((i) => i.amount)) }))
    .sort((a, b) => {
      // Anything unrecognised sorts last rather than silently first.
      const ai = LEDGER_ORDER.indexOf(a.source);
      const bi = LEDGER_ORDER.indexOf(b.source);
      return (ai === -1 ? LEDGER_ORDER.length : ai) - (bi === -1 ? LEDGER_ORDER.length : bi);
    });
}

export function JplTransactionsModal({
  row,
  expectedContract,
  expectedDisbursed,
  onClose,
}: {
  expectedContract: string;
  expectedDisbursed: string;
  onClose: () => void;
  row: WbsRow;
}) {
  const { data, isLoading, error } = useWbsTransactions(row.planning_line_id);

  const contractRows = data?.filter((t) => t.kind === 'contract') ?? [];
  const cashRows = data?.filter((t) => t.kind === 'disbursement') ?? [];
  const ledgers = byLedger(cashRows);
  const cashTotal = sumMoney(cashRows.map((t) => t.amount));

  return (
    <Modal title={row.description ? `${row.code} — ${row.description}` : `JPL ${row.code}`} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-px border border-rule bg-rule">
          <Figure label="Committed (POs)" value={expectedContract} />
          <Figure label="Cash out" value={expectedDisbursed} />
        </div>

        {isLoading && <p className="text-sm text-ink-muted">Loading transactions…</p>}
        {error && <p className="text-sm text-danger">Couldn't load transactions ({error.message}).</p>}

        {data && data.length === 0 && (
          <p className="text-sm text-ink-faint">No transactions recorded against this code yet.</p>
        )}

        {ledgers.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">Summary by ledger</h3>
            <div className="overflow-hidden rounded-md border border-rule">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-surface-2 text-left text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
                    <th className="px-3 py-2">Ledger</th>
                    <th className="px-3 py-2 text-right">Entries</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgers.map((l) => (
                    <tr key={l.source} className="border-t border-rule">
                      <td className="px-3 py-1.5">{l.source}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-ink-muted">
                        {l.items.length}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(l.total)}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-ink-muted">
                        {share(l.total, cashTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink font-semibold">
                    <td className="px-3 py-1.5">Total cash out</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{cashRows.length}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(cashTotal)}</td>
                    <td className="px-3 py-1.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}

        {contractRows.length > 0 && <TxnTable title="Contract awarded" rows={contractRows} />}

        {/* One table per ledger rather than a single interleaved list, so each
            ledger carries its own subtotal that ties to the summary above. */}
        {ledgers.map((l) => (
          <TxnTable key={l.source} title={l.source} rows={l.items} />
        ))}
      </div>
    </Modal>
  );
}

// Display-only percentage; the underlying figures stay DECIMAL strings.
function share(part: string, whole: string): string {
  const w = Number(whole);
  if (w === 0) return '—';
  return `${((Number(part) / w) * 100).toFixed(1)}%`;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-surface p-3.5">
      <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className="font-display text-lg tabular-nums text-ink">{value}</span>
    </div>
  );
}

function TxnTable({ title, rows }: { rows: WbsTransaction[]; title: string }) {
  const total = sumMoney(rows.map((r) => r.amount));

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-ink">
        {title} <span className="font-normal text-ink-faint">({rows.length})</span>
      </h3>
      <div className="overflow-x-auto rounded-md border border-rule">
        <table className="w-full min-w-150 border-collapse text-[13px]">
          <thead>
            <tr className="bg-surface-2 text-left text-[10px] font-semibold tracking-wide text-ink-muted uppercase">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Reference</th>
              <th className="px-3 py-2">Party / description</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={`${t.source}-${t.reference}-${i}`} className="border-t border-rule">
                <td className="px-3 py-1.5 whitespace-nowrap text-ink-muted">{t.txn_date ?? '—'}</td>
                <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">{t.reference ?? '—'}</td>
                <td className="px-3 py-1.5">
                  <span className="flex flex-col">
                    <span className="inline-flex items-center gap-1.5">
                      {t.party ?? '—'}
                      {t.needs_review === 1 && <StatusPill tone="warn">Needs review</StatusPill>}
                    </span>
                    {t.description && <span className="text-xs text-ink-faint">{t.description}</span>}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(t.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink font-semibold">
              <td className="px-3 py-1.5" colSpan={3}>
                Total
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatMoney(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
