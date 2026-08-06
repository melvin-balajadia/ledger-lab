-- Accountant-confirmed correct weekly payroll totals, replacing the
-- restored-but-still-unresolved control totals from migration 003. One week
-- (id 50, Jul 13-19 2026) is intentionally left untouched -- not yet decided.
USE rcsni_cost;

UPDATE payroll_periods SET total_amount = 183392.53 WHERE id = 8;   -- Sep 22-28, 2025
UPDATE payroll_periods SET total_amount = 145354.07 WHERE id = 22;  -- Dec 29, 2025-Jan 4, 2026
UPDATE payroll_periods SET total_amount = 340339.64 WHERE id = 25;  -- Jan 19-25, 2026
UPDATE payroll_periods SET total_amount = 503203.08 WHERE id = 26;  -- Jan 26-Feb 1, 2026
UPDATE payroll_periods SET total_amount = 484342.54 WHERE id = 27;  -- Feb 2-8, 2026
UPDATE payroll_periods SET total_amount = 435857.72 WHERE id = 28;  -- Feb 9-15, 2026
UPDATE payroll_periods SET total_amount = 492629.26 WHERE id = 30;  -- Feb 23-Mar 1, 2026
UPDATE payroll_periods SET total_amount = 553538.06 WHERE id = 31;  -- Mar 2-8, 2026
UPDATE payroll_periods SET total_amount = 537687.14 WHERE id = 33;  -- Mar 16-22, 2026
UPDATE payroll_periods SET total_amount = 423611.35 WHERE id = 34;  -- Mar 23-29, 2026
