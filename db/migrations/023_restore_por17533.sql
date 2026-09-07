-- Item 9.0 "Office Equipment, Furniture & Fixtures" was short by exactly
-- PHP 1,805,700.00 against its Committed figure. The cause was not a missing
-- PO: POR17533 (SANSUI TECH SOLUTIONS OPC, "OFFICE EQUIPMENT", dated
-- 2026-04-05) exists at PHP 1,805,700.00 but was voided on 2026-08-18 by
-- mgbautista with reason 'WRONG INPUT'. Its amount matches the gap to the
-- centavo, and the Committed figure still counts it.
--
-- Accounting (2026-09-07) confirms the void was a mistake and the PO was
-- meant to be restored. After this, item 9.0 reconciles exactly:
--
--     POR17367 Armlink   16,000,000.00
--     POR17533 Sansui     1,805,700.00
--                       ---------------
--                        17,805,700.00  = budget_items.contract_amount
--
-- Safe to un-void:
--   * no po_payments rows exist against it, so no disbursement figure moves
--     -- this changes the commitment side only
--   * no live PO holds por_no 'POR17533', so the uk_por unique key is free
--   * active_guard is a generated column (1 when voided_at IS NULL), so it
--     restores itself; do not write to it
USE rcsni_cost;

SET SQL_SAFE_UPDATES = 0;

-- Idempotent: re-running finds voided_at already NULL and matches nothing.
UPDATE purchase_orders
   SET voided_at = NULL, voided_by = NULL, void_reason = NULL
 WHERE por_no = 'POR17533'
   AND project_id = 1
   AND voided_at IS NOT NULL;

SET SQL_SAFE_UPDATES = 1;

-- Verification: expect a single row, diff 0.00.
-- SELECT bi.item_no, bi.contract_amount,
--        COALESCE(SUM(po.contract_amount_php), 0) AS po_sum,
--        bi.contract_amount - COALESCE(SUM(po.contract_amount_php), 0) AS diff
--   FROM budget_items bi
--   LEFT JOIN purchase_orders po ON po.budget_item_id = bi.id AND po.voided_at IS NULL
--  WHERE bi.project_id = 1 AND bi.item_no = '9.0'
--  GROUP BY bi.id;
