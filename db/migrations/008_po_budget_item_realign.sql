-- Accountant confirmed (after reviewing the two largest groups' actual line
-- items -- electrical equipment tagged as Insulated Panels, refrigeration
-- equipment tagged as Civil Works): the JPL code is authoritative. This
-- realigns purchase_orders.budget_item_id to match its planning_line's
-- budget_item_id for every PO that has one, closing out the same
-- off-by-one bug found and fixed in planning_lines (migration 006) --
-- this time on the purchase_orders side of the same relationship.
-- 265 POs total; 239 have a planning_line_id and are affected by this;
-- 26 have no JPL code at all yet and are unchanged (separate, open gap).
USE rcsni_cost;

UPDATE purchase_orders po
JOIN planning_lines pl ON pl.id = po.planning_line_id
SET po.budget_item_id = pl.budget_item_id
WHERE po.project_id = 1;
