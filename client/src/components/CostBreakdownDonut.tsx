import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { COST_CATEGORIES } from '../lib/costCategories';
import { formatMoney, sumMoney } from '../lib/formatMoney';
import type { CostBreakdown } from '../types';

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { name?: string; value?: number; payload?: { color: string } }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return (
    <div className="flex items-center gap-2 rounded-md border border-rule bg-surface px-3 py-2 text-xs shadow-card">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: row.payload?.color }} />
      <span className="text-ink-muted">{row.name}</span>
      <span className="font-mono font-semibold text-ink">₱{Number(row.value ?? 0).toLocaleString()}</span>
    </div>
  );
}

// Part-to-whole at a glance, 5 segments -- a donut is the wrong tool for
// comparing two CLOSE values, but that isn't this chart's job: PO Payments
// dominates at ~86%, so the read is "one thing owns this budget," which a
// donut communicates in one look.
export function CostBreakdownDonut({ data }: { data: CostBreakdown }) {
  const total = sumMoney(COST_CATEGORIES.map((c) => data[c.key]));
  const totalNum = Number(total);

  const chartData = COST_CATEGORIES.map((c) => ({
    key: c.key,
    name: c.label,
    value: Number(data[c.key]),
    color: c.color,
    pct: totalNum > 0 ? ((Number(data[c.key]) / totalNum) * 100).toFixed(0) : '0',
  }));

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="98%"
              // 2px surface-color ring between segments -- the spacer the
              // dataviz skill uses instead of a border to separate marks.
              // Literal var() string, not a getComputedStyle() snapshot, so
              // it re-resolves live under print/theme change (see
              // CostTrendChart's header comment for why that distinction matters).
              stroke="var(--color-surface)"
              strokeWidth={3}
              startAngle={90}
              endAngle={-270}
            >
              {chartData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="font-mono text-lg font-semibold text-ink">{formatMoney(total)}</div>
          <div className="text-[11px] text-ink-faint">total cost</div>
        </div>
      </div>
      {/* Direct labels + legend together: identity never rides on color
          alone, and the %s answer the chart's own question without a hover. */}
      <div className="mt-3.5 flex flex-wrap justify-center gap-3">
        {chartData.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c.color }} />
            {c.name} · {c.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}
