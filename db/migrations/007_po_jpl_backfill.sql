-- Accountant-provided JPL codes for the 110 POs that had none (₱95.1M in
-- po_payments). Codes came back as top-level categories (2.0, 3.0, 14.0),
-- confirmed valid per migration 006's fix. Full source list with per-PO
-- codes: "PO JPL codes needed.csv" (answered copy kept alongside it).
--
-- Applied via a script (grouped UPDATE by code, one statement per code)
-- rather than 110 individual statements; this file documents the equivalent
-- effect for the record. planning_line_id/budget_item_id pairs below are
-- from the corrected planning_lines table (post migration 006):
--   14.0 -> planning_line_id 101, budget_item_id 14 (Fire Protection)
--    2.0 -> planning_line_id 1,   budget_item_id 2  (Land Development)
--    3.0 -> planning_line_id 7,   budget_item_id 3  (Civil Works)
--
-- POR17172, POR17167 -> 14.0 (corrects a prior mistaken 13.0 Solar PV tag)
-- POR17196 -> 2.0
-- all other 107 POs -> 3.0
USE rcsni_cost;

UPDATE purchase_orders SET planning_line_id = 101, budget_item_id = 14
WHERE project_id = 1 AND por_no IN ('POR17172','POR17167');

UPDATE purchase_orders SET planning_line_id = 1, budget_item_id = 2
WHERE project_id = 1 AND por_no IN ('POR17196');

UPDATE purchase_orders SET planning_line_id = 7, budget_item_id = 3
WHERE project_id = 1 AND por_no IN (
  'POR17252','POR17093','POR17666','POR18097','POR17532','POR17704','POR18023',
  'POR17724','POR17180','POR17323','POR18035','POR17775','POR17745','POR17491',
  'POR17789','POR17229','POR16549','POR17744','POR17202','POR17031','POR17478',
  'POR17303','POR18053','POR17079','POR17291','POR16017','POR17564','POR17872',
  'POR18218','POR17363','POR17626','POR17850','POR17534','POR17228','POR17020',
  'POR17294','POR18087','POR17231','POR17364','POR17790','POR17769','POR17944',
  'POR18084','POR17839','POR17921','POR17492','POR18008','POR17177','POR17776',
  'POR17939','POR17793','POR18193','POR17221','POR17894','POR17560','POR17362',
  'POR17743','POR17418','POR17368','POR17164','POR17774','POR17288','POR18159',
  'POR16788','POR17927','POR17747','POR18043','POR17342','POR17621','POR18041',
  'POR17547','POR17262','POR17625','POR17825','POR17895','POR17934','POR18058',
  'POR18001','POR17535','POR17190','POR18083','POR17100','POR17476','POR17628',
  'POR18227','POR17028','POR17163','POR17772','POR18160','POR18161','POR17813',
  'POR17898','POR17341','POR18040','POR17953','POR18076','POR17924','POR16325',
  'POR18002','POR17817','POR18186','POR17241','POR17952','POR18047','POR18223',
  'POR17929','POR17848'
);
