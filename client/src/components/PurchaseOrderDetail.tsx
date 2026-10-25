import { useState } from 'react';
import {
  usePurchaseOrderDetail,
  useRestorePoPayment,
  useVoidedPoPayments,
  useVoidPoPayment,
  useVoidPurchaseOrder,
} from '../hooks/usePurchaseOrders';
import { formatCurrency, formatMoney, formatPercent } from '../lib/formatMoney';
import { RecordPaymentForm } from './RecordPaymentForm';
import { PurchaseOrderAttachments } from './PurchaseOrderAttachments';
import { DeletedItemsModal } from './DeletedItemsModal';
import { PurchaseOrderForm } from './PurchaseOrderForm';
import { Modal } from './Modal';
import { HeaderLineSkeleton, StatGridSkeleton } from './Skeleton';
import { ExportButton } from './ExportButton';
import { type CsvColumn } from '../lib/exportCsv';
import type { POPayment, POPaymentTerm, PurchaseOrderDetail as PoDetail } from '../types';

// Two tables, so two exports rather than one file that welds them together.
// Both carry por_no so a file on its own still says which PO it came from.
//
// Milestones are the truth about payment terms -- po.payment_terms is free
// text the source spells ~8 real patterns 31 different ways (CLAUDE.md #8),
// so it is deliberately not what gets exported here.
const milestoneColumns = (po: PoDetail): CsvColumn<POPaymentTerm>[] => [
  { key: 'por_no', label: 'PO No.', csvValue: () => po.por_no },
  { key: 'seq', label: 'Seq' },
  { key: 'label', label: 'Milestone' },
  // The stored fraction, not "50.0%" -- a spreadsheet should get a number
  // it can multiply, same as every other amount in these exports.
  { key: 'pct', label: 'Pct of contract' },
  { key: 'kind', label: 'Kind' },
  { key: 'is_holdback', label: 'Holdback', csvValue: (m) => (m.is_holdback ? 'Yes' : 'No') },
];

// Native amount, rate and peso amount all ship. A foreign PO entered as
// PHP @ 1.0 is the trap that opened a PHP 58 M hole on item 10.0
// (CLAUDE.md #7); an export that carried only the peso figure would hide
// exactly that, and the three columns together make it checkable.
const paymentColumns = (po: PoDetail): CsvColumn<POPayment>[] => [
  { key: 'por_no', label: 'PO No.', csvValue: () => po.por_no },
  { key: 'supplier', label: 'Supplier', csvValue: () => po.supplier },
  // "Paid" is invoice received and check issued, not check cleared
  // (CLAUDE.md #5) -- the label carries that into the file.
  { key: 'paid_on', label: 'Paid on (check issued)' },
  { key: 'payment_type', label: 'Type' },
  { key: 'currency', label: 'Currency' },
  { key: 'amount', label: 'Amount (native)' },
  { key: 'fx_rate', label: 'FX rate' },
  { key: 'amount_php', label: 'Amount (PHP)' },
  // Live native share, not the stored pct_of_contract only the ETL filled.
  { key: 'share_of_contract', label: 'Pct of contract' },
  { key: 'voucher_no', label: 'Voucher no.' },
  { key: 'remarks', label: 'Remarks' },
];

// Retention is stated here rather than as a row in the payments file:
// it is not a payable and must never be folded into a balance (CLAUDE.md #8).
function paymentScope(po: PoDetail): string {
  const parts = [
    `contract ${po.contract_amount_php} PHP`,
    `paid ${po.paid_php}`,
    `balance ${po.balance_php}`,
  ];
  if (po.retention) parts.push(`retention held ${po.retention.retention_amount} (not a payable)`);
  return parts.join(', ');
}

