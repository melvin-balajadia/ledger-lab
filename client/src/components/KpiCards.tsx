import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import Decimal from 'decimal.js';
import { formatMoney, formatPercent } from '../lib/formatMoney';
import { computeDeltaPct } from '../lib/deltas';
import { useCostTrend } from '../hooks/useDashboardAnalytics';
import { IconTrendDown, IconTrendUp } from './icons';
import type { ProjectKpis } from '../types';

Chart.register(...registerables);

function Sparkline({ points, color }: { color: string; points: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || points.length === 0) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: points.map((_, i) => i),
        datasets: [{ data: points, borderColor: color, borderWidth: 2, pointRadius: 0, tension: 0.35 }],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
      },
    });
    return () => chartRef.current?.destroy();
  }, [points, color]);

  return <canvas ref={canvasRef} width={64} height={24} />;
}

function DeltaTag({ direction, pct }: { direction: 'down' | 'flat' | 'up'; pct: string }) {
  if (direction === 'flat') return null;
  const isUp = direction === 'up';
  const Icon = isUp ? IconTrendUp : IconTrendDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isUp ? 'text-danger' : 'text-success'}`}>
      <Icon className="h-2.75 w-2.75" />
      {pct}%
    </span>
  );
}

export function KpiCards({ kpis }: { kpis: ProjectKpis }) {
  const trend = useCostTrend(6);
  const months = trend.data ?? [];
  const last = months[months.length - 1];

  let committedDelta = null;
  let disbursedDelta = null;
  if (last) {
    const prevCommitted = new Decimal(kpis.total_committed).minus(last.commitment).toFixed(2);
    const prevDisbursed = new Decimal(kpis.total_disbursed).minus(last.total).toFixed(2);
    committedDelta = computeDeltaPct(kpis.total_committed, prevCommitted);
    disbursedDelta = computeDeltaPct(kpis.total_disbursed, prevDisbursed);
  }
  const committedPoints = months.map((m) => Number(m.commitment));
  const disbursedPoints = months.map((m) => Number(m.total));

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
      <Card label="Budget" value={formatMoney(kpis.total_budget)} note="Total approved" />
      <Card
        label="Committed"
        value={formatMoney(kpis.total_committed)}
        note={`${formatPercent(kpis.committed_pct ? String(Number(kpis.committed_pct) / 100) : null)} of budget`}
        delta={committedDelta}
        sparkline={committedPoints.length > 1 ? <Sparkline points={committedPoints} color="#5B8DEF" /> : undefined}
      />
      <Card
        label="Paid (check issued)"
        value={formatMoney(kpis.total_disbursed)}
        note="Cash actually paid out"
        delta={disbursedDelta}
        sparkline={disbursedPoints.length > 1 ? <Sparkline points={disbursedPoints} color="#0F6B5C" /> : undefined}
      />
      <Card label="Remaining vs. contract" value={formatMoney(kpis.remaining_vs_contract)} note="How much can still be awarded" />
      <Card label="Remaining vs. disbursed" value={formatMoney(kpis.remaining_vs_disbursed)} note="How much cash is left" />
    </div>
  );
}

function Card({
  label,
  value,
  note,
  delta,
  sparkline,
}: {
  delta?: { direction: 'down' | 'flat' | 'up'; pct: string } | null;
  label: string;
  note: string;
  sparkline?: React.ReactNode;
  value: string;
}) {
  return (
    <div className="relative rounded-md border border-rule bg-surface p-4 shadow-card">
      <div
        className="absolute inset-x-0 top-0 h-0.75 rounded-t-md opacity-55"
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, var(--color-accent) 0 2px, transparent 2px 9px)',
        }}
      />
      <span className="mb-2.5 block text-xs font-medium text-ink-muted">{label}</span>
      <span className="mb-2 block truncate font-mono text-lg leading-tight font-semibold tracking-tight text-ink" title={value}>
        {value}
      </span>
      <div className="flex items-center justify-between gap-2">
        {delta ? <DeltaTag direction={delta.direction} pct={delta.pct} /> : <span className="text-[13px] text-ink-faint">{note}</span>}
        {sparkline}
      </div>
      {delta && <p className="mt-1 text-[11px] text-ink-faint">{note}</p>}
    </div>
  );
}
