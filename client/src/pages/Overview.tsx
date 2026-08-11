import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectSummary, useProjectKpis } from '../hooks/useProjectData';
import { useCostBreakdown, useCostTrend, useAlerts, useRetentionSummary, useVatSummary, useTopSuppliers } from '../hooks/useDashboardAnalytics';
import { KpiCards } from '../components/KpiCards';
import { BudgetTable } from '../components/BudgetTable';
import { CostTrendChart } from '../components/CostTrendChart';
import { CostBreakdownDonut } from '../components/CostBreakdownDonut';
import { AlertsFeed } from '../components/AlertsFeed';
import { RetentionPanel } from '../components/RetentionPanel';
import { VatSummaryCards } from '../components/VatSummaryCards';
import { TopSuppliersPanel } from '../components/TopSuppliersPanel';
import { WeeklyBurnPanel } from '../components/WeeklyBurnPanel';
import { SegmentedControl } from '../components/SegmentedControl';
import { Panel } from '../components/Panel';
import { PrintOptionsModal } from '../components/PrintOptionsModal';
import { IconPrinter } from '../components/icons';
import { loadExcluded, saveExcluded, type PrintSectionKey } from '../lib/printSections';

const TREND_WINDOW_OPTIONS: { label: string; value: '6' | '12' | '24' }[] = [
  { label: '6M', value: '6' },
  { label: '12M', value: '12' },
  { label: '24M', value: '24' },
];

// Wrapper rather than a prop on each panel: only print visibility changes, so
// nothing needs to unmount and the on-screen page is untouched.
function Section({ show, children }: { children: React.ReactNode; show: boolean }) {
  return <div className={show ? undefined : 'print:hidden'}>{children}</div>;
}

export function Overview() {
  const navigate = useNavigate();
  const summary = useProjectSummary();
  const kpis = useProjectKpis();
  const [trendMonths, setTrendMonths] = useState<'6' | '12' | '24'>('6');
  const trend = useCostTrend(Number(trendMonths));
  const breakdown = useCostBreakdown();
  const alerts = useAlerts();
  const retention = useRetentionSummary();
  const vatSummary = useVatSummary();
  const topSuppliers = useTopSuppliers(10);

  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [excluded, setExcluded] = useState<Set<PrintSectionKey>>(loadExcluded);
  const shows = (key: PrintSectionKey) => !excluded.has(key);

  const update = useCallback((next: Set<PrintSectionKey>) => {
    setExcluded(next);
    saveExcluded(next);
  }, []);

  const toggle = useCallback(
    (key: PrintSectionKey) => {
      const next = new Set(excluded);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      update(next);
    },
    [excluded, update],
  );

  function handlePrint() {
    setShowPrintOptions(false);
    // window.print() is synchronous and would capture the dialog still mounted.
    // Two frames waits for React to commit the unmount and the browser to
    // paint it before handing off.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  const isLoading = summary.isLoading || kpis.isLoading;
  const error = summary.error || kpis.error;

  return (
    <div className="flex flex-col gap-6">
      {isLoading && <p className="text-[15px] text-ink-muted">Loading…</p>}

      {error && (
        <p className="text-[15px] text-danger">
          Couldn't reach the API ({error.message}). Confirm the server is running at{' '}
          {import.meta.env.VITE_API_URL || 'http://localhost:4000'}.
        </p>
      )}

      {!isLoading && !error && summary.data && kpis.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-semibold text-ink">Overview</h2>
            <button
              type="button"
              onClick={() => setShowPrintOptions(true)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-rule-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
            >
              <IconPrinter className="h-3.75 w-3.75" />
              Print / Save as PDF
            </button>
          </div>

          <Section show={shows('kpis')}>
            <KpiCards kpis={kpis.data} />
          </Section>

          {vatSummary.data && (
            <Section show={shows('vat')}>
              <VatSummaryCards data={vatSummary.data} />
            </Section>
          )}

          <Section show={shows('trend')}>
            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[2fr_1fr]">
              <Panel
                title="Cost trend by category"
                subtitle={`Last ${trendMonths} months of activity`}
                action={<SegmentedControl value={trendMonths} onChange={setTrendMonths} options={TREND_WINDOW_OPTIONS} />}
              >
                {trend.data && trend.data.length > 0 ? (
                  <CostTrendChart data={trend.data} />
                ) : (
                  <p className="text-sm text-ink-faint">Not enough dated activity yet to chart a trend.</p>
                )}
              </Panel>
              <Panel title="Cost breakdown" subtitle="All time, current totals">
                {breakdown.data && <CostBreakdownDonut data={breakdown.data} />}
              </Panel>
            </div>
          </Section>

          <Section show={shows('burn')}>
            <WeeklyBurnPanel remainingVsDisbursed={kpis.data.remaining_vs_disbursed} />
          </Section>

          <Section show={shows('budget')}>
            <BudgetTable rows={summary.data} onSelect={(row) => navigate(`/budget-items/${row.budget_item_id}`)} />
          </Section>

          {retention.data && (
            <Section show={shows('retention')}>
              <RetentionPanel data={retention.data} />
            </Section>
          )}

          {/* Paired rather than stacked -- both are narrow lists (a ranked
              bar list, a short feed of one-line flags) that were previously
              full-width blocks with mostly empty space either side. Pairing
              them removes that dead space and roughly a screen's worth of
              scroll, without compressing anything that actually needs the
              full width (the wide budget/retention tables stay full-width). */}
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {topSuppliers.data && (
              <Section show={shows('suppliers')}>
                <TopSuppliersPanel suppliers={topSuppliers.data} />
              </Section>
            )}
            <Section show={shows('alerts')}>
              <Panel title="Alerts & anomalies" subtitle="Flags that need a look">
                {alerts.data && <AlertsFeed alerts={alerts.data} />}
              </Panel>
            </Section>
          </div>

          {showPrintOptions && (
            <PrintOptionsModal
              excluded={excluded}
              onToggle={toggle}
              onSelectAll={() => update(new Set())}
              onPrint={handlePrint}
              onClose={() => setShowPrintOptions(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
