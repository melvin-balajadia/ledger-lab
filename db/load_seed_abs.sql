-- =====================================================================
-- Load the ETL output into rcsni_cost.
--
--   mysql --local-infile=1 -u root -p rcsni_cost < load_seed.sql
--
-- Requires local_infile=ON on the server:
--   SET GLOBAL local_infile = 1;
-- Run schema.sql FIRST. Run this from inside the directory holding the CSVs.
-- =====================================================================

USE rcsni_cost;
SET FOREIGN_KEY_CHECKS = 0;
SET @@session.sql_mode = REPLACE(@@session.sql_mode, 'STRICT_TRANS_TABLES', '');

-- Empty-string -> NULL is handled with NULLIF() on each nullable FK/date,
-- because LOAD DATA writes '' (or 0 for ints), not NULL, by default.

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/suppliers.csv' INTO TABLE suppliers
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, name, normalized_name, @tin, @cat, is_active)
  SET tin = NULLIF(@tin,''), category = NULLIF(@cat,'');

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/planning_lines.csv' INTO TABLE planning_lines
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, project_id, @bi, code, @parent, depth, @desc, @budget)
  SET budget_item_id = NULLIF(@bi,''),
      parent_id      = NULLIF(@parent,''),
      description    = NULLIF(@desc,''),
      budget_amount  = NULLIF(@budget,'');

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/purchase_orders.csv' INTO TABLE purchase_orders
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, project_id, por_no, @msr, @pdate, @sup, @bi, @pl, @idesc, @ref,
   currency, contract_amount, fx_rate, @terms, status, @remarks, @ret)
  SET retention_pct    = NULLIF(@ret,''),
      msr_no           = NULLIF(@msr,''),
      po_date          = NULLIF(@pdate,''),
      supplier_id      = NULLIF(@sup,''),
      budget_item_id   = NULLIF(@bi,''),
      planning_line_id = NULLIF(@pl,''),
      item_description = NULLIF(@idesc,''),
      ref_no           = NULLIF(@ref,''),
      payment_terms    = NULLIF(@terms,''),
      remarks          = NULLIF(@remarks,'');

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/po_payments.csv' INTO TABLE po_payments
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, purchase_order_id, @paid, payment_type, currency, amount, fx_rate,
   @pct, @voucher, @remarks)
  SET paid_on         = NULLIF(@paid,''),
      pct_of_contract = NULLIF(@pct,''),
      voucher_no      = NULLIF(@voucher,''),
      remarks         = NULLIF(@remarks,'');

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/po_payment_terms.csv' INTO TABLE po_payment_terms
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, purchase_order_id, seq, label, pct, kind, is_holdback);

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/replenishments.csv' INTO TABLE replenishments
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, project_id, @tdate, @sup, @pl, @bi, @idesc, @ref, @rtype, amount,
   @batch, @doc, needs_review)
  SET txn_date         = NULLIF(@tdate,''),
      document_no      = NULLIF(@doc,''),
      supplier_id      = NULLIF(@sup,''),
      planning_line_id = NULLIF(@pl,''),
      budget_item_id   = NULLIF(@bi,''),
      item_description = NULLIF(@idesc,''),
      ref_no           = NULLIF(@ref,''),
      ref_type         = NULLIF(@rtype,''),
      batch_no         = NULLIF(@batch,'');

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/cash_advances.csv' INTO TABLE cash_advances
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, project_id, @tdate, @bi, @pl, @req, @purpose, amount,
   liquidated_amount, status, @doc, needs_review)
  SET txn_date         = NULLIF(@tdate,''),
      budget_item_id   = NULLIF(@bi,''),
      planning_line_id = NULLIF(@pl,''),
      requested_by     = NULLIF(@req,''),
      purpose          = NULLIF(@purpose,''),
      document_no      = NULLIF(@doc,'');

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/additional_payments.csv' INTO TABLE additional_payments
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, project_id, @tdate, payee, @sup, @bi, @pl, @desc, @voucher,
   expense_type, currency, amount, fx_rate, @doc, needs_review)
  SET txn_date         = NULLIF(@tdate,''),
      supplier_id      = NULLIF(@sup,''),
      budget_item_id   = NULLIF(@bi,''),
      planning_line_id = NULLIF(@pl,''),
      description      = NULLIF(@desc,''),
      voucher_no       = NULLIF(@voucher,''),
      document_no      = NULLIF(@doc,'');

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/payroll_periods.csv' INTO TABLE payroll_periods
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, project_id, label, period_start, period_end, status, total_amount);

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/workers.csv' INTO TABLE workers
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, @empno, last_name, first_name, @mid, full_name, @pos, @drate, @hrate,
   @hired, is_active)
  SET employee_no = NULLIF(@empno,''),
      middle_name = NULLIF(@mid,''),
      position    = NULLIF(@pos,''),
      daily_rate  = NULLIF(@drate,''),
      hourly_rate = NULLIF(@hrate,''),
      date_hired  = NULLIF(@hired,'');

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/payroll_entries.csv' INTO TABLE payroll_entries
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, project_id, payroll_period_id, worker_id, @pl, @bi, amount)
  SET planning_line_id = NULLIF(@pl,''),
      budget_item_id   = NULLIF(@bi,'');

