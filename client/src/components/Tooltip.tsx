import type { ReactNode } from 'react';

// The Royale Design System's Tooltip: CSS only, shown on hover and on
// keyboard focus. It is aria-hidden, so the trigger must carry its own
// aria-label. bottom-end anchors to the trigger's right edge, for triggers
// at the right of the top bar. z-60 sits above the fixed sidebar (z-50).
const PLACEMENT = {
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  'bottom-end': 'top-full right-0 mt-1.5',
};

export function Tooltip({
  label,
  placement = 'bottom',
  children,
}: {
  children: ReactNode;
  label: string;
  placement?: keyof typeof PLACEMENT;
}) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute z-60 rounded-sm bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-canvas opacity-0 transition-opacity group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 ${PLACEMENT[placement]}`}
      >
        {label}
      </span>
    </span>
  );
}
