-- Accountant confirmed all 26 previously-unrecognized POs (item 6) ARE hers
-- after all, and assigned each its own JPL code under 18.0 Capex for
-- Operations (18.1-18.25 new, 18.0 itself already existed). Moves them off
-- the incorrect 17.0 Bollards fallback tag. Zero payments exist on any of
-- these yet, so this has no effect on any disbursement total -- only closes
-- the last remaining "no JPL code at all" gap (0 of 265 POs left unassigned).
--
-- Applied via script (bulk INSERT + per-PO UPDATE); this file documents the
-- equivalent effect for the record.
USE rcsni_cost;

INSERT INTO planning_lines (project_id, budget_item_id, code, parent_id, depth, description, budget_amount)
VALUES
 (1, 18, '18.1', NULL, 2, NULL, NULL), (1, 18, '18.2', NULL, 2, NULL, NULL),
 (1, 18, '18.3', NULL, 2, NULL, NULL), (1, 18, '18.4', NULL, 2, NULL, NULL),
 (1, 18, '18.5', NULL, 2, NULL, NULL), (1, 18, '18.6', NULL, 2, NULL, NULL),
 (1, 18, '18.7', NULL, 2, NULL, NULL), (1, 18, '18.8', NULL, 2, NULL, NULL),
 (1, 18, '18.9', NULL, 2, NULL, NULL), (1, 18, '18.10', NULL, 2, NULL, NULL),
 (1, 18, '18.11', NULL, 2, NULL, NULL), (1, 18, '18.12', NULL, 2, NULL, NULL),
 (1, 18, '18.13', NULL, 2, NULL, NULL), (1, 18, '18.14', NULL, 2, NULL, NULL),
 (1, 18, '18.15', NULL, 2, NULL, NULL), (1, 18, '18.16', NULL, 2, NULL, NULL),
 (1, 18, '18.17', NULL, 2, NULL, NULL), (1, 18, '18.18', NULL, 2, NULL, NULL),
 (1, 18, '18.19', NULL, 2, NULL, NULL), (1, 18, '18.20', NULL, 2, NULL, NULL),
 (1, 18, '18.21', NULL, 2, NULL, NULL), (1, 18, '18.22', NULL, 2, NULL, NULL),
 (1, 18, '18.23', NULL, 2, NULL, NULL), (1, 18, '18.24', NULL, 2, NULL, NULL),
 (1, 18, '18.25', NULL, 2, NULL, NULL);

-- por_no -> code: POR17870=18.0(existing) POR17902=18.1 POR17647=18.2 POR17708=18.3
-- POR17725=18.4 POR17943=18.5 POR17723=18.6 POR17764=18.7 POR17804=18.8 POR17917=18.9
-- POR17876=18.10 POR17645=18.11 POR17866=18.12 POR17766=18.13 POR17644=18.14
-- POR17734=18.15 POR17705=18.16 POR17758=18.17 POR17795=18.18 POR17715=18.19
-- POR17642=18.20 POR17696=18.21 POR17809=18.22 POR17733=18.23 POR17765=18.24 POR17760=18.25
UPDATE purchase_orders po
JOIN planning_lines pl ON pl.project_id = po.project_id
SET po.planning_line_id = pl.id, po.budget_item_id = 18
WHERE po.project_id = 1 AND (
  (po.por_no = 'POR17870' AND pl.code = '18.0') OR
  (po.por_no = 'POR17902' AND pl.code = '18.1') OR
  (po.por_no = 'POR17647' AND pl.code = '18.2') OR
  (po.por_no = 'POR17708' AND pl.code = '18.3') OR
  (po.por_no = 'POR17725' AND pl.code = '18.4') OR
  (po.por_no = 'POR17943' AND pl.code = '18.5') OR
  (po.por_no = 'POR17723' AND pl.code = '18.6') OR
  (po.por_no = 'POR17764' AND pl.code = '18.7') OR
  (po.por_no = 'POR17804' AND pl.code = '18.8') OR
  (po.por_no = 'POR17917' AND pl.code = '18.9') OR
  (po.por_no = 'POR17876' AND pl.code = '18.10') OR
  (po.por_no = 'POR17645' AND pl.code = '18.11') OR
  (po.por_no = 'POR17866' AND pl.code = '18.12') OR
  (po.por_no = 'POR17766' AND pl.code = '18.13') OR
  (po.por_no = 'POR17644' AND pl.code = '18.14') OR
  (po.por_no = 'POR17734' AND pl.code = '18.15') OR
  (po.por_no = 'POR17705' AND pl.code = '18.16') OR
  (po.por_no = 'POR17758' AND pl.code = '18.17') OR
  (po.por_no = 'POR17795' AND pl.code = '18.18') OR
  (po.por_no = 'POR17715' AND pl.code = '18.19') OR
  (po.por_no = 'POR17642' AND pl.code = '18.20') OR
  (po.por_no = 'POR17696' AND pl.code = '18.21') OR
  (po.por_no = 'POR17809' AND pl.code = '18.22') OR
  (po.por_no = 'POR17733' AND pl.code = '18.23') OR
  (po.por_no = 'POR17765' AND pl.code = '18.24') OR
  (po.por_no = 'POR17760' AND pl.code = '18.25')
);
