import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useWeeklyBurn } from '../hooks/useDashboardAnalytics';
import { computeBurnProjection } from '../lib/burnProjection';
import { formatMoney } from '../lib/formatMoney';
import { SegmentedControl } from './SegmentedControl';

Chart.register(...registerables);

const WINDOW_OPTIONS: { label: string; value: '8' | '12' | '26' | '52' }[] = [
  { label: '8W', value: '8' },
  { label: '12W', value: '12' },
  { label: '26W', value: '26' },
  { label: '52W', value: '52' },
];

function readVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatWeekLabel(weekStart: string) {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function formatLongDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function BurnChart({ data }: { data: { week_start: string; total: string }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const textColor = readVar('--color-ink-muted');
    const isDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(16,32,28,0.06)';

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: data.map((d) => formatWeekLabel(d.week_start)),
        datasets: [
          {
            label: 'Weekly spend',
            data: data.map((d) => Number(d.total)),
            backgroundColor: '#5B8DEF99',
            borderRadius: 3,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ₱${Number(ctx.parsed.y).toLocaleString()}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor, maxRotation: 0, autoSkip: true } },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, callback: (v) => `₱${Number(v).toLocaleString()}` },
          },
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [data]);

  return (
    <div className="h-55">
      <canvas ref={canvasRef} />
    </div>
  );
}

// Rebuilt from the fact tables (not v_weekly_burn -- see server/routes/projects.js
// for why). A trailing-window selector fits here specifically because this
// is a velocity chart, unlike the rest of Overview's panels which are
// current-state totals with no "as of a past date" behind them.
export function WeeklyBurnPanel({ remainingVsDisbursed }: { remainingVsDisbursed: string }) {
  // 52 weeks by default -- real spend here is lumpy around milestone
  // payments; even 26 weeks can land mostly on a quiet stretch and trip
  // computeBurnProjection's reliability guards. A full year is the
  // shortest window that reliably clears them against this project's data.
  const [weeks, setWeeks] = useState<'8' | '12' | '26' | '52'>('52');
  const burn = useWeeklyBurn(Number(weeks));

  const projection = burn.data ? computeBurnProjection(burn.data, remainingVsDisbursed) : null;

  return (
    <div className="rounded-md border border-rule bg-surface p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Weekly burn rate</p>
          <p className="text-xs text-ink-faint">All disbursement sources combined, Monday-anchored weeks</p>
        </div>
        <SegmentedControl value={weeks} onChange={setWeeks} options={WINDOW_OPTIONS} />
      </div>

      {burn.data && burn.data.length > 0 ? (
        <>
          <BurnChart data={burn.data} />
          {projection && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-rule pt-4 sm:grid-cols-3">
              <Stat label="Avg. weekly burn" value={formatMoney(projection.avgWeeklyBurn)} />
              {projection.alreadyExhausted ? (
                <Stat label="Remaining vs. disbursed" value="Already exhausted" tone="danger" />
              ) : projection.weeksRemaining === null ? (
                <Stat label="Projected runway" value="Not reliable at this window — try a longer one" />
              ) : (
                <Stat label="Projected runway" value={`~${projection.weeksRemaining} week${projection.weeksRemaining === 1 ? '' : 's'}`} />
              )}
              {projection.projectedExhaustionDate && (
                <Stat label="At this rate, exhausted by" value={formatLongDate(projection.projectedExhaustionDate)} />
              )}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-ink-faint">Not enough dated activity yet to chart weekly spend.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className={`font-mono text-sm font-semibold ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
