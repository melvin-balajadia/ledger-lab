-- Adds the audit trail required before replenishments accepts writes.
-- Run against the live rcsni_cost database (schema.sql's DROP/CREATE would
-- wipe existing data -- this migration only ALTERs/CREATEs what's missing).
USE rcsni_cost;

ALTER TABLE replenishments
  ADD COLUMN created_by VARCHAR(64) NULL AFTER needs_review,
  ADD COLUMN updated_by VARCHAR(64) NULL AFTER created_by,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE TABLE audit_log (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_name  VARCHAR(64) NOT NULL,
  row_id      INT UNSIGNED NOT NULL,
  action      ENUM('insert','update') NOT NULL,
  changed_by  VARCHAR(64) NOT NULL,
  changed_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  before_json JSON NULL,
  after_json  JSON NULL,
  KEY ix_audit_table_row (table_name, row_id)
) ENGINE=InnoDB;
