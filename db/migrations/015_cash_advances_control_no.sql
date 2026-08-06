-- Every other ledger already has a free-text reference the accountant
-- assigns herself (purchase_orders.ref_no, po_payments/additional_payments
-- .voucher_no, replenishments.ref_no) -- cash_advances was the one gap.
-- document_no is NOT this: it's the internal key that groups sibling rows
-- when one voucher splits across several JPL codes (see schema.sql), not a
-- human-facing number she writes on the slip.
USE rcsni_cost;

ALTER TABLE cash_advances
  ADD COLUMN control_no VARCHAR(64) NULL AFTER document_no,
  ADD KEY ix_ca_control (control_no);
