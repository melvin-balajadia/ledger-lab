-- Enables writes on purchase_orders/po_payments per CLAUDE.md's convention:
-- "before enabling any write endpoint, add created_by/updated_by and an
-- append-only audit_log." po_payments only gets created_by -- it's a pure
-- ledger, never edited once recorded (unlike purchase_orders, which can be
-- amended later).
USE rcsni_cost;

-- purchase_orders already has updated_at (auto-updating since its original
-- creation) -- only created_by/updated_by are new here.
ALTER TABLE purchase_orders
  ADD COLUMN created_by VARCHAR(64) NULL AFTER remarks,
  ADD COLUMN updated_by VARCHAR(64) NULL AFTER created_by;

ALTER TABLE po_payments
  ADD COLUMN created_by VARCHAR(64) NULL AFTER remarks;
