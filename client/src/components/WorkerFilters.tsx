import { useState } from 'react';
import { IconFilter } from './icons';

export interface WorkerFilterValues {
  position: string;
}

// Search-by-name lives in DataTable's own search box; this bar is only for
// the free-text position filter (position is a free-text column per
// schema, not an enum, so no picker).
export function WorkerFilters({ onChange }: { onChange: (filters: WorkerFilterValues) => void }) {
  const [position, setPosition] = useState('');

  return (
    <div className="relative w-full max-w-xs">
      <IconFilter className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input
        type="text"
        value={position}
        placeholder="Filter by position…"
        onChange={(e) => {
          setPosition(e.target.value);
          onChange({ position: e.target.value });
        }}
        className="w-full rounded-sm border border-rule-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
      />
    </div>
  );
}
