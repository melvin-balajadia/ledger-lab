import { formatPercent } from '../lib/formatMoney';

export function ProgressBar({ ratio, danger = false }: { danger?: boolean; ratio: string | null }) {
  const pct = ratio == null ? 0 : Number(ratio) * 100;
  const fillWidth = Math.min(pct, 100);
  return (
    <div className="flex items-center gap-3" title={formatPercent(ratio)}>
      <div className="h-1.5 w-24 shrink-0 rounded-full bg-accent-soft">
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${danger ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${fillWidth}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-ink-muted">{formatPercent(ratio)}</span>
    </div>
  );
}
