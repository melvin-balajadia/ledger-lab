-- Same off-by-one bug found and fixed in planning_lines (migration 006)
-- and purchase_orders (migration 008), never propagated to the third
-- table that carries a budget_item_id derived from a JPL code.
-- planning_lines.budget_item_id is authoritative (per 006); this realigns
-- payroll_entries.budget_item_id to match its planning_line's value.
-- 4,227 payroll_entries rows total; 4,207 have a planning_line_id and are
-- affected by this (4,204 were mismatched, 3 already correct -- one of
-- those from a manual test fix during this session); 20 have no JPL code
-- at all yet and are unchanged (same "worker had left" gap CLAUDE.md
-- already documents, separate and open).
USE rcsni_cost;

UPDATE payroll_entries pe
JOIN planning_lines pl ON pl.id = pe.planning_line_id
SET pe.budget_item_id = pl.budget_item_id
WHERE pe.project_id = 1;
