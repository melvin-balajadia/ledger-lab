-- Accounting asked for Contract Cost alongside the four disbursement
-- sources already on the JPL/WBS breakdown (v_planning_line_spend /
-- WbsTable.tsx). Added as its own column, summed from purchase_orders,
-- NOT folded into total_spend -- contract_amount is a commitment and
-- total_spend is disbursements; CLAUDE.md rule #1 says never add those
-- together into one number.
--
-- Note for accounting: the per-JPL contract sum here is derived from
-- purchase_orders and will not always match a budget item's "Committed"
-- card, which is a separately maintained figure on budget_items. 13 of 20
-- budget items currently disagree with their PO sum (item 10.0 by
-- PHP 58M) -- see the query in the app's dev notes. That is a data
-- question for accounting to resolve, not something this view should
-- paper over.
USE rcsni_cost;

CREATE OR REPLACE VIEW v_planning_line_spend AS
SELECT pl.id AS planning_line_id, pl.project_id, pl.budget_item_id, pl.code, pl.description, pl.parent_id, pl.depth,
       pl.budget_amount, pl.is_active,
       COALESCE(pc.amt, 0) AS contract_amount,
       COALESCE(rp.amt, 0) AS replen_amount,
       COALESCE(pa.amt, 0) AS po_paid_amount,
       COALESCE(ca.amt, 0) AS cash_advance_amount,
       COALESCE(ap.amt, 0) AS additional_payment_amount,
       COALESCE(pe.amt, 0) AS labor_amount,
       COALESCE(rp.amt,0) + COALESCE(pa.amt,0) + COALESCE(ca.amt,0)
         + COALESCE(ap.amt,0) + COALESCE(pe.amt,0)              AS total_spend
FROM planning_lines pl
LEFT JOIN (SELECT planning_line_id, SUM(contract_amount_php) amt FROM purchase_orders
            WHERE voided_at IS NULL GROUP BY planning_line_id) pc ON pc.planning_line_id = pl.id
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
