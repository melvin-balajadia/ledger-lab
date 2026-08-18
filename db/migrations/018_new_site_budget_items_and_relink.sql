-- ============================================================================
-- Catch-up for a site that was seeded BEFORE db/seed_master_data.sql grew its
-- budget_items block and its JPL relink step. Villasis (rcsni_cost_villasis)
-- is the only such deployment; a site seeded from the current file already has
-- both and does not need this.
--
-- NO "USE" LINE ON PURPOSE -- same as seed_master_data.sql. Select the target
-- schema first (in Workbench: double-click it in the Schemas panel so it goes
-- bold). Do NOT run this against rcsni_cost: Plaridel already has its own 20
-- real budget items and its codes are already linked, and project_id below is
-- hardcoded to 2 (DSEXP) anyway.
--
-- Safe to run twice. The INSERT is IGNORE'd against uk_budget_item
-- (project_id, item_no) and the UPDATE only touches rows still NULL.
-- ============================================================================

SET SQL_SAFE_UPDATES = 0;

-- 1. The 20 budget lines, same item_no/description/sort_order as Plaridel's so
--    both sites share one WBS breakdown, every amount 0 -- accounting enters
--    this site's real figures in the app (Overview -> "+ New budget item", or a
--    budget item's own page). A 0 here means "not entered yet", not "no budget".
INSERT IGNORE INTO budget_items
  (project_id, item_no, sort_order, description, original_budget, revised_budget, contract_amount, procurement_mode, remarks)
VALUES
  (2,'1.0', 10,'Inauguration / Groundbreaking',                                 0,0,0,'other',NULL),
  (2,'2.0', 20,'Land Development',                                              0,0,0,'other',NULL),
  (2,'3.0', 30,'Civil Works',                                                   0,0,0,'other',NULL),
  (2,'4.0', 40,'Refrigeration Equipment',                                       0,0,0,'other',NULL),
  (2,'5.0', 50,'Insulated Panels, Sectional Door, Dock Levelers & Accessories', 0,0,0,'other',NULL),
  (2,'6.0', 60,'Electrical & Communications Works',                             0,0,0,'other',NULL),
  (2,'7.0', 70,'PU Flooring, Coving and Zocalo',                                0,0,0,'other',NULL),
  (2,'8.0', 80,'Water Distribution',                                            0,0,0,'other',NULL),
  (2,'9.0', 90,'Office Equipment, Furniture & Fixtures',                        0,0,0,'other',NULL),
  (2,'10.0',100,'Plastic Pallets',                                              0,0,0,'other',NULL),
  (2,'11.0',110,'Double Deep Racking System',                                   0,0,0,'other',NULL),
  (2,'12.0',120,'MHE',                                                          0,0,0,'other',NULL),
  (2,'13.0',130,'Solar PV System',                                              0,0,0,'other',NULL),
  (2,'14.0',140,'Fire Protection',                                              0,0,0,'other',NULL),
  (2,'15.0',150,'WWTP',                                                         0,0,0,'other',NULL),
  (2,'16.0',160,'Water Filtration System',                                      0,0,0,'other',NULL),
  (2,'17.0',170,'Bollards',                                                     0,0,0,'other',NULL),
  (2,'18.0',180,'Capex for Operations',                                         0,0,0,'other',NULL),
  (2,'19.0',190,'Interest During Construction',                                 0,0,0,'other',NULL),
  (2,'20.0',200,'Other Expenses',                                               0,0,0,'other',NULL);

-- 2. Point every JPL code at the budget item its first segment names --
--    '18.25' -> item_no '18.0'. Same rule as deriveFromCode() in
--    server/routes/planningLines.js.
--
--    This is the part that actually matters. Every transaction copies
--    budget_item_id off the planning line it is charged to, and all five
--    *_by_item roll-up views GROUP BY that column. Left NULL, every amount
--    entered rolls up to nothing: total_disbursed stays 0 on all 20 items and
--    the dashboard reports zero spend forever, with no error anywhere.
UPDATE planning_lines pl
JOIN budget_items bi
  ON bi.project_id = pl.project_id
 AND bi.item_no = CONCAT(SUBSTRING_INDEX(pl.code, '.', 1), '.0')
SET pl.budget_item_id = bi.id
WHERE pl.project_id = 2
  AND pl.budget_item_id IS NULL;

SET SQL_SAFE_UPDATES = 1;

-- Expect: budget_items 20, orphaned 0.
SELECT (SELECT COUNT(*) FROM budget_items   WHERE project_id = 2)                              AS budget_items,
       (SELECT COUNT(*) FROM planning_lines WHERE project_id = 2)                              AS jpl_codes,
       (SELECT COUNT(*) FROM planning_lines WHERE project_id = 2 AND budget_item_id IS NULL)    AS orphaned;
