import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api';
import { clientPaginate } from '../lib/clientPaginate';
import { formatMoney } from '../lib/formatMoney';
import { PROJECT_ID } from '../hooks/useProjectData';
import { LEDGER_PATHS, useMarkReviewed, useReviewItems } from '../hooks/useReview';
import { DataTable, type ColumnDef, type FetchParams } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { StatusPill } from '../components/StatusPill';
import { ReplenishmentForm } from '../components/ReplenishmentForm';
import { CashAdvanceForm } from '../components/CashAdvanceForm';
import { AdditionalPaymentForm } from '../components/AdditionalPaymentForm';
import { PurchaseOrderDetail } from '../components/PurchaseOrderDetail';
import type { AdditionalPayment, CashAdvance, Replenishment, ReviewItem, ReviewSource } from '../types';

const SOURCE_LABEL: Record<ReviewSource, string> = {
  replenishment: 'Replenishment',
  cash_advance: 'Cash advance',
  additional_payment: 'Additional payment',
  purchase_order: 'Purchase order',
  po_payment: 'PO payment',
  payroll_entry: 'Payroll entry',
  payroll_period: 'Payroll week',
};

// Opens the same edit form the ledger's own page uses, loaded by id in the
// list's own row shape -- so a fix here is validated and audited the same way.
function LedgerFixModal({ item, onClose }: { item: ReviewItem; onClose: () => void }) {
  const path = LEDGER_PATHS[item.source];
  const { data: row, error } = useQuery({
    queryKey: ['review-row', item.key],
    queryFn: async () =>
      (await fetchJson<{ rows: Record<string, unknown>[] }>(`/api/projects/${PROJECT_ID}/${path}?id=${item.id}`)).rows[0],
  });

  return (
    <Modal title={`Fix ${SOURCE_LABEL[item.source].toLowerCase()}`} onClose={onClose}>
      {error ? (
        <p className="text-sm text-danger">{error.message}</p>
      ) : !row ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : item.source === 'replenishment' ? (
        <ReplenishmentForm replenishment={row as unknown as Replenishment} onClose={onClose} />
      ) : item.source === 'cash_advance' ? (
        <CashAdvanceForm cashAdvance={row as unknown as CashAdvance} onClose={onClose} />
      ) : (
        <AdditionalPaymentForm payment={row as unknown as AdditionalPayment} onClose={onClose} />
      )}
    </Modal>
  );
}

// Every row the Overview alerts count, in one place, each with a way to fix
// it. Rows leave the list once fixed -- nothing here is ever hidden or
// auto-corrected (CLAUDE.md: data quality is a feature).
export function Review() {
  const navigate = useNavigate();
  const { data: items, dataUpdatedAt, error } = useReviewItems();
  const markReviewed = useMarkReviewed();
  const [reason, setReason] = useState('');
  const [fixing, setFixing] = useState<ReviewItem | null>(null);

  const reasonCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items ?? []) for (const r of item.reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
    return [...counts.entries()];
  }, [items]);

  // Stable apart from the reason filter: a refetch after a fix reloads the
  // table in place (refreshKey), a new reason goes back to page 1.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const fetchItems = useCallback(
    async (params: FetchParams) =>
      clientPaginate(
        (itemsRef.current ?? []).filter((i) => !reason || i.reasons.includes(reason)),
        params,
        ['reference', 'party', 'description'],
      ),
    [reason],
  );

  function fix(item: ReviewItem) {
    if (item.source === 'payroll_entry' || item.source === 'payroll_period') {
      navigate(`/payroll/${item.parent_id}`);
    } else {
      setFixing(item);
    }
  }

  // Any save made in the fix form refreshes everything (main.tsx), so
  // closing only has to close.
  function closeFix() {
    setFixing(null);
  }

  const columns: ColumnDef<ReviewItem>[] = [
    {
      key: 'reasons',
      label: 'Why',
      cardTitle: true,
      render: (_, row) => (
        <div className="flex flex-wrap gap-1">
          {row.reasons.map((r) => (
            <StatusPill key={r} tone={row.severity}>
              {r}
            </StatusPill>
          ))}
        </div>
      ),
    },
    { key: 'source', label: 'Type', render: (value) => SOURCE_LABEL[value as ReviewSource] },
    { key: 'date', label: 'Date', render: (value) => (value as string | null) ?? '—' },
    { key: 'reference', label: 'Reference', cardSubtitle: true, render: (value) => (value as string | null) || '—' },
    { key: 'party', label: 'Supplier / payee', render: (value) => (value as string | null) || '—' },
    { key: 'description', label: 'Description', render: (value) => (value as string | null) || '—' },
    {
      key: 'amount',
      label: 'Amount',
      align: 'right',
      render: (value) => <span className="font-mono">{value == null ? '—' : formatMoney(value as string)}</span>,
    },
    {
      key: 'flagged',
      label: '',
      render: (_, row) =>
        row.flagged ? (
          <button
            type="button"
            // The row itself opens Fix; this button must not.
            onClick={(e) => {
              e.stopPropagation();
              markReviewed.mutate(row);
            }}
            disabled={markReviewed.isPending}
            title="The row is correct as it is -- clear its review flag"
            className="rounded-sm border border-rule-strong px-2 py-1 text-xs font-medium whitespace-nowrap text-ink-muted hover:bg-surface-2 disabled:opacity-60"
          >
            Mark reviewed
          </button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold text-ink">Needs review</h2>
        <p className="text-sm text-ink-muted">
          Every row the Overview alerts count. Open one to fix it; it leaves this list once nothing is wrong with it.
        </p>
      </div>

      {error && <p className="text-sm text-danger">Couldn’t load the review list: {error.message}</p>}
      {markReviewed.error && (
        <p className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
          Couldn’t clear the flag: {markReviewed.error.message}. Open the row and fix it instead.
        </p>
      )}

      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-fit rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      >
        <option value="">All problems ({items?.length ?? 0})</option>
        {reasonCounts.map(([r, n]) => (
          <option key={r} value={r}>
            {r} ({n})
          </option>
        ))}
      </select>

      <DataTable<ReviewItem>
        columns={columns}
        fetchData={fetchItems}
        refreshKey={dataUpdatedAt}
        rowKey="key"
        onView={fix}
        title="Needs review"
        perPageOptions={[25, 50, 100]}
        searchPlaceholder="Search reference, supplier, or description…"
        emptyMessage="Nothing needs review."
      />

      {fixing &&
        (fixing.source === 'purchase_order' || fixing.source === 'po_payment' ? (
          <Modal title={`${fixing.reference ?? 'PO'} — ${fixing.party ?? ''}`} onClose={closeFix}>
            <PurchaseOrderDetail poId={fixing.parent_id as number} onClose={closeFix} />
          </Modal>
        ) : (
          <LedgerFixModal item={fixing} onClose={closeFix} />
        ))}
    </div>
  );
}