LOAD DATA LOCAL INFILE 'C:/Plaridel/Temp Data/New/plaridel-dashboard/db/seed/weekly_budget_additions.csv' INTO TABLE weekly_budget_additions
  FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n'
  IGNORE 1 LINES
  (id, project_id, week_label, week_start, week_end, @bi, seq, needs_review,
   additional_po, replen, labor)
  SET budget_item_id = NULLIF(@bi,'');

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- Post-load: build the planning-line hierarchy.
-- The ETL emits flat codes; parents are derived by trimming the last
-- dotted segment ('3.1.2.5' -> '3.1.2'). Deepest-first so parents exist.
-- ---------------------------------------------------------------------
UPDATE planning_lines c
  JOIN planning_lines p
    ON p.project_id = c.project_id
   AND p.code = SUBSTRING_INDEX(c.code, '.', c.depth - 1)
SET c.parent_id = p.id
WHERE c.depth > 1 AND c.parent_id IS NULL;

-- Cache each period's total from the entries actually loaded.
UPDATE payroll_periods pp
  LEFT JOIN (SELECT payroll_period_id, SUM(amount) s
               FROM payroll_entries GROUP BY payroll_period_id) x
    ON x.payroll_period_id = pp.id
SET pp.total_amount = COALESCE(x.s, pp.total_amount);

-- Sanity checks -- run these and eyeball the numbers.
SELECT 'suppliers' t, COUNT(*) n FROM suppliers
UNION ALL SELECT 'planning_lines', COUNT(*) FROM planning_lines
UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders
UNION ALL SELECT 'po_payments', COUNT(*) FROM po_payments
UNION ALL SELECT 'replenishments', COUNT(*) FROM replenishments
UNION ALL SELECT 'payroll_periods', COUNT(*) FROM payroll_periods
UNION ALL SELECT 'workers', COUNT(*) FROM workers
UNION ALL SELECT 'payroll_entries', COUNT(*) FROM payroll_entries
UNION ALL SELECT 'cash_advances', COUNT(*) FROM cash_advances
UNION ALL SELECT 'additional_payments', COUNT(*) FROM additional_payments
UNION ALL SELECT 'po_payment_terms', COUNT(*) FROM po_payment_terms;

-- Retention exposure: 11 POs, PHP 25,319,221.48 held to completion.
SELECT por_no, supplier, FORMAT(contract_amount_php,2) contract,
       CONCAT(FORMAT(retention_pct*100,0),'%') pct,
       FORMAT(retention_amount,2) held, FORMAT(retention_outstanding,2) outstanding
FROM v_po_retention ORDER BY retention_amount DESC;

-- Reconciliation against the sheet control totals. Only two lines should
-- differ, and both are expected -- see ANSWERS_APPLIED.md.
SELECT 'replenishments' src, FORMAT(SUM(amount),2) extracted, '13,351,918.29' sheet
  FROM replenishments
UNION ALL SELECT 'cash_advances', FORMAT(SUM(amount),2), '2,201,128.33' FROM cash_advances
UNION ALL SELECT 'additional_payments', FORMAT(SUM(amount_php),2), '26,631,738.32' FROM additional_payments
UNION ALL SELECT 'payroll_entries', FORMAT(SUM(amount),2), '19,712,192.06' FROM payroll_entries;

SELECT item_no, description,
       FORMAT(budget,2) budget, FORMAT(contract_amount,2) committed,
       FORMAT(total_disbursed,2) disbursed,
       FORMAT(remaining_vs_contract,2) remaining, is_over_budget
FROM v_budget_vs_actual ORDER BY CAST(item_no AS DECIMAL(5,1));
