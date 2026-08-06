import Decimal from 'decimal.js';
import type { WeeklyBurnPoint } from '../types';

export interface BurnProjection {
  avgWeeklyBurn: string;
  weeksRemaining: number | null;
  projectedExhaustionDate: string | null;
  alreadyExhausted: boolean;
}

// A zero week inside the selected window is real signal (a genuinely quiet
// week), not a data gap -- so the average is taken across every week
// returned, not just the ones with activity. Uses decimal.js rather than
// Number(), same as computeDeltaPct, so this never loses precision on a
// large peso total.
//
// Real procurement/payroll spend is lumpy (milestone payments, not a smooth
// weekly drip) -- a short window can land almost entirely on a quiet
// stretch and understate the pace so badly the projection comes out
// centuries away. Two guards catch that: too few active weeks in the
// window to trust the average, or a result longer than the project's own
// real-world lifespan (CLAUDE.md: 2025-01-01 to 2027-12-31, ~156 weeks) --
// either way this is "not a reliable projection," not a specific date.
const MAX_MEANINGFUL_WEEKS = 156;
const MIN_ACTIVE_WEEK_RATIO = 0.25;

export function computeBurnProjection(weeklyBurn: WeeklyBurnPoint[], remainingVsDisbursed: string): BurnProjection {
  if (weeklyBurn.length === 0) {
    return { avgWeeklyBurn: '0.00', weeksRemaining: null, projectedExhaustionDate: null, alreadyExhausted: false };
  }

  const total = weeklyBurn.reduce((acc, w) => acc.plus(w.total), new Decimal(0));
  const avgWeeklyBurn = total.dividedBy(weeklyBurn.length);
  const remaining = new Decimal(remainingVsDisbursed);
  const activeWeeks = weeklyBurn.filter((w) => new Decimal(w.total).gt(0)).length;
  const tooSparse = activeWeeks / weeklyBurn.length < MIN_ACTIVE_WEEK_RATIO;

  if (remaining.lte(0)) {
    return { avgWeeklyBurn: avgWeeklyBurn.toFixed(2), weeksRemaining: null, projectedExhaustionDate: null, alreadyExhausted: true };
  }
  if (avgWeeklyBurn.lte(0) || tooSparse) {
    return { avgWeeklyBurn: avgWeeklyBurn.toFixed(2), weeksRemaining: null, projectedExhaustionDate: null, alreadyExhausted: false };
  }

  const weeksRemaining = Math.ceil(remaining.dividedBy(avgWeeklyBurn).toNumber());
  if (weeksRemaining > MAX_MEANINGFUL_WEEKS) {
    return { avgWeeklyBurn: avgWeeklyBurn.toFixed(2), weeksRemaining: null, projectedExhaustionDate: null, alreadyExhausted: false };
  }

  const lastWeekStart = weeklyBurn[weeklyBurn.length - 1].week_start;
  const exhaustionDate = new Date(`${lastWeekStart}T00:00:00Z`);
  exhaustionDate.setUTCDate(exhaustionDate.getUTCDate() + weeksRemaining * 7);

  return {
    avgWeeklyBurn: avgWeeklyBurn.toFixed(2),
    weeksRemaining,
    projectedExhaustionDate: exhaustionDate.toISOString().slice(0, 10),
    alreadyExhausted: false,
  };
}
