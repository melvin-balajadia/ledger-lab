-- control_no (migration 015) is the reference on the ORIGINAL voucher slip
-- when the advance was requested. This is a different reference: the one
-- tying a "Liquidated"/"Partially liquidated" status back to the
-- liquidation transaction that settled it. Required in the app whenever
-- status is set to either of those (see server/routes/cashAdvances.js
-- validateLine) -- not searchable/filterable yet, so no index for now.
USE rcsni_cost;

ALTER TABLE cash_advances
  ADD COLUMN liquidation_control_no VARCHAR(64) NULL AFTER control_no;
