import { toneClasses, type Tone } from '../lib/tones';

export interface SummaryStat {
  label: string;
  value: string;
  tone?: Tone;
}

// One stat-tile row shared by the four ledger pages (Replenishments, Cash
// Advances, Additional Payments, Purchase Orders) -- same visual language as
// KpiCards on Overview, sized down since these sit above a filterable table
// rather than the top of the dashboard. Values arrive pre-formatted so this
// component stays dumb: callers decide currency/percent/plain formatting.
export function SummaryStats({
  stats,
  breakdown,
}: {
  stats: SummaryStat[];
  breakdown?: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-md border border-rule bg-surface p-4 shadow-card">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{s.label}</span>
            <span className={`font-mono text-base font-semibold ${s.tone ? toneClasses[s.tone].text : 'text-ink'}`}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
      {breakdown && breakdown.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-rule pt-3 text-xs">
          {breakdown.map((b) => (
            <span key={b.label} className="text-ink-muted">
              {b.label}: <span className="font-mono text-ink">{b.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
