-- Merges supplier "E C P ENTERPRISES" into "ECP ENTERPRISES".
--
-- Same company entered under two spellings in the source spreadsheet. The PO
-- supplier filter and the Top Suppliers report both match one supplier_id,
-- so picking "ECP ENTERPRISES" hid the 11 POs filed under the spaced-out
-- spelling (reported by accounting as "PO not found by supplier"), and the
-- report split ECP's total across two rows.
--
-- Accounting (2026-10-25) confirms they are the same supplier and to keep
-- "ECP ENTERPRISES".
--
-- What it does:
--   * repoints every purchase_orders / replenishments / additional_payments
--     row (voided ones too, so a restore lands on the right supplier) from
--     the duplicate to the kept record, with an audit_log row for each
--   * deactivates the duplicate (not deleted -- the audit trail refers to it)
--
-- Amounts are untouched: no commitment or disbursement total moves, only
-- which supplier the rows are attributed to.
--
-- Looked up by name, not id, and idempotent: re-running finds nothing left
-- on the duplicate and it already inactive, so it matches nothing. If either
-- name is missing, @keep/@dup is NULL and every statement matches nothing.
USE rcsni_cost;

SET SQL_SAFE_UPDATES = 0;
START TRANSACTION;

SET @keep = (SELECT id FROM suppliers WHERE name = 'ECP ENTERPRISES');
SET @dup  = (SELECT id FROM suppliers WHERE name = 'E C P ENTERPRISES');

INSERT INTO audit_log (table_name, row_id, action, changed_by, before_json, after_json)
SELECT 'purchase_orders', id, 'update', 'migration-025',
       JSON_OBJECT('supplier_id', supplier_id), JSON_OBJECT('supplier_id', @keep)
  FROM purchase_orders WHERE supplier_id = @dup AND @keep IS NOT NULL;
UPDATE purchase_orders SET supplier_id = @keep, updated_by = 'migration-025'
 WHERE supplier_id = @dup AND @keep IS NOT NULL;

INSERT INTO audit_log (table_name, row_id, action, changed_by, before_json, after_json)
SELECT 'replenishments', id, 'update', 'migration-025',
       JSON_OBJECT('supplier_id', supplier_id), JSON_OBJECT('supplier_id', @keep)
  FROM replenishments WHERE supplier_id = @dup AND @keep IS NOT NULL;
UPDATE replenishments SET supplier_id = @keep, updated_by = 'migration-025'
 WHERE supplier_id = @dup AND @keep IS NOT NULL;

INSERT INTO audit_log (table_name, row_id, action, changed_by, before_json, after_json)
SELECT 'additional_payments', id, 'update', 'migration-025',
       JSON_OBJECT('supplier_id', supplier_id), JSON_OBJECT('supplier_id', @keep)
  FROM additional_payments WHERE supplier_id = @dup AND @keep IS NOT NULL;
UPDATE additional_payments SET supplier_id = @keep, updated_by = 'migration-025'
 WHERE supplier_id = @dup AND @keep IS NOT NULL;

INSERT INTO audit_log (table_name, row_id, action, changed_by, before_json, after_json)
SELECT 'suppliers', id, 'update', 'migration-025',
       JSON_OBJECT('is_active', is_active, 'merged_into', NULL),
       JSON_OBJECT('is_active', 0, 'merged_into', @keep)
  FROM suppliers WHERE id = @dup AND is_active = 1 AND @keep IS NOT NULL;
UPDATE suppliers SET is_active = 0, updated_by = 'migration-025'
 WHERE id = @dup AND is_active = 1 AND @keep IS NOT NULL;

COMMIT;
SET SQL_SAFE_UPDATES = 1;

-- Verification: expect one row, ECP ENTERPRISES, active, holding every ECP PO
-- (41 on the 2026-10-25 data), and E C P ENTERPRISES inactive with 0 rows.
-- SELECT s.id, s.name, s.is_active,
--        (SELECT COUNT(*) FROM purchase_orders     WHERE supplier_id = s.id) AS pos,
--        (SELECT COUNT(*) FROM replenishments      WHERE supplier_id = s.id) AS reps,
--        (SELECT COUNT(*) FROM additional_payments WHERE supplier_id = s.id) AS addl
--   FROM suppliers s WHERE s.name IN ('ECP ENTERPRISES', 'E C P ENTERPRISES');
