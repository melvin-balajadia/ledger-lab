import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { COST_CATEGORIES } from '../lib/costCategories';
import type { CostTrendPoint } from '../types';

// Values lead, series name follows (dataviz skill) -- the reader already
// knows which chart this is, they hover to get the number.
function TrendTooltip({ active, payload, label }: { active?: boolean; label?: string; payload?: { color?: string; name?: string; value?: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-rule bg-surface px-3 py-2 text-xs shadow-card">
      <p className="mb-1.5 font-semibold text-ink-muted">{label}</p>
      {payload
        .slice()
        .reverse()
        .map((row) => (
          <div key={row.name} className="flex items-center gap-2 py-0.5">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: row.color }} />
            <span className="text-ink-muted">{row.name}</span>
            <span className="ml-auto font-mono font-semibold text-ink">₱{Number(row.value ?? 0).toLocaleString()}</span>
          </div>
        ))}
    </div>
  );
}

// Chart.js baked colors into a <canvas> at mount, which is why the old
// version printed washed-out when a dark-mode session forced the light
// palette via CSS: canvas pixels don't repaint on a media query. Recharts
// draws SVG, and every color below is passed as a literal `var(--x)` string
// (never a getComputedStyle() snapshot -- that would reintroduce the same
// bake-in-at-mount bug one level up), so the browser re-resolves it live on
// print or any future theme change, with no re-render needed.
export function CostTrendChart({ data }: { data: CostTrendPoint[] }) {
  return (
    <div className="h-70">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-rule)" strokeDasharray="0" vertical={false} />
          <XAxis dataKey="month" tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `₱${v.toLocaleString()}`}
            width={96}
          />
          {/* One shared vertical hairline across all 5 series -- the reader
              aims at a date, never at one series' line. */}
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--color-rule-strong)', strokeWidth: 1 }} />
          {/* rect, not a line key -- the legend mirrors the mark (an area,
              a filled region), unlike the tooltip's line keys above, which
              are about tooltip-row density, not mark shape.
              Recharts defaults itemSorter to 'value', i.e. it silently
              sorts the legend alphabetically by label -- overriding the
              declared series order this app fixes in COST_CATEGORIES
              ("color follows the entity, never a per-chart rank"). Sort by
              that fixed order instead. */}
          <Legend
            verticalAlign="top"
            align="right"
            iconType="square"
            iconSize={10}
            wrapperStyle={{ fontSize: 12, color: 'var(--color-ink-muted)', paddingBottom: 8 }}
            itemSorter={(item) => COST_CATEGORIES.findIndex((cat) => cat.label === item.value)}
          />
          {COST_CATEGORIES.map((cat) => (
            <Area
              key={cat.key}
              dataKey={cat.key}
              name={cat.label}
              stackId="cost"
              type="monotone"
              stroke={cat.color}
              fill={cat.color}
              fillOpacity={0.14}
              // The 2px top-edge stroke, full-opacity in the series' own
              // color, is what separates each stacked layer from the one
              // above it -- not a decorative border, the boundary line an
              // area chart already needs.
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
