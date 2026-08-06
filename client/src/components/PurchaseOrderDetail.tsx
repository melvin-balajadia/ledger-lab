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
import type { POPayment } from '../types';

export function PurchaseOrderDetail({ poId, onClose }: { poId: number; onClose: () => void }) {
  const { data: po, isLoading, error } = usePurchaseOrderDetail(poId);
  const voidPo = useVoidPurchaseOrder(poId);
  const voidPayment = useVoidPoPayment(poId);
  const restorePayment = useRestorePoPayment(poId);
  const [showDeletedPayments, setShowDeletedPayments] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const voidedPayments = useVoidedPoPayments(poId, showDeletedPayments);

  if (isLoading) return <p className="text-sm text-ink-muted">Loading…</p>;
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

      <Section title="Payment terms / milestones">
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

      <Section title="Payments">
        {po.payments.length === 0 ? (
          <p className="text-sm text-ink-faint">No payments recorded yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                <th className="py-1.5 pr-3">Paid on</th>
                <th className="py-1.5 pr-3">Type</th>
                <th className="py-1.5 pr-3 text-right">Amount</th>
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
                    {p.currency === 'PHP' ? (
                      formatMoney(p.amount_php)
                    ) : (
                      <>
                        {formatCurrency(p.amount, p.currency)}{' '}
                        <span className="text-ink-faint">({formatMoney(p.amount_php)})</span>
                      </>
                    )}
                  </td>
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
          </table>
        )}
      </Section>

      {po.status !== 'cancelled' && <RecordPaymentForm poId={po.id} currency={po.currency} />}

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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </div>
  );
}

function Section({ title, children }: { children: React.ReactNode; title: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-rule pt-4">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{title}</span>
      {children}
    </div>
  );
}
