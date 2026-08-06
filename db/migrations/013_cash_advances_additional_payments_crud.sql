-- Enables full CRUD (create/edit/void/restore) on cash_advances and
-- additional_payments, per CLAUDE.md's convention: "before enabling any
-- write endpoint, add created_by/updated_by and an append-only audit_log."
-- Void columns are included from the start rather than bolted on later
-- (see db/migrations/012_void_columns.sql for why "Delete" must void, not
-- DELETE, on a ledger that feeds billing).
USE rcsni_cost;

ALTER TABLE cash_advances
  ADD COLUMN created_by  VARCHAR(64)  NULL,
  ADD COLUMN updated_by  VARCHAR(64)  NULL,
  ADD COLUMN updated_at  TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN voided_at   TIMESTAMP    NULL,
  ADD COLUMN voided_by   VARCHAR(64)  NULL,
  ADD COLUMN void_reason VARCHAR(255) NULL;

ALTER TABLE additional_payments
  ADD COLUMN created_by  VARCHAR(64)  NULL,
  ADD COLUMN updated_by  VARCHAR(64)  NULL,
  ADD COLUMN updated_at  TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN voided_at   TIMESTAMP    NULL,
  ADD COLUMN voided_by   VARCHAR(64)  NULL,
  ADD COLUMN void_reason VARCHAR(255) NULL;

CREATE OR REPLACE VIEW v_ca_by_item AS
SELECT project_id, budget_item_id, SUM(amount) AS cash_advanced
FROM cash_advances WHERE voided_at IS NULL
GROUP BY project_id, budget_item_id;

CREATE OR REPLACE VIEW v_addl_by_item AS
SELECT project_id, budget_item_id, SUM(amount_php) AS additional_payment
FROM additional_payments WHERE needs_review = 0 AND voided_at IS NULL
GROUP BY project_id, budget_item_id;

-- v_planning_line_spend has its OWN independent subqueries duplicating the
-- logic in v_replen_by_item/v_po_paid_by_item/v_labor_by_item -- migration
-- 012 updated those but missed this view, so a voided row was (until now)
-- excluded from the Budget Item overview but still counted in the WBS
-- drill-down. Fixed here for all five sources, plus the two new ones.
CREATE OR REPLACE VIEW v_planning_line_spend AS
SELECT pl.id AS planning_line_id, pl.project_id, pl.budget_item_id, pl.code, pl.description, pl.parent_id, pl.depth,
       pl.budget_amount, pl.is_active,
       COALESCE(rp.amt, 0) AS replen_amount,
       COALESCE(pa.amt, 0) AS po_paid_amount,
       COALESCE(ca.amt, 0) AS cash_advance_amount,
       COALESCE(ap.amt, 0) AS additional_payment_amount,
       COALESCE(pe.amt, 0) AS labor_amount,
       COALESCE(rp.amt,0) + COALESCE(pa.amt,0) + COALESCE(ca.amt,0)
         + COALESCE(ap.amt,0) + COALESCE(pe.amt,0)              AS total_spend
FROM planning_lines pl
LEFT JOIN (SELECT planning_line_id, SUM(amount) amt FROM replenishments
            WHERE needs_review = 0 AND voided_at IS NULL GROUP BY planning_line_id) rp ON rp.planning_line_id = pl.id
LEFT JOIN (SELECT po.planning_line_id, SUM(pp.amount_php) amt
             FROM purchase_orders po JOIN po_payments pp ON pp.purchase_order_id = po.id
            WHERE po.voided_at IS NULL AND pp.voided_at IS NULL
            GROUP BY po.planning_line_id) pa ON pa.planning_line_id = pl.id
LEFT JOIN (SELECT planning_line_id, SUM(amount) amt FROM cash_advances
            WHERE voided_at IS NULL GROUP BY planning_line_id) ca ON ca.planning_line_id = pl.id
LEFT JOIN (SELECT planning_line_id, SUM(amount_php) amt FROM additional_payments
            WHERE needs_review = 0 AND voided_at IS NULL GROUP BY planning_line_id) ap ON ap.planning_line_id = pl.id
LEFT JOIN (SELECT planning_line_id, SUM(amount) amt FROM payroll_entries
            WHERE voided_at IS NULL GROUP BY planning_line_id) pe ON pe.planning_line_id = pl.id;
