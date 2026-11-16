-- PO percentages to 5 decimal places (as a percentage), i.e. 7 as a fraction.
--
-- Accounting asked for PO percentages shown to 5 decimal places. Showing 5
-- digits of a value stored to fewer would be false precision, so the storage
-- and the computed ratios are widened first:
--
--   po_payment_terms.pct          DECIMAL(9,6) -> DECIMAL(10,7)  (4 -> 5 dp as %)
--   purchase_orders.retention_pct DECIMAL(6,4) -> DECIMAL(10,7)  (2 -> 5 dp as %)
--   v_po_balance.pct_paid         ROUND(.., 4) -> ROUND(.., 7)   (2 -> 5 dp as %)
--
-- pct_paid needs the CAST: MySQL gives a DECIMAL quotient the dividend's
-- scale + 4 (div_precision_increment), and amount_php has scale 2, so the
-- bare division stops at 6 places and ROUND(.., 7) cannot add the 7th back.
--
-- Widening only: every existing value is kept exactly (0.230574 stays
-- 0.2305740). No amount, commitment or disbursement moves.
--
-- The percentage is never the source of truth for money: retention_amount is
-- still ROUND(contract_amount_php * retention_pct, 2) and payment shares are
-- computed live from amounts.

ALTER TABLE po_payment_terms MODIFY pct DECIMAL(10,7) NOT NULL;
ALTER TABLE purchase_orders  MODIFY retention_pct DECIMAL(10,7) NULL;

CREATE OR REPLACE VIEW v_po_balance AS
SELECT po.id, po.project_id, po.por_no, po.po_date, s.name AS supplier,
       bi.item_no, bi.description AS budget_item,
       po.currency, po.contract_amount, po.fx_rate, po.contract_amount_php,
       COALESCE(SUM(pp.amount_php), 0) AS paid_php,
       CASE WHEN po.status = 'cancelled' THEN 0
            ELSE po.contract_amount_php - COALESCE(SUM(pp.amount_php), 0) END AS balance_php,
       CASE WHEN po.contract_amount_php > 0
            THEN ROUND(CAST(COALESCE(SUM(pp.amount_php),0) AS DECIMAL(24,6)) / po.contract_amount_php, 7)
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
