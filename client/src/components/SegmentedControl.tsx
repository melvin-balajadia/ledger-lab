export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  onChange: (value: T) => void;
  options: { label: string; value: T }[];
  value: T;
}) {
  return (
    // no-print: the buttons themselves are hidden when printing, but this
    // bordered wrapper would otherwise print as an empty pill.
    <div className="no-print inline-flex gap-0.5 self-start rounded-full border border-rule bg-surface-2 p-0.75">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            value === opt.value ? 'bg-accent text-white shadow-card' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
