// Shimmering placeholders shaped like the real content they stand in for, so
// a page doesn't jump when data arrives. Same visual language DataTable
// already uses for its own loading state (bg-rule/bg-surface-2 bars,
// animate-pulse) -- this just makes those primitives reusable outside it.

export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded bg-rule ${className}`} style={style} />;
}

// Matches KpiCards' 5-card grid and each Card's own border/shadow chrome.
export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-md border border-rule bg-surface p-4 shadow-card">
          <Skeleton className="mb-3 h-3 w-2/3" />
          <Skeleton className="mb-2.5 h-5 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// Matches Panel.tsx's header/body chrome exactly, so swapping this for the
// real Panel once data lands doesn't shift layout.
export function PanelSkeleton({ lines = 4, bodyHeight }: { lines?: number; bodyHeight?: string }) {
  return (
    <div className="rounded-md border border-rule bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3.5">
        <div>
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="mt-2 h-2.5 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-3 p-5" style={bodyHeight ? { height: bodyHeight } : undefined}>
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? '55%' : `${85 - i * 6}%` }} />
        ))}
      </div>
    </div>
  );
}

// Matches the "Stat" grid pattern shared by BudgetItemDetail and
// WorkerPayrollDetail: a hairline-divided row of stat blocks. `gridClassName`
// should mirror the real grid's own responsive column classes exactly.
export function StatGridSkeleton({ count = 4, gridClassName = 'sm:grid-cols-2 lg:grid-cols-4' }: { count?: number; gridClassName?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-px border border-rule bg-rule ${gridClassName}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 bg-surface p-5">
          <Skeleton className="h-2.5 w-2/3" />
          <Skeleton className="h-6 w-4/5" />
        </div>
      ))}
    </div>
  );
}

// Matches SummaryStats' exact chrome (Replenishments/PurchaseOrders/
// CashAdvances/AdditionalPayments/Payroll). That component's data is plain
// component state set as a side effect of DataTable's own fetch, not a
// cached query -- it resets to null on every mount, so without this,
// navigating away and back re-blanks the whole stats bar until the fetch
// resolves, every single time, not just on first load.
export function SummaryStatsSkeleton() {
  return (
    <div className="rounded-md border border-rule bg-surface p-4 shadow-card">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-2.5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

// The failure counterpart to SummaryStatsSkeleton -- without this, a summary
// fetch that genuinely fails (not just a superseded/aborted request) leaves
// the skeleton shimmering forever, since nothing ever calls setSummary. No
// separate Retry button here on purpose: this fetch is the same request
// DataTable's own error banner already offers to retry, right below --
// a second, disconnected retry control would just be confusing.
export function SummaryStatsError() {
  return (
    <div className="rounded-md border border-rule bg-surface p-4 text-sm text-ink-faint shadow-card">
      Couldn't load summary totals — see Retry below.
    </div>
  );
}

// A detail page's title row: back link is already real, this stands in for
// the h2 + any status pills beside it.
export function HeaderLineSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  );
}
