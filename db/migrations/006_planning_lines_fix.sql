-- Accountant confirmed (Q1): JPL codes run 1.0-20.0, one per budget item,
-- matching the pattern every other top-level code already follows.
-- Accountant confirmed (Q2): code 240.0 is a mistake, safe to remove.

USE rcsni_cost;

-- The one payroll_entries row pointing to 240.0 (id 1935) already has no
-- budget_item_id either, so this only nulls a reference that was already
-- effectively unallocated -- consistent with the other no-JPL payroll rows.
DELETE FROM planning_lines WHERE project_id = 1 AND code = '240.0';

INSERT INTO planning_lines (project_id, budget_item_id, code, parent_id, depth, description, budget_amount)
VALUES
 (1, 13, '13.0', NULL, 2, NULL, NULL),
 (1, 14, '14.0', NULL, 2, NULL, NULL),
 (1, 15, '15.0', NULL, 2, NULL, NULL),
 (1, 19, '19.0', NULL, 2, NULL, NULL);

-- The core fix: budget_item_id must match the budget item whose item_no
-- equals the code's first segment. Confirmed broken for 98 of 99 rows --
-- mostly shifted by one, and code '1.0' pointed to budget_item 19 entirely.
UPDATE planning_lines pl
JOIN budget_items bi
  ON bi.item_no = CONCAT(SUBSTRING_INDEX(pl.code, '.', 1), '.0')
 AND bi.project_id = pl.project_id
SET pl.budget_item_id = bi.id
WHERE pl.project_id = 1;
