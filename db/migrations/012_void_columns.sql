-- "Delete" on a financial ledger must be reversible. A real DELETE either
-- cascades away child rows silently (purchase_orders -> po_payments) or
-- destroys the one thing that proves a mistake happened. Every "Delete"
-- button in the UI now calls a void endpoint instead of DELETE: the row
-- disappears from every list and total exactly like removing a spreadsheet
-- row, but stays restorable. Per CLAUDE.md: "these figures feed billing."
USE rcsni_cost;

ALTER TABLE replenishments
  ADD COLUMN voided_at    TIMESTAMP    NULL,
  ADD COLUMN voided_by    VARCHAR(64)  NULL,
  ADD COLUMN void_reason  VARCHAR(255) NULL;

ALTER TABLE po_payments
  ADD COLUMN voided_at    TIMESTAMP    NULL,
  ADD COLUMN voided_by    VARCHAR(64)  NULL,
  ADD COLUMN void_reason  VARCHAR(255) NULL;

-- payroll_entries and purchase_orders each carry a UNIQUE key that a voided
-- row would otherwise block forever (void a wrong entry, then can never
-- re-enter that same worker/JPL/period -- or PO number -- again). A STORED
-- generated column that goes NULL once voided fixes this: MySQL unique
-- indexes never treat two NULLs as a collision, so voided rows fall out of
-- the uniqueness check while the "no duplicate ACTIVE row" rule stays intact.

ALTER TABLE payroll_entries
  ADD COLUMN voided_at    TIMESTAMP    NULL,
  ADD COLUMN voided_by    VARCHAR(64)  NULL,
  ADD COLUMN void_reason  VARCHAR(255) NULL,
  ADD COLUMN active_guard TINYINT UNSIGNED
    GENERATED ALWAYS AS (IF(voided_at IS NULL, 1, NULL)) STORED,
  DROP INDEX uk_entry,
  ADD UNIQUE KEY uk_entry (payroll_period_id, worker_id, planning_line_id, active_guard);

ALTER TABLE purchase_orders
  ADD COLUMN voided_at    TIMESTAMP    NULL,
  ADD COLUMN voided_by    VARCHAR(64)  NULL,
  ADD COLUMN void_reason  VARCHAR(255) NULL,
  ADD COLUMN active_guard TINYINT UNSIGNED
    GENERATED ALWAYS AS (IF(voided_at IS NULL, 1, NULL)) STORED,
  DROP INDEX uk_por,
  ADD UNIQUE KEY uk_por (project_id, por_no, active_guard);

-- Exclude voided rows from every total the same way needs_review = 0 rows
-- already are, and stop showing a phantom outstanding balance on a
-- cancelled PO (contract not fulfilled -> nothing left to pay).
CREATE OR REPLACE VIEW v_po_retention AS
SELECT po.id, po.project_id, po.por_no, s.name AS supplier,
       bi.item_no, po.contract_amount_php,
       po.retention_pct,
       ROUND(po.contract_amount_php * COALESCE(po.retention_pct,0), 2) AS retention_amount,
       COALESCE(rel.released, 0)                                        AS retention_released,
       ROUND(po.contract_amount_php * COALESCE(po.retention_pct,0), 2)
         - COALESCE(rel.released, 0)                                    AS retention_outstanding
FROM purchase_orders po
JOIN suppliers s ON s.id = po.supplier_id
LEFT JOIN budget_items bi ON bi.id = po.budget_item_id
LEFT JOIN (SELECT purchase_order_id, SUM(amount_php) released
             FROM po_payments WHERE payment_type = 'retention' AND voided_at IS NULL
            GROUP BY purchase_order_id) rel
       ON rel.purchase_order_id = po.id
WHERE COALESCE(po.retention_pct, 0) > 0 AND po.voided_at IS NULL;

CREATE OR REPLACE VIEW v_replen_by_item AS
SELECT project_id, budget_item_id, SUM(amount) AS replen_amount
FROM replenishments WHERE needs_review = 0 AND voided_at IS NULL
GROUP BY project_id, budget_item_id;

CREATE OR REPLACE VIEW v_labor_by_item AS
SELECT project_id, budget_item_id, SUM(amount) AS labor_cost
FROM payroll_entries WHERE voided_at IS NULL
GROUP BY project_id, budget_item_id;

CREATE OR REPLACE VIEW v_po_paid_by_item AS
SELECT po.project_id, po.budget_item_id,
       SUM(pp.amount_php) AS paid_po_amount
FROM purchase_orders po
JOIN po_payments pp ON pp.purchase_order_id = po.id
WHERE po.voided_at IS NULL AND pp.voided_at IS NULL
GROUP BY po.project_id, po.budget_item_id;

CREATE OR REPLACE VIEW v_po_balance AS
SELECT po.id, po.project_id, po.por_no, po.po_date, s.name AS supplier,
       bi.item_no, bi.description AS budget_item,
       po.currency, po.contract_amount, po.fx_rate, po.contract_amount_php,
       COALESCE(SUM(pp.amount_php), 0) AS paid_php,
       CASE WHEN po.status = 'cancelled' THEN 0
            ELSE po.contract_amount_php - COALESCE(SUM(pp.amount_php), 0) END AS balance_php,
       CASE WHEN po.contract_amount_php > 0
            THEN ROUND(COALESCE(SUM(pp.amount_php),0) / po.contract_amount_php, 4)
       END AS pct_paid,
       po.payment_terms, po.status
FROM purchase_orders po
JOIN suppliers s ON s.id = po.supplier_id
LEFT JOIN budget_items bi ON bi.id = po.budget_item_id
LEFT JOIN po_payments pp ON pp.purchase_order_id = po.id AND pp.voided_at IS NULL
WHERE po.voided_at IS NULL
GROUP BY po.id, po.project_id, po.por_no, po.po_date, s.name, bi.item_no,
         bi.description, po.currency, po.contract_amount, po.fx_rate,
         po.contract_amount_php, po.payment_terms, po.status;
