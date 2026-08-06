import { useState } from 'react';
import { useCopyRosterForward, useCopyRosterSource, useRecentPopulatedPeriods } from '../hooks/usePayroll';

export function CopyRosterControl({ periodId, periodStart }: { periodId: number; periodStart: string }) {
  const { data: sourceData, isLoading: sourceLoading } = useCopyRosterSource(periodId, true);
  const copyRoster = useCopyRosterForward(periodId);

  const [showPicker, setShowPicker] = useState(false);
  const [overrideId, setOverrideId] = useState<number | null>(null);
  const [result, setResult] = useState<{ copied: number; skipped: number } | null>(null);

  const { data: candidates = [] } = useRecentPopulatedPeriods(periodId, periodStart, showPicker);

  const autoSource = sourceData?.source ?? null;
  const selected = overrideId != null ? candidates.find((c) => c.id === overrideId) : autoSource;

  async function handleCopy() {
    setResult(null);
    const res = await copyRoster.mutateAsync(selected?.id);
    setResult({ copied: res.entries_copied, skipped: res.entries_skipped });
  }

  if (sourceLoading) {
    return <p className="text-sm text-ink-faint">Checking for a previous roster…</p>;
  }

  if (!autoSource) {
    return <p className="text-sm text-danger">No earlier period with a roster to copy from.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleCopy}
          disabled={copyRoster.isPending || !selected}
          className="rounded-sm border border-rule-strong px-4 py-2 text-sm text-ink-muted hover:bg-canvas disabled:opacity-60"
        >
          {copyRoster.isPending ? 'Copying…' : `Copy roster from ${selected?.label ?? '…'}`}
        </button>
        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="text-sm text-accent hover:underline"
        >
          {showPicker ? 'Hide' : 'Change source period'} ▾
        </button>
      </div>

      <p className="text-[13px] text-ink-faint">
        Only adds workers not already on this period — nothing already entered here is changed.
      </p>

      {result && (
        <p className="text-sm text-ink">
          Added {result.copied} {result.copied === 1 ? 'entry' : 'entries'}
          {result.skipped > 0 ? ` (${result.skipped} already on this period, left as-is)` : ''}.
        </p>
      )}
      {copyRoster.error && <p className="text-sm text-danger">{copyRoster.error.message}</p>}

      {showPicker && (
        <select
          value={selected?.id ?? ''}
          onChange={(e) => setOverrideId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-xs rounded-sm border border-rule-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        >
          {autoSource && (
            <option value={autoSource.id}>{autoSource.label} (most recent with a roster)</option>
          )}
          {candidates
            .filter((c) => c.id !== autoSource?.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}
