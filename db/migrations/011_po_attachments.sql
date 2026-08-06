-- Optional image attachments on a PO -- accounting wants an easy-to-view
-- photo reference for the MSR number (currently only captured as text).
-- Files themselves live on disk under server/uploads/purchase-orders/<po_id>/;
-- this table only tracks metadata, so mysqldump backups stay lightweight.
USE rcsni_cost;

CREATE TABLE purchase_order_attachments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT UNSIGNED NOT NULL,
  file_name         VARCHAR(80)  NOT NULL,   -- on-disk name (uuid + ext)
  original_name     VARCHAR(255) NOT NULL,   -- name as uploaded
  content_type      VARCHAR(100) NOT NULL,
  size_bytes        INT UNSIGNED NOT NULL,
  uploaded_by       VARCHAR(64)  NULL,
  uploaded_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY ix_poa_po (purchase_order_id),
  CONSTRAINT fk_poa_po FOREIGN KEY (purchase_order_id)
    REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;
