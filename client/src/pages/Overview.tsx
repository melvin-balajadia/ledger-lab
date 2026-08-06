import { useState } from 'react';
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

const TREND_WINDOW_OPTIONS: { label: string; value: '6' | '12' | '24' }[] = [
  { label: '6M', value: '6' },
  { label: '12M', value: '12' },
  { label: '24M', value: '24' },
];

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
          <KpiCards kpis={kpis.data} />

          {vatSummary.data && <VatSummaryCards data={vatSummary.data} />}

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[2fr_1fr]">
            <div className="rounded-md border border-rule bg-surface p-5 shadow-card">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Cost trend by category</p>
                  <p className="text-xs text-ink-faint">Last {trendMonths} months of activity</p>
                </div>
                <SegmentedControl value={trendMonths} onChange={setTrendMonths} options={TREND_WINDOW_OPTIONS} />
              </div>
              {trend.data && trend.data.length > 0 ? (
                <CostTrendChart data={trend.data} />
              ) : (
                <p className="text-sm text-ink-faint">Not enough dated activity yet to chart a trend.</p>
              )}
            </div>
            <div className="rounded-md border border-rule bg-surface p-5 shadow-card">
              <div className="mb-4">
                <p className="text-sm font-semibold text-ink">Cost breakdown</p>
                <p className="text-xs text-ink-faint">All time, current totals</p>
              </div>
              {breakdown.data && <CostBreakdownDonut data={breakdown.data} />}
            </div>
          </div>

          <WeeklyBurnPanel remainingVsDisbursed={kpis.data.remaining_vs_disbursed} />

          <BudgetTable rows={summary.data} onSelect={(row) => navigate(`/budget-items/${row.budget_item_id}`)} />

          {retention.data && <RetentionPanel data={retention.data} />}

          {topSuppliers.data && <TopSuppliersPanel suppliers={topSuppliers.data} />}

          <div className="rounded-md border border-rule bg-surface p-5 shadow-card">
            <div className="mb-1">
              <p className="text-sm font-semibold text-ink">Alerts &amp; anomalies</p>
              <p className="text-xs text-ink-faint">Flags that need a look</p>
            </div>
            {alerts.data && <AlertsFeed alerts={alerts.data} />}
          </div>
        </>
      )}
    </div>
  );
}
