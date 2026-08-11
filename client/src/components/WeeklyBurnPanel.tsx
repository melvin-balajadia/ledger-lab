import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useWeeklyBurn } from '../hooks/useDashboardAnalytics';
import { computeBurnProjection } from '../lib/burnProjection';
import { formatMoney } from '../lib/formatMoney';
import { SegmentedControl } from './SegmentedControl';
import { Panel } from './Panel';

const WINDOW_OPTIONS: { label: string; value: '8' | '12' | '26' | '52' }[] = [
  { label: '8W', value: '8' },
  { label: '12W', value: '12' },
  { label: '26W', value: '26' },
  { label: '52W', value: '52' },
];

function formatWeekLabel(weekStart: string) {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function formatLongDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

function BurnTooltip({ active, payload, label }: { active?: boolean; label?: string; payload?: { value?: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-rule bg-surface px-3 py-2 text-xs shadow-card">
      <p className="text-ink-muted">{label}</p>
      <p className="font-mono font-semibold text-ink">₱{Number(payload[0].value ?? 0).toLocaleString()}</p>
    </div>
  );
}

// One series (weekly total, all sources combined) -- the accent, not a
// categorical slot. Categorical color is for telling series apart; there is
// only one metric here, so a single hue with no legend is the correct read
// (dataviz skill: "1-3 series, color alone is comfortable; a single series
// needs no legend box").
// Target ~10 ticks -- Recharts' "preserveStartEnd" thins ticks adaptively to
// avoid overlap, which can leave uneven gaps (dense early on, sparse later,
// or vice versa). A fixed numeric interval (every Nth week) always spans
// evenly, since it's the same skip count throughout.
function tickInterval(count: number) {
  return Math.max(0, Math.ceil(count / 10) - 1);
}

function BurnChart({ data }: { data: { week_start: string; total: string }[] }) {
  const chartData = data.map((d) => ({ label: formatWeekLabel(d.week_start), total: Number(d.total) }));

  return (
    <div className="h-55">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke="var(--color-rule)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-ink-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval(chartData.length)}
          />
          <YAxis
            tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `₱${v.toLocaleString()}`}
            width={96}
          />
          {/* No shared crosshair -- bars are discrete, so each bar is its
              own hit target and carries its own tooltip (dataviz skill). */}
          <Tooltip content={<BurnTooltip />} cursor={{ fill: 'var(--color-rule)' }} />
          {/* 24px cap, per the mark spec -- never fill the category band.
              Literal var() string (see CostTrendChart) so it stays correct
              under print/theme change, not a getComputedStyle() snapshot. */}
          <Bar dataKey="total" fill="var(--color-accent)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
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
    <Panel
      title="Weekly burn rate"
      subtitle="All disbursement sources combined, Monday-anchored weeks"
      action={<SegmentedControl value={weeks} onChange={setWeeks} options={WINDOW_OPTIONS} />}
    >
      {burn.data && burn.data.length > 0 ? (
        <>
          <BurnChart data={burn.data} />
          {projection && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-rule pt-4 sm:grid-cols-3">
              <Stat label="Avg. weekly burn" value={formatMoney(projection.avgWeeklyBurn)} />
              {projection.alreadyExhausted ? (
                <Stat label="Remaining vs. disbursed" value="Already exhausted" tone="danger" />
              ) : projection.weeksRemaining === null ? (
                <Stat
                  label="Projected runway"
                  // "try a longer one" is UI guidance for someone who can
                  // actually click the window selector next to it -- on a
                  // printed page there's no control to try, so it reads as
                  // a dead end instead of an instruction.
                  value={
                    <>
                      <span className="no-print">Not reliable at this window — try a longer one</span>
                      <span className="hidden print:inline">Insufficient data for projection</span>
                    </>
                  }
                />
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
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'danger' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{label}</span>
      <span className={`font-mono text-sm font-semibold ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
