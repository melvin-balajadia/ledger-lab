// One header treatment for every Overview section. Before this, three
// panels (budget table, retention, top suppliers) had grown a bordered
// header row when their Export buttons were added, while the others (trend,
// breakdown, burn, alerts) still used a plain margin -- two conventions
// doing the same job. This is the one.
export function Panel({
  title,
  subtitle,
  action,
  children,
  bodyClassName = 'p-5',
  className = '',
}: {
  action?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
  className?: string;
  subtitle?: string;
  title: string;
}) {
  return (
    <div className={`rounded-md border border-rule bg-surface shadow-card ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          {subtitle && <p className="text-xs text-ink-faint">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
