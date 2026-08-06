-- payroll_periods.total_amount is meant to hold the original PAY_ROLL sheet's
-- control total, compared against SUM(payroll_entries.amount) for the
-- reconciliation panel. 11 rows in the live DB were found overwritten to equal
-- the extracted (worker-rows) total, erasing the exact discrepancy CLAUDE.md
-- documents (10 REVIEW weeks + one week with no control total at all). This
-- restores the correct values from db/seed/payroll_periods.csv, which was
-- never wrong -- only the live DB had drifted from it.
USE rcsni_cost;

UPDATE payroll_periods SET total_amount = 168396.67 WHERE id = 8;
UPDATE payroll_periods SET total_amount = 145354.06 WHERE id = 22;
UPDATE payroll_periods SET total_amount = 337911.57 WHERE id = 25;
UPDATE payroll_periods SET total_amount = 526453.56 WHERE id = 26;
UPDATE payroll_periods SET total_amount = 493921.92 WHERE id = 27;
UPDATE payroll_periods SET total_amount = 440756.16 WHERE id = 28;
UPDATE payroll_periods SET total_amount = 504320.20 WHERE id = 30;
UPDATE payroll_periods SET total_amount = 559006.50 WHERE id = 31;
UPDATE payroll_periods SET total_amount = 531923.01 WHERE id = 33;
UPDATE payroll_periods SET total_amount = 428837.38 WHERE id = 34;
UPDATE payroll_periods SET total_amount = 0         WHERE id = 50;
