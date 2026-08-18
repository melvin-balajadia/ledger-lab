import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBudgetItemDetail } from '../hooks/useBudgetItemDetail';
import { useWbs } from '../hooks/useWbs';
import { formatMoney, formatPercent } from '../lib/formatMoney';
import { BudgetRevisionsTable } from '../components/BudgetRevisionsTable';
import { RecordRevisionForm } from '../components/RecordRevisionForm';
import { BudgetItemDetailsForm } from '../components/BudgetItemDetailsForm';
import { WbsTable } from '../components/WbsTable';
import { PlanningLineForm } from '../components/PlanningLineForm';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import type { PlanningLine, WbsRow } from '../types';

function toPlanningLine(row: WbsRow): PlanningLine {
  return {
    id: row.planning_line_id,
    code: row.code,
    parent_id: row.parent_id,
    depth: row.depth,
    description: row.description,
    budget_item_id: row.budget_item_id,
    budget_amount: row.budget_amount,
  };
}

export function BudgetItemDetail() {
  const { id } = useParams();
  const budgetItemId = Number(id);
  const { data: item, isLoading, error } = useBudgetItemDetail(budgetItemId);
  const { data: wbsRows, isLoading: wbsLoading } = useWbs(budgetItemId);
  const [lineModal, setLineModal] = useState<'create' | PlanningLine | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/" className="w-fit text-sm text-accent hover:underline">
        ← Back to Overview
      </Link>

      {isLoading && <p className="text-[15px] text-ink-muted">Loading…</p>}
      {error && <p className="text-[15px] text-danger">Couldn't reach the API ({error.message}).</p>}

      {item && (
        <>
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">
              {item.item_no} {item.description}
            </h2>
            {item.is_over_budget === 1 && (
              <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-danger uppercase before:h-1.5 before:w-1.5 before:rounded-full before:bg-danger before:content-['']">
                Over budget
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-px border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Budget" value={formatMoney(item.budget)} />
            <Stat label="Committed" value={formatMoney(item.contract_amount)} note={formatPercent(item.commitment_ratio)} />
            <Stat label="Disbursed" value={formatMoney(item.total_disbursed)} />
            <div className="flex flex-col gap-2 bg-surface p-5">
              <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Remaining</span>
              <div className="flex flex-col gap-2">
                <div>
                  <span className="font-display text-lg tabular-nums text-ink">{formatMoney(item.remaining_vs_contract)}</span>
                  <p className="text-[13px] text-ink-faint">vs. contract</p>
                </div>
                <div>
                  <span className="font-display text-lg tabular-nums text-ink">{formatMoney(item.remaining_vs_disbursed)}</span>
                  <p className="text-[13px] text-ink-faint">vs. disbursed</p>
                </div>
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <h3 className="font-display text-lg font-semibold text-ink">Budget revisions</h3>
            <BudgetRevisionsTable revisions={item.revisions} />
            <RecordRevisionForm budgetItemId={budgetItemId} currentBudget={item.budget} />
            <BudgetItemDetailsForm
              key={budgetItemId}
              budgetItemId={budgetItemId}
              description={item.description}
              budget={item.budget}
              contractAmount={item.contract_amount}
              procurementMode={item.procurement_mode}
              remarks={item.remarks}
              revisionCount={item.revision_count}
            />
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-ink">WBS / JPL breakdown</h3>
              <Button type="button" onClick={() => setLineModal('create')}>
                + New line
              </Button>
            </div>
            {wbsLoading && <p className="text-sm text-ink-muted">Loading…</p>}
            {wbsRows && <WbsTable rows={wbsRows} onEdit={(row) => setLineModal(toPlanningLine(row))} />}
          </section>

          {lineModal && (
            <Modal title={lineModal === 'create' ? 'New JPL / WBS line' : 'Edit line'} onClose={() => setLineModal(null)}>
              <PlanningLineForm
                line={lineModal === 'create' ? undefined : lineModal}
                budgetItemNo={item.item_no}
                onClose={() => setLineModal(null)}
              />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; note?: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface p-5">
      <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className="font-display text-2xl tabular-nums text-ink">{value}</span>
      {note && <span className="text-[13px] text-ink-faint">{note}</span>}
    </div>
  );
}
