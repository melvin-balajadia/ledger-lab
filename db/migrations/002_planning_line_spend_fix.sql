-- v_planning_line_spend never had a consumer, so nothing depends on its old
-- shape. Brings it in line with v_replen_by_item/v_ca_by_item/v_addl_by_item:
-- excludes needs_review=1 rows (replen/additional payments), adds the two
-- disbursement sources it was missing (cash_advances, additional_payments),
-- so a budget item's WBS subtree reconciles with its v_budget_vs_actual total.
USE rcsni_cost;

CREATE OR REPLACE VIEW v_planning_line_spend AS
SELECT pl.id AS planning_line_id, pl.project_id, pl.budget_item_id, pl.code, pl.description, pl.parent_id, pl.depth,
       COALESCE(rp.amt, 0) AS replen_amount,
       COALESCE(pa.amt, 0) AS po_paid_amount,
       COALESCE(ca.amt, 0) AS cash_advance_amount,
       COALESCE(ap.amt, 0) AS additional_payment_amount,
       COALESCE(pe.amt, 0) AS labor_amount,
       COALESCE(rp.amt,0) + COALESCE(pa.amt,0) + COALESCE(ca.amt,0)
         + COALESCE(ap.amt,0) + COALESCE(pe.amt,0)              AS total_spend
FROM planning_lines pl
LEFT JOIN (SELECT planning_line_id, SUM(amount) amt FROM replenishments
            WHERE needs_review = 0 GROUP BY planning_line_id) rp ON rp.planning_line_id = pl.id
LEFT JOIN (SELECT po.planning_line_id, SUM(pp.amount_php) amt
             FROM purchase_orders po JOIN po_payments pp ON pp.purchase_order_id = po.id
            GROUP BY po.planning_line_id) pa ON pa.planning_line_id = pl.id
LEFT JOIN (SELECT planning_line_id, SUM(amount) amt FROM cash_advances
            GROUP BY planning_line_id) ca ON ca.planning_line_id = pl.id
LEFT JOIN (SELECT planning_line_id, SUM(amount_php) amt FROM additional_payments
            WHERE needs_review = 0 GROUP BY planning_line_id) ap ON ap.planning_line_id = pl.id
LEFT JOIN (SELECT planning_line_id, SUM(amount) amt FROM payroll_entries
            GROUP BY planning_line_id) pe ON pe.planning_line_id = pl.id;