export function PurchaseOrderDetail({ poId, onClose }: { poId: number; onClose: () => void }) {
  const { data: po, isLoading, error } = usePurchaseOrderDetail(poId);
  const voidPo = useVoidPurchaseOrder(poId);
  const voidPayment = useVoidPoPayment(poId);
  const restorePayment = useRestorePoPayment(poId);
  const [showDeletedPayments, setShowDeletedPayments] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const voidedPayments = useVoidedPoPayments(poId, showDeletedPayments);

  if (isLoading)
    return (
      <div className="flex flex-col gap-4">
        <HeaderLineSkeleton />
        <StatGridSkeleton count={4} gridClassName="sm:grid-cols-2 lg:grid-cols-4" />
      </div>
    );
  if (error) return <p className="text-sm text-danger">Couldn't load this PO ({error.message}).</p>;
  if (!po) return null;

  async function handleDeletePo() {
    const reason = window.prompt('Reason for deleting this PO (optional):');
    if (reason === null) return;
    if (
      !window.confirm(
        'Delete this entire purchase order, including its payments? You can restore it later from "Deleted items".',
      )
    ) {
      return;
    }
    await voidPo.mutateAsync(reason || undefined);
    onClose();
  }

  function handleDeletePayment(p: POPayment) {
    const reason = window.prompt('Reason for deleting this payment (optional):');
    if (reason === null) return;
    voidPayment.mutate({ paymentId: p.id, reason: reason || undefined });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowDeletedPayments(true)}
            className="text-sm font-medium text-ink-muted hover:text-ink hover:underline"
          >
            Deleted payments
          </button>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowEdit(true)}
            className="text-sm font-medium text-accent hover:underline"
          >
            Edit PO
          </button>
          <button
            type="button"
            onClick={handleDeletePo}
            disabled={voidPo.isPending}
            className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
          >
            {voidPo.isPending ? 'Deleting…' : 'Delete this PO'}
          </button>
        </div>
      </div>

      {voidPo.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {voidPo.error.message}
        </p>
      )}
      {voidPayment.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          {voidPayment.error.message}
        </p>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Info label="Supplier" value={po.supplier} />
        <Info label="MSR number" value={po.msr_no ?? '—'} />
        <Info label="Budget item" value={po.item_no ? `${po.item_no} ${po.budget_item ?? ''}` : '—'} />
        <Info label="Description" value={po.item_description ?? '—'} />
        <Info label="Reference no." value={po.ref_no ?? '—'} />
        <Info label="PO date" value={po.po_date ?? '—'} />
        <Info
          label="Contract amount"
          value={
            po.currency === 'PHP'
              ? formatMoney(po.contract_amount_php)
              : `${formatCurrency(po.contract_amount, po.currency)} @ ${po.fx_rate} = ${formatMoney(po.contract_amount_php)}`
          }
        />
        <Info label="Paid" value={formatMoney(po.paid_php)} />
        <Info label="Balance" value={formatMoney(po.balance_php)} />
        <Info label="Payment terms" value={po.payment_terms ?? '—'} />
        <Info label="Status" value={po.status.replace('_', ' ')} />
      </div>

      {po.remarks && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">{po.remarks}</p>
      )}

      <Section
        title="Payment terms / milestones"
        action={
          <ExportButton
            rows={po.milestones}
            columns={milestoneColumns(po)}
            dataset={`PO ${po.por_no} milestones`}
            scope={`${po.supplier}; contract ${po.contract_amount_php} PHP`}
          />
        }
      >
        {po.milestones.length === 0 ? (
          <p className="text-sm text-ink-faint">No milestones recorded.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                <th className="py-1.5 pr-3">Seq</th>
                <th className="py-1.5 pr-3">Label</th>
                <th className="py-1.5 pr-3 text-right">Pct</th>
                <th className="py-1.5 pr-3">Kind</th>
                <th className="py-1.5">Holdback</th>
              </tr>
            </thead>
            <tbody>
              {po.milestones.map((m) => (
                <tr key={m.id} className="border-t border-rule">
                  <td className="py-1.5 pr-3">{m.seq}</td>
                  <td className="py-1.5 pr-3">{m.label}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatPercent(m.pct)}</td>
                  <td className="py-1.5 pr-3">{m.kind}</td>
                  <td className="py-1.5">{m.is_holdback ? 'Yes' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title="Payments"
        action={
          <ExportButton
            rows={po.payments}
            columns={paymentColumns(po)}
            dataset={`PO ${po.por_no} payments`}
            scope={paymentScope(po)}
          />
        }
      >
        {po.payments.length === 0 ? (
          <p className="text-sm text-ink-faint">No payments recorded yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                <th className="py-1.5 pr-3">Paid on</th>
                <th className="py-1.5 pr-3">Type</th>
                <th className="py-1.5 pr-3 text-right">Amount</th>
                <th className="py-1.5 pr-3 text-right">% of contract</th>
                <th className="py-1.5 pr-3">Voucher</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {po.payments.map((p) => (
                <tr key={p.id} className="border-t border-rule">
                  <td className="py-1.5 pr-3">{p.paid_on ?? '—'}</td>
                  <td className="py-1.5 pr-3">{p.payment_type}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    <NativeAmount native={p.amount} php={p.amount_php} currency={p.currency} />
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatPercent(p.share_of_contract ?? null)}</td>
                  <td className="py-1.5 pr-3">{p.voucher_no ?? '—'}</td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeletePayment(p)}
                      disabled={voidPayment.isPending}
                      className="text-xs font-medium text-danger hover:underline disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Native currency, same basis as the row %s. Retention stays in
                its own section below, never netted out of Unpaid (CLAUDE.md #8). */}
            <tfoot>
              <tr className="border-t border-rule-strong font-medium">
                <td className="py-1.5 pr-3" colSpan={2}>
                  Total paid (check issued)
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  <NativeAmount native={po.payment_totals.paid} php={po.paid_php} currency={po.currency} />
                </td>
                <td
                  className={`py-1.5 pr-3 text-right tabular-nums ${
                    Number(po.payment_totals.paid_pct) > 1 ? 'text-danger' : ''
                  }`}
                >
                  {formatPercent(po.payment_totals.paid_pct)}
                </td>
                <td colSpan={2}></td>
              </tr>
              <tr className="text-ink-muted">
                <td className="py-1.5 pr-3" colSpan={2}>
                  Unpaid
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  <NativeAmount native={po.payment_totals.unpaid} php={po.balance_php} currency={po.currency} />
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{formatPercent(po.payment_totals.unpaid_pct)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </Section>

      {po.status !== 'cancelled' && (
        <RecordPaymentForm
          poId={po.id}
          currency={po.currency}
          contractAmount={po.contract_amount}
          paidAmount={po.payment_totals.paid}
        />
      )}

      {po.retention && (
        <Section title="Retention — not a payable, held until milestone reached">
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Info label="Retention rate" value={formatPercent(po.retention.retention_pct)} />
            <Info label="Held" value={formatMoney(po.retention.retention_amount)} />
            <Info label="Released" value={formatMoney(po.retention.retention_released)} />
            <Info label="Outstanding" value={formatMoney(po.retention.retention_outstanding)} />
          </div>
        </Section>
      )}

      <PurchaseOrderAttachments poId={po.id} attachments={po.attachments} />

      {showEdit && (
        <Modal title={`Edit ${po.por_no}`} onClose={() => setShowEdit(false)}>
          <PurchaseOrderForm po={po} onClose={() => setShowEdit(false)} />
        </Modal>
      )}

      {showDeletedPayments && (
        <DeletedItemsModal<POPayment>
          title="Deleted payments"
          items={voidedPayments.data}
          isLoading={voidedPayments.isLoading}
          onRestore={(id) => restorePayment.mutateAsync(id)}
          onClose={() => setShowDeletedPayments(false)}
          renderRow={(p) => (
            <>
              <div className="font-medium">
                {p.paid_on ?? '—'} — {p.payment_type} —{' '}
                {p.currency === 'PHP' ? formatMoney(p.amount_php) : `${formatCurrency(p.amount, p.currency)} (${formatMoney(p.amount_php)})`}
              </div>
              {p.void_reason && <div className="mt-1 text-xs text-ink-faint">&quot;{p.void_reason}&quot;</div>}
            </>
          )}
        />
      )}
    </div>
  );
}

// "$1,000.00 (₱58,599.00)" for a foreign PO, plain peso for a PHP one.
function NativeAmount({ native, php, currency }: { native: string; php: string; currency: string }) {
  if (currency === 'PHP') return <>{formatMoney(php)}</>;
  return (
    <>
      {formatCurrency(native, currency)} <span className="text-ink-faint">({formatMoney(php)})</span>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

// action mirrors Panel's slot -- same job, and the export buttons should sit
// in the same place here as they do on the Overview sections.
function Section({
  title,
  action,
  children,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}
