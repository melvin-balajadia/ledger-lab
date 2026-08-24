-- The same off-by-one budget_item_id bug already fixed in planning_lines
-- (migration 006), purchase_orders (008) and payroll_entries (014), never
-- propagated to the last three tables carrying a budget_item_id derived
-- from a JPL code: replenishments, cash_advances, additional_payments.
--
-- planning_lines.budget_item_id is authoritative (per 006). Source of the
-- drift is etl/etl_ods_to_csv.py, which built its ITEM_ID map from a
-- "schema seeds 2.0..19.0 first then 1.0" assumption that is simply not
-- true -- schema.sql seeds budget_items in natural order, so id N == item
-- N.0. That assumption shifted every JPL-derived budget_item_id down by
-- one (code 3.x -> item '2.0'), and mapped code 1.x -> item '19.0'. The
-- ETL is fixed in the same commit as this migration, so regenerating the
-- seed no longer reintroduces it.
--
-- Why it went unnoticed: project-level totals are unaffected (the same
-- rows are summed, only bucketed to the wrong item), so only the
-- per-budget-item split on the Overview screen was wrong.
--
-- Affected rows (project 1, non-voided, measured before applying):
--   replenishments      1,565 with a JPL code -- 1,562 off by one,
--                       1 mapped 1.x -> '19.0', 2 already correct
--   cash_advances          19 with a JPL code -- 15 off by one,
--                       4 NULL (code 20.x; '20.0' was missing from the
--                       ETL's ITEM_NOS list entirely), 0 already correct
--   additional_payments    28 with a JPL code -- all 28 off by one
--
-- Rows with no planning_line_id are left untouched by the JOIN (there are
-- none in these three tables today, but that is the intended behaviour --
-- never invent an attribution for an untagged row).
USE rcsni_cost;

UPDATE replenishments r
JOIN planning_lines pl ON pl.id = r.planning_line_id
SET r.budget_item_id = pl.budget_item_id
WHERE r.project_id = 1;

UPDATE cash_advances ca
JOIN planning_lines pl ON pl.id = ca.planning_line_id
SET ca.budget_item_id = pl.budget_item_id
WHERE ca.project_id = 1;

UPDATE additional_payments ap
JOIN planning_lines pl ON pl.id = ap.planning_line_id
SET ap.budget_item_id = pl.budget_item_id
WHERE ap.project_id = 1;

-- Verification: expect 0 rows back. Any row returned is a JPL-tagged row
-- whose budget_item_id still disagrees with its planning line.
-- SELECT 'replenishments' t, COUNT(*) n FROM replenishments x
--   JOIN planning_lines pl ON pl.id = x.planning_line_id
--   WHERE x.voided_at IS NULL AND (x.budget_item_id IS NULL OR x.budget_item_id <> pl.budget_item_id)
-- UNION ALL SELECT 'cash_advances', COUNT(*) FROM cash_advances x
--   JOIN planning_lines pl ON pl.id = x.planning_line_id
--   WHERE x.voided_at IS NULL AND (x.budget_item_id IS NULL OR x.budget_item_id <> pl.budget_item_id)
-- UNION ALL SELECT 'additional_payments', COUNT(*) FROM additional_payments x
--   JOIN planning_lines pl ON pl.id = x.planning_line_id
--   WHERE x.voided_at IS NULL AND (x.budget_item_id IS NULL OR x.budget_item_id <> pl.budget_item_id);
