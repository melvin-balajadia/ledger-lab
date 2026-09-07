-- Item 10.0 "Plastic Pallets": the PHP 58M gap between the Committed figure
-- and the sum of POs was never missing work -- it is one PO recorded in the
-- wrong currency.
--
-- PO 231 (POR17623, PT INTRACO PALLET INDONESIA) holds 1,026,173.40, stored
-- as currency='PHP' with fx_rate=1.0, so contract_amount_php computed to
-- PHP 1,026,173.40. The amount is USD, not PHP -- confirmed by arithmetic:
--
--     1,026,173.40 x 57.554 = 59,060,383.86
--
-- which is budget_items.contract_amount for item 10.0 to the centavo. 57.554
-- is one of the five USD rates already documented in CLAUDE.md, so the
-- Committed figure was derived from this same USD contract at that rate while
-- the PO row itself was tagged PHP.
--
-- Accounting (2026-09-01) instructs that item 10.0 be converted at PHP 60.00
-- per USD:
--
--     1,026,173.40 x 60.00 = 61,570,404.00
--
-- contract_amount stays at the native 1,026,173.40 (it is the USD figure);
-- contract_amount_php is a STORED generated column and recomputes itself.
--
-- No payments exist against PO 231, so this touches the commitment side only
-- -- no disbursement figure moves.
--
-- NOTE: this also raises item 10.0's Committed figure by PHP 2,510,020.14
-- (59,060,383.86 -> 61,570,404.00), because the old value was struck at
-- 57.554 and accounting has now set the rate to 60.00. That flows through to
-- the Overview KPI cards. Reverse both statements together if the rate
-- changes again.
--
-- Item 3.0 is NOT touched here. Its two USD POs (POR16510, POR16513) are
-- already stored at exactly 60.000000, so the PHP 16.28M difference on that
-- item is not an FX issue and still needs accounting's answer.
USE rcsni_cost;

SET SQL_SAFE_UPDATES = 0;

-- Idempotent: re-running finds currency already 'USD' and matches nothing.
UPDATE purchase_orders
   SET currency = 'USD', fx_rate = 60.000000
 WHERE id = 231 AND por_no = 'POR17623' AND currency = 'PHP';

-- Realign the manually maintained Committed figure to the same rate.
UPDATE budget_items
   SET contract_amount = 61570404.00
 WHERE project_id = 1 AND item_no = '10.0' AND contract_amount = 59060383.86;

SET SQL_SAFE_UPDATES = 1;

-- Verification: both should read 61570404.00.
-- SELECT contract_amount_php FROM purchase_orders WHERE id = 231;
-- SELECT contract_amount FROM budget_items WHERE project_id=1 AND item_no='10.0';
