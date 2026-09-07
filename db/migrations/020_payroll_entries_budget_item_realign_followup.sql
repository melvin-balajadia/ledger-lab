-- Follow-up to 014 (payroll_entries) and 019 (the three ledger tables).
--
-- 3,801 of 3,802 JPL-tagged payroll_entries agree with their planning line.
-- One does not: entry 890 (ADOC, BRYAN ASIONG / week "November 24-30, 2025"
-- / JPL 3.1.2 / PHP 5,797.24) is filed under budget item 2.0 Land
-- Development but its JPL code belongs to 3.0 Civil Works.
--
-- Cause, from audit_log id 1388: on 2026-08-06 09:42 the entry's
-- planning_line_id was changed 94 -> 95, and the same UPDATE wrote
-- budget_item_id = 2 (the after-image records it). That is the pre-hardening
-- behaviour -- budget_item_id was carried over instead of re-derived from
-- the new planning line. payroll.js derives it correctly now, and every
-- ledger row created or edited since 2026-08-06 shows zero drift, so this
-- is a single stale leftover rather than an active fault.
--
-- Written as a set-based realign rather than "UPDATE ... WHERE id = 890" so
-- it is idempotent and also catches any sibling row that predates the
-- hardened write paths. Re-running it is a no-op.
USE rcsni_cost;

-- Safe-update mode rejects UPDATE ... JOIN whose WHERE has no key column of
-- the updated table (Error 1175 in MySQL Workbench). Same convention as 018/019.
SET SQL_SAFE_UPDATES = 0;

UPDATE payroll_entries pe
JOIN planning_lines pl ON pl.id = pe.planning_line_id
SET pe.budget_item_id = pl.budget_item_id
WHERE pe.project_id = 1
  AND (pe.budget_item_id IS NULL OR pe.budget_item_id <> pl.budget_item_id);

SET SQL_SAFE_UPDATES = 1;

-- Verification: expect 0.
-- SELECT COUNT(*) AS rows_still_wrong
--   FROM payroll_entries pe JOIN planning_lines pl ON pl.id = pe.planning_line_id
--   WHERE pe.voided_at IS NULL
--     AND (pe.budget_item_id IS NULL OR pe.budget_item_id <> pl.budget_item_id);
--
-- NOTE: this does NOT touch the 20 payroll entries that have no JPL code at
-- all (PHP 102,742.52 -- the documented "worker had left" gap). The JOIN
-- skips them by design; never invent an attribution for an untagged row.
-- Those 20 rows are still missing from the Overview's cash-out total --
-- see the separate note on v_labor_by_item dropping NULL-keyed groups.
