import { formatPercent } from '../lib/formatMoney';

export function ProgressBar({
  ratio,
  danger = false,
  compact = false,
  digits,
}: {
  compact?: boolean;
  danger?: boolean;
  digits?: number;
  ratio: string | null;
}) {
  const pct = ratio == null ? 0 : Number(ratio) * 100; // bar width only, never a figure
  const fillWidth = Math.min(pct, 100);
  const label = formatPercent(ratio, digits);
  return (
    <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-3'}`} title={label}>
      <div className={`h-1.5 shrink-0 rounded-full bg-accent-soft ${compact ? 'w-10' : 'w-24'}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${danger ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${fillWidth}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-ink-muted">{label}</span>
    </div>
  );
}
