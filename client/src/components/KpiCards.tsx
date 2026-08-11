import Decimal from 'decimal.js';
import { Line, LineChart } from 'recharts';
import { formatMoney, formatPercent } from '../lib/formatMoney';
import { computeDeltaPct } from '../lib/deltas';
import { useCostTrend } from '../hooks/useDashboardAnalytics';
import { IconTrendDown, IconTrendUp } from './icons';
import type { ProjectKpis } from '../types';

// Stat-tile trend spec (dataviz skill): the line itself is the de-emphasis
// hue -- it's context, not a second thing to decode -- with only the
// current period picked out, in the accent. Colors are literal `var(--x)`
// strings, not a getComputedStyle() snapshot (see CostTrendChart's header
// comment) so they re-resolve live under print/theme change.
function Sparkline({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  const data = points.map((value, i) => ({ i, value }));

  return (
    <LineChart width={64} height={24} data={data}>
      <Line
        dataKey="value"
        stroke="var(--color-rule-strong)"
        strokeWidth={2}
        dot={(props: { cx?: number; cy?: number; index?: number }) => {
          const isLast = props.index === data.length - 1;
          // Recharts requires a rendered element per point even when hidden;
          // cx/cy are only absent before the chart has laid out (never in
          // practice here, since dot only renders post-layout).
          return (
            <circle
              key={props.index}
              cx={props.cx ?? 0}
              cy={props.cy ?? 0}
              r={isLast ? 2.5 : 0}
              fill={isLast ? 'var(--color-accent)' : 'none'}
              stroke="none"
            />
          );
        }}
        isAnimationActive={false}
      />
    </LineChart>
  );
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
    // print:grid-cols-3 -- 5 cards in a 2-col grid orphans the 5th alone on
    // its own row; 3+2 is a normal-looking remainder, not a visible gap.
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5 print:grid-cols-3">
      <Card label="Budget" value={formatMoney(kpis.total_budget)} note="Total approved" />
      <Card
        label="Committed"
        value={formatMoney(kpis.total_committed)}
        note={`${formatPercent(kpis.committed_pct ? String(Number(kpis.committed_pct) / 100) : null)} of budget`}
        delta={committedDelta}
        sparkline={committedPoints.length > 1 ? <Sparkline points={committedPoints} /> : undefined}
      />
      <Card
        label="Paid (check issued)"
        value={formatMoney(kpis.total_disbursed)}
        note="Cash actually paid out"
        delta={disbursedDelta}
        sparkline={disbursedPoints.length > 1 ? <Sparkline points={disbursedPoints} /> : undefined}
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
      {/* Only 2 of 5 cards have a delta/sparkline (no prior-month baseline
          for Budget or either Remaining card) -- fine on screen, but reads
          as broken/inconsistent on a printed page shown side by side with
          cards that plainly have nothing there. Print always shows the
          plain note instead, uniformly across all 5 cards. */}
      <div className="flex items-center justify-between gap-2 no-print">
        {delta ? <DeltaTag direction={delta.direction} pct={delta.pct} /> : <span className="text-[13px] text-ink-faint">{note}</span>}
        {sparkline}
      </div>
      {delta && <p className="mt-1 text-[11px] text-ink-faint no-print">{note}</p>}
      <p className="hidden text-[13px] text-ink-faint print:block">{note}</p>
    </div>
  );
}
