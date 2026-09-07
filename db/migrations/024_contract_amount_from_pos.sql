-- Accounting, 2026-09-07: "The system should automatically update the contract
-- total based on the PO's."
--
-- Until now budget_items.contract_amount was maintained by hand and had not
-- been edited once since the app went live -- there is not a single
-- budget_items row in audit_log, which starts 2026-08-04, while 42 POs were
-- entered in the same period. So the two drifted apart a little more each week:
-- six items were out by PHP 21,046,695.77 in total, and item 2.0's gap was
-- exactly the four POs added since go-live.
--
-- v_budget_vs_actual now derives the commitment from the POs instead. The
-- column stays on budget_items as the historical record of what the
-- spreadsheet carried, but nothing reads it any more.
--
-- This does NOT blur CLAUDE.md rule #1. The commitment still comes only from
-- purchase_orders.contract_amount_php and still never mixes with the five
-- disbursement sources; only the authority for the number changes, from a
-- typed figure to the POs it was always meant to summarise.
--
-- Voided POs are excluded, so voiding a PO now lowers the commitment by itself
-- -- which is what should have happened for POR17533 (see migration 023).
--
-- KNOWN GAP: POR18380 (CT-Technologies, PHP 2,903,503.40, "INSTALLATION OF
-- INSULATED PANEL", 2026-08-09) has no budget_item_id and no planning_line_id,
-- so it is in no item's total and drops out of the reported commitment
-- entirely. It looks like item 5.0 work, but assigning it is accounting's
-- call, not a guess this migration should make. Until it is assigned the
-- project commitment understates by that amount.
USE rcsni_cost;

-- Same shape as v_po_paid_by_item, for the commitment side.
CREATE OR REPLACE VIEW v_po_contract_by_item AS
SELECT project_id, budget_item_id, SUM(contract_amount_php) AS contract_amount
  FROM purchase_orders
 WHERE voided_at IS NULL AND budget_item_id IS NOT NULL
 GROUP BY project_id, budget_item_id;

CREATE OR REPLACE VIEW v_budget_vs_actual AS
SELECT
  bi.id                                AS budget_item_id,
  bi.project_id,
  bi.item_no,
  bi.description,
  bi.procurement_mode,
  bi.remarks,
  bi.revised_budget                    AS budget,
  COALESCE(pc.contract_amount, 0)      AS contract_amount,
  COALESCE(l.labor_cost, 0)            AS labor_cost,
  COALESCE(c.cash_advanced, 0)         AS cash_advanced,
  COALESCE(p.paid_po_amount, 0)        AS paid_po_amount,
  COALESCE(r.replen_amount, 0)         AS replen_amount,
  COALESCE(a.additional_payment, 0)    AS additional_payment,
  COALESCE(p.paid_po_amount,0) + COALESCE(r.replen_amount,0)
    + COALESCE(c.cash_advanced,0) + COALESCE(l.labor_cost,0)
    + COALESCE(a.additional_payment,0)                        AS total_disbursed,
  bi.revised_budget - COALESCE(pc.contract_amount, 0)         AS remaining_vs_contract,
  bi.revised_budget - (COALESCE(p.paid_po_amount,0) + COALESCE(r.replen_amount,0)
    + COALESCE(c.cash_advanced,0) + COALESCE(l.labor_cost,0)
    + COALESCE(a.additional_payment,0))                       AS remaining_vs_disbursed,
  CASE WHEN bi.revised_budget > 0
       THEN ROUND(COALESCE(pc.contract_amount, 0) / bi.revised_budget, 4) END AS commitment_ratio,
  CASE WHEN COALESCE(pc.contract_amount, 0) > bi.revised_budget THEN 1 ELSE 0 END AS is_over_budget,
  (SELECT COUNT(*) FROM budget_revisions br WHERE br.budget_item_id = bi.id) AS revision_count
FROM budget_items bi
LEFT JOIN v_po_contract_by_item pc ON pc.budget_item_id = bi.id
LEFT JOIN v_po_paid_by_item p ON p.budget_item_id = bi.id
LEFT JOIN v_replen_by_item  r ON r.budget_item_id = bi.id
LEFT JOIN v_ca_by_item      c ON c.budget_item_id = bi.id
LEFT JOIN v_labor_by_item   l ON l.budget_item_id = bi.id
LEFT JOIN v_addl_by_item    a ON a.budget_item_id = bi.id;

-- Verification: expect 0 rows. Every item's Committed must now equal the sum
-- of its live POs, by construction.
-- SELECT v.item_no, v.contract_amount, COALESCE(SUM(po.contract_amount_php),0) AS po_sum
--   FROM v_budget_vs_actual v
--   LEFT JOIN purchase_orders po ON po.budget_item_id = v.budget_item_id AND po.voided_at IS NULL
--  WHERE v.project_id = 1
--  GROUP BY v.budget_item_id, v.item_no, v.contract_amount
-- HAVING v.contract_amount <> COALESCE(SUM(po.contract_amount_php),0);
