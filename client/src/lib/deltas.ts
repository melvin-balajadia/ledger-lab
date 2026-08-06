import Decimal from 'decimal.js';

export interface Delta {
  direction: 'down' | 'flat' | 'up';
  pct: string;
}

// Percentage change from `previous` to `current` -- both DECIMAL strings.
// Uses decimal.js rather than Number() so large peso totals never lose precision.
export function computeDeltaPct(current: string, previous: string): Delta {
  const prev = new Decimal(previous);
  const curr = new Decimal(current);
  if (prev.eq(0)) return { direction: 'flat', pct: '0.0' };

  const change = curr.minus(prev).dividedBy(prev).times(100);
  const direction = change.gt(0) ? 'up' : change.lt(0) ? 'down' : 'flat';
  return { direction, pct: change.abs().toFixed(1) };
}
