-- =====================================================================
-- Royale Cold Storage — Plaridel Extension
-- Project Cost & Payroll Monitoring — MySQL 8.0 schema
-- =====================================================================
-- Money:  DECIMAL(18,2) in PHP.  Foreign-currency contracts keep their
--         native amount + fx_rate and store a generated PHP column.
-- Codes:  "JPL" / planning-line codes are variable-depth dotted strings
--         ("2.0", "3.1.2.5", "3.2.2.26") -> VARCHAR, not numeric.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS rcsni_cost
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE rcsni_cost;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS
  timekeeping_detail, payroll_entries, payroll_periods, workers,
  weekly_budget_additions, remaining_cost_lines, remaining_cost_estimates,
  purchase_order_attachments, po_payments, purchase_orders, replenishments, cash_advances,
  additional_payments, budget_revisions, audit_log, users, po_payment_terms,
  planning_lines, budget_items, suppliers, fx_rates, projects;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 1. Reference / master data
-- ---------------------------------------------------------------------

CREATE TABLE projects (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(32)  NOT NULL UNIQUE,      -- 'PLAEX'
  name          VARCHAR(160) NOT NULL,             -- 'Plaridel Extension'
  company       VARCHAR(160) NOT NULL,             -- 'Royale Cold Storage North Inc.'
  location      VARCHAR(255) NULL,                 -- 'Bypass Rd. Brgy Bulihan, Plaridel, Bulacan'
  tin           VARCHAR(32)  NULL,                 -- '008-400-912-002'
  total_budget  DECIMAL(18,2) NOT NULL DEFAULT 0,  -- 1,333,876,003
  -- Confirmed by accounting: every amount in the source is VAT-INCLUSIVE.
  -- Do not add VAT anywhere in the app; use v_vat_component to report it.
  vat_inclusive TINYINT(1) NOT NULL DEFAULT 1,
  vat_rate      DECIMAL(5,4) NOT NULL DEFAULT 0.1200,
  started_on    DATE NULL,
  status        ENUM('planning','active','on_hold','closed') NOT NULL DEFAULT 'active',
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE fx_rates (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  currency      CHAR(3)      NOT NULL,             -- 'USD','EUR'
  rate_to_php   DECIMAL(12,6) NOT NULL,            -- 61.570000
  effective_on  DATE         NOT NULL,
  note          VARCHAR(120) NULL,
  UNIQUE KEY uk_fx (currency, effective_on)
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(191) NOT NULL,
  -- normalized_name is what you dedupe/join on. The source data has
  -- 'SMC SKYWAY CORPORATION' vs 'SMC SKYWAY STAGE 3 CORPORATION' etc.
  normalized_name VARCHAR(191) NOT NULL,
  tin           VARCHAR(32)  NULL,
  category      VARCHAR(64)  NULL,                 -- 'hardware','concrete','toll','steel'
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_by    VARCHAR(64)  NULL,
  updated_by    VARCHAR(64)  NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_supplier_norm (normalized_name),
  KEY ix_supplier_name (name)
) ENGINE=InnoDB;

-- Top-level budget lines: item 2.0 Land Development ... 19.0 Interest
CREATE TABLE budget_items (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id        INT UNSIGNED NOT NULL,
  item_no           VARCHAR(8)   NOT NULL,         -- '2.0','3.0',...'19.0'
  sort_order        SMALLINT     NOT NULL DEFAULT 0,
  description       VARCHAR(191) NOT NULL,
  original_budget   DECIMAL(18,2) NOT NULL DEFAULT 0,
  revised_budget    DECIMAL(18,2) NOT NULL DEFAULT 0,
  contract_amount   DECIMAL(18,2) NOT NULL DEFAULT 0,  -- "TOTAL COST BY CONTRACT" (committed)
  procurement_mode  ENUM('inhouse','po_awarded','for_bidding','bac_recommendation','third_party','other')
                    NOT NULL DEFAULT 'other',
  remarks           TEXT NULL,
  created_by        VARCHAR(64) NULL,
  updated_by        VARCHAR(64) NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_budget_item (project_id, item_no),
  CONSTRAINT fk_bi_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- JPL / WBS codes. Self-referencing, variable depth (seen up to 7 levels).
CREATE TABLE planning_lines (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id    INT UNSIGNED NOT NULL,
  budget_item_id INT UNSIGNED NULL,                -- resolved from the code's first segment
  code          VARCHAR(32)  NOT NULL,            -- '3.1.2.5'
  parent_id     INT UNSIGNED NULL,
  depth         TINYINT UNSIGNED NOT NULL DEFAULT 1,
  description   VARCHAR(191) NULL,
  budget_amount DECIMAL(18,2) NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_by    VARCHAR(64) NULL,
  updated_by    VARCHAR(64) NULL,
  updated_at    TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pl_code (project_id, code),
  KEY ix_pl_parent (parent_id),
  KEY ix_pl_item (budget_item_id),
  CONSTRAINT fk_pl_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pl_parent  FOREIGN KEY (parent_id)  REFERENCES planning_lines(id) ON DELETE SET NULL,
  CONSTRAINT fk_pl_item    FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. Commitments — purchase orders
-- ---------------------------------------------------------------------

CREATE TABLE purchase_orders (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id        INT UNSIGNED NOT NULL,
  por_no            VARCHAR(32)  NOT NULL,          -- 'POR16017' / 'POR0000016622'
  msr_no            VARCHAR(32)  NULL,              -- '30001683'
  po_date           DATE         NULL,
  supplier_id       INT UNSIGNED NOT NULL,
  budget_item_id    INT UNSIGNED NULL,
  planning_line_id  INT UNSIGNED NULL,
  item_description  VARCHAR(255) NULL,
  ref_no            VARCHAR(120) NULL,              -- invoice / SI / MSR reference
  currency          CHAR(3)      NOT NULL DEFAULT 'PHP',
  contract_amount   DECIMAL(18,4) NOT NULL DEFAULT 0,   -- in `currency`
  fx_rate           DECIMAL(12,6) NOT NULL DEFAULT 1,   -- to PHP
  contract_amount_php DECIMAL(18,2)
      AS (ROUND(contract_amount * fx_rate, 2)) STORED,
  payment_terms     VARCHAR(160) NULL,              -- original free text, kept verbatim
  -- Retention applies to SOME POs only, per the agreed terms (accounting).
  -- 11 of 40 POs with recorded terms have a holdback; PHP 25.3 M in total.
  retention_pct     DECIMAL(6,4) NULL,              -- 0.1000 = 10% held to completion
  status            ENUM('open','partially_paid','fully_paid','cancelled')
                    NOT NULL DEFAULT 'open',
  remarks           TEXT NULL,
  created_by        VARCHAR(64)  NULL,
  updated_by        VARCHAR(64)  NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- "Delete" in the UI voids rather than deletes -- a real DELETE would
  -- cascade away po_payments/po_payment_terms silently. active_guard is NULL
  -- once voided, so uk_por doesn't permanently block reusing a PO number
  -- after a mistaken entry is voided (see db/migrations/012_void_columns.sql).
  voided_at         TIMESTAMP    NULL,
  voided_by         VARCHAR(64)  NULL,
  void_reason       VARCHAR(255) NULL,
  active_guard      TINYINT UNSIGNED GENERATED ALWAYS AS (IF(voided_at IS NULL, 1, NULL)) STORED,
  UNIQUE KEY uk_por (project_id, por_no, active_guard),
  KEY ix_po_supplier (supplier_id),
  KEY ix_po_item (budget_item_id),
  KEY ix_po_date (po_date),
  KEY ix_po_status (status),
  CONSTRAINT fk_po_project  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_po_item     FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_po_pl       FOREIGN KEY (planning_line_id) REFERENCES planning_lines(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- One row per disbursement against a PO (covers DP_MONITORING:
-- 30% DP -> 60% progress billing -> 10% completion).
CREATE TABLE po_payments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT UNSIGNED NOT NULL,
  paid_on           DATE         NULL,
  payment_type      ENUM('downpayment','progress','before_delivery','cod','completion','retention','other')
                    NOT NULL DEFAULT 'other',
  currency          CHAR(3)      NOT NULL DEFAULT 'PHP',
  amount            DECIMAL(18,4) NOT NULL,
  fx_rate           DECIMAL(12,6) NOT NULL DEFAULT 1,
  amount_php        DECIMAL(18,2) AS (ROUND(amount * fx_rate, 2)) STORED,
  pct_of_contract   DECIMAL(9,6)  NULL,             -- 0.3000 = 30%
  voucher_no        VARCHAR(64)   NULL,             -- 'RFPLAEX00157'
  remarks           VARCHAR(255)  NULL,
  created_by        VARCHAR(64)   NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  voided_at         TIMESTAMP    NULL,
  voided_by         VARCHAR(64)  NULL,
  void_reason       VARCHAR(255) NULL,
  KEY ix_pay_po (purchase_order_id),
  KEY ix_pay_date (paid_on),
  CONSTRAINT fk_pay_po FOREIGN KEY (purchase_order_id)
    REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Optional photo reference for a PO (e.g. the MSR document/label), since
-- msr_no is only ever captured as free text. Files live on disk under
-- server/uploads/purchase-orders/<po_id>/ -- this table is metadata only.
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


-- ---------------------------------------------------------------------
-- 2b. PO payment terms  (NEW -- milestone breakdown)
-- ---------------------------------------------------------------------
-- purchase_orders.payment_terms is free text and the source spells ~8 real
-- patterns 31 different ways: '30% DP, 60% PB, 10% RETENTION' vs
-- '30% DP, 60 PB, 10% Completion' vs '50%dp, 50%upon completion', and one
-- entry is a note rather than terms at all. Parsing that string at query time
-- is hopeless, so terms are decomposed into milestone rows here.
--
-- The UI must build terms from these rows -- never a free-text box. That kills
-- the 31-format problem permanently AND gives retention tracking for free.
CREATE TABLE po_payment_terms (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_order_id INT UNSIGNED NOT NULL,
  seq               TINYINT UNSIGNED NOT NULL,      -- 1, 2, 3...
  label             VARCHAR(80) NOT NULL,           -- 'DP', 'PB', 'RETENTION'
  pct               DECIMAL(9,6) NOT NULL,          -- 0.300000 = 30%
  kind              ENUM('downpayment','progress','before_delivery','upon_delivery',
                         'completion','retention','other') NOT NULL DEFAULT 'other',
  -- a holdback: cash withheld until completion/acceptance, not yet due
  is_holdback       TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uk_term (purchase_order_id, seq),
  KEY ix_term_kind (kind),
  CONSTRAINT fk_term_po FOREIGN KEY (purchase_order_id)
    REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. Non-PO spend — replenishments (petty cash) and cash advances
-- ---------------------------------------------------------------------

CREATE TABLE replenishments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id        INT UNSIGNED NOT NULL,
  txn_date          DATE         NULL,
  supplier_id       INT UNSIGNED NULL,
  planning_line_id  INT UNSIGNED NULL,
  budget_item_id    INT UNSIGNED NULL,
  item_description  VARCHAR(255) NULL,
  ref_no            VARCHAR(120) NULL,             -- 'SI#: 376572', 'OR#: 6521400'
  ref_type          ENUM('SI','CI','CSI','OR','BS','MSR','other') NULL,
  amount            DECIMAL(18,2) NOT NULL DEFAULT 0,
  batch_no          VARCHAR(64)  NULL,             -- replenishment batch / liquidation
  document_no       VARCHAR(64)  NULL,             -- groups split-JPL sibling rows
  -- flags rows the ETL could not confidently parse (bad dates, '-' amounts)
  needs_review      TINYINT(1)   NOT NULL DEFAULT 0,
  -- No auth yet (that's build step 7) -- created_by/updated_by are stamped
  -- from a fixed APP_USER env var until then. See audit_log below.
  created_by        VARCHAR(64)  NULL,
  updated_by        VARCHAR(64)  NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  voided_at         TIMESTAMP    NULL,
  voided_by         VARCHAR(64)  NULL,
  void_reason       VARCHAR(255) NULL,
  KEY ix_rep_date (txn_date),
  KEY ix_rep_pl (planning_line_id),
  KEY ix_rep_supplier (supplier_id),
  KEY ix_rep_review (needs_review),
  KEY ix_rep_doc (document_no),
  CONSTRAINT fk_rep_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_rep_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT fk_rep_pl FOREIGN KEY (planning_line_id) REFERENCES planning_lines(id) ON DELETE SET NULL,
  CONSTRAINT fk_rep_item FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE cash_advances (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id        INT UNSIGNED NOT NULL,
  txn_date          DATE         NULL,
  budget_item_id    INT UNSIGNED NULL,
  planning_line_id  INT UNSIGNED NULL,
  requested_by      VARCHAR(160) NULL,
  purpose           VARCHAR(255) NULL,          -- the sheet's DESCRIPTION
  amount            DECIMAL(18,2) NOT NULL DEFAULT 0,
  liquidated_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  status            ENUM('open','partially_liquidated','liquidated') NOT NULL DEFAULT 'open',
  -- Split charges: accounting confirmed one payment can hit several JPL codes
  -- (e.g. the Sika grout advance splits across 3.1.4.2 / 5.0 / 6.1).
  -- Each JPL gets its OWN ROW, and the rows share a document_no.
  document_no       VARCHAR(64) NULL,
  -- Free-text reference she assigns herself (the number on the physical
  -- voucher slip) -- not document_no, which is the internal split-JPL key.
  control_no        VARCHAR(64) NULL,
  -- Reference tying a 'liquidated'/'partially_liquidated' status back to the
  -- liquidation transaction that settled it -- distinct from control_no,
  -- which is the reference on the ORIGINAL advance request.
  liquidation_control_no VARCHAR(64) NULL,
  needs_review      TINYINT(1) NOT NULL DEFAULT 0,
  created_by        VARCHAR(64)  NULL,
  updated_by        VARCHAR(64)  NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  voided_at         TIMESTAMP    NULL,
  voided_by         VARCHAR(64)  NULL,
  void_reason       VARCHAR(255) NULL,
  KEY ix_ca_date (txn_date),
  KEY ix_ca_doc (document_no),
  KEY ix_ca_control (control_no),
  CONSTRAINT fk_ca_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_ca_item FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_ca_pl FOREIGN KEY (planning_line_id) REFERENCES planning_lines(id) ON DELETE SET NULL
) ENGINE=InnoDB;


-- ---------------------------------------------------------------------
-- 3b. Additional payments  (NEW -- from the ADDITIONAL_PAYMENT sheet)
-- ---------------------------------------------------------------------
-- Accounting: "additional expenses of the company, NOT an increase to
-- contract value." In practice these are landed-cost items on imported
-- equipment -- Bureau of Customs duties, freight, THC, marine insurance --
-- so they are project cost but never contract cost. They must appear in
-- disbursement totals and never in commitment totals.
CREATE TABLE additional_payments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id        INT UNSIGNED NOT NULL,
  txn_date          DATE         NULL,
  payee             VARCHAR(191) NOT NULL,       -- 'BUREAU OF CUSTOMS'
  supplier_id       INT UNSIGNED NULL,
  budget_item_id    INT UNSIGNED NULL,
  planning_line_id  INT UNSIGNED NULL,
  description       VARCHAR(255) NULL,
  voucher_no        VARCHAR(64)  NULL,           -- 'RFPLAEX00101'
  expense_type      ENUM('customs_duty','freight','terminal_handling','insurance',
                         'brokerage','other') NOT NULL DEFAULT 'other',
  currency          CHAR(3)      NOT NULL DEFAULT 'PHP',
  amount            DECIMAL(18,4) NOT NULL DEFAULT 0,
  fx_rate           DECIMAL(12,6) NOT NULL DEFAULT 1,
  amount_php        DECIMAL(18,2) AS (ROUND(amount * fx_rate, 2)) STORED,
  document_no       VARCHAR(64)  NULL,           -- groups split-JPL sibling rows
  needs_review      TINYINT(1)   NOT NULL DEFAULT 0,
  created_by        VARCHAR(64)  NULL,
  updated_by        VARCHAR(64)  NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  voided_at         TIMESTAMP    NULL,
  voided_by         VARCHAR(64)  NULL,
  void_reason       VARCHAR(255) NULL,
  KEY ix_ap_date (txn_date),
  KEY ix_ap_item (budget_item_id),
  KEY ix_ap_voucher (voucher_no),
  KEY ix_ap_doc (document_no),
  CONSTRAINT fk_ap_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_ap_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT fk_ap_item FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_ap_pl FOREIGN KEY (planning_line_id) REFERENCES planning_lines(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3c. Budget revisions  (NEW)
-- ---------------------------------------------------------------------
-- Accounting on the over-budget items: "the budget cost will be adjusted
-- accordingly... reflected as overspent due to the project's urgent timeline."
-- So budgets move. Never overwrite budget_items.revised_budget in place --
-- log the change here, or you lose the ability to explain any variance.
CREATE TABLE budget_revisions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id      INT UNSIGNED NOT NULL,
  budget_item_id  INT UNSIGNED NOT NULL,
  revision_no     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  effective_on    DATE NOT NULL,
  amount_before   DECIMAL(18,2) NOT NULL,
  amount_after    DECIMAL(18,2) NOT NULL,
  delta           DECIMAL(18,2) AS (amount_after - amount_before) STORED,
  reason          VARCHAR(255) NULL,
  approved_by     VARCHAR(160) NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rev (budget_item_id, revision_no),
  KEY ix_rev_date (effective_on),
  CONSTRAINT fk_rev_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_rev_item FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3d. Users  (NEW -- single local user, per accounting)
-- ---------------------------------------------------------------------
-- Deliberately minimal: no roles, no approval chain. The Project Coordinator
-- -> SVP -> CEO approval flow happens OUTSIDE this app; this is a monitoring
-- tool for one person. Store a bcrypt hash, never a password.
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,           -- bcrypt, cost >= 12
  full_name     VARCHAR(160) NULL,
  last_login_at TIMESTAMP NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3e. Audit log  (NEW -- required before any write endpoint)
-- ---------------------------------------------------------------------
-- These figures feed billing, so every insert/update to a write-enabled
-- table gets an append-only row here. Never UPDATE or DELETE from this
-- table -- that's enforced by convention (no route touches it that way),
-- not by a trigger.
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

-- ---------------------------------------------------------------------
-- 4. Payroll (labor cost)
-- ---------------------------------------------------------------------

CREATE TABLE payroll_periods (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id    INT UNSIGNED NOT NULL,
  label         VARCHAR(64) NOT NULL,              -- 'August 4-10, 2025'
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  status        ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
  total_amount  DECIMAL(18,2) NOT NULL DEFAULT 0,  -- denormalized cache
  created_by    VARCHAR(64) NULL,
  updated_by    VARCHAR(64) NULL,
  updated_at    TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_period (project_id, period_start, period_end),
  KEY ix_period_start (period_start),
  CONSTRAINT fk_pp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE workers (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_no   VARCHAR(32)  NULL,
  last_name     VARCHAR(80)  NOT NULL,
  first_name    VARCHAR(80)  NOT NULL,
  middle_name   VARCHAR(80)  NULL,
  full_name     VARCHAR(191) NOT NULL,             -- as it appears in source: 'ALFARO, MELVIN ORT...'
  position      VARCHAR(80)  NULL,                 -- MASON, HELPER, FOREMAN, STEELMAN...
  daily_rate    DECIMAL(10,2) NULL,
  hourly_rate   DECIMAL(10,4) NULL,
  date_hired    DATE NULL,
  -- Accounting: a payroll row with no JPL code means the worker has left.
  -- 6 people appear twice in the source grid as re-hires with non-overlapping
  -- stints; they are one person, so one row here.
  date_separated DATE NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_by    VARCHAR(64)  NULL,
  updated_by    VARCHAR(64)  NULL,
  updated_at    TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_worker_name (full_name),
  KEY ix_worker_position (position)
) ENGINE=InnoDB;

-- The pivoted "Payroll_with_JPL" grid, unpivoted: one row per
-- (worker, period). This is the table the dashboard aggregates.
CREATE TABLE payroll_entries (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id        INT UNSIGNED NOT NULL,
  payroll_period_id INT UNSIGNED NOT NULL,
  worker_id         INT UNSIGNED NOT NULL,
  planning_line_id  INT UNSIGNED NULL,             -- the per-week JPL charge code
  budget_item_id    INT UNSIGNED NULL,
  amount            DECIMAL(14,2) NOT NULL DEFAULT 0,   -- net pay charged to project
  created_by        VARCHAR(64) NULL,
  updated_by        VARCHAR(64) NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  -- "Delete" in the UI voids rather than deletes -- see
  -- db/migrations/012_void_columns.sql for why active_guard exists.
  voided_at         TIMESTAMP    NULL,
  voided_by         VARCHAR(64)  NULL,
  void_reason       VARCHAR(255) NULL,
  active_guard      TINYINT UNSIGNED GENERATED ALWAYS AS (IF(voided_at IS NULL, 1, NULL)) STORED,
  -- One worker CAN be charged to more than one planning line in a week,
  -- so the key includes the planning line. Verified: zero collisions in the
  -- source once re-hire rows are merged. active_guard means only one ACTIVE
  -- (non-voided) row per (period, worker, JPL) is enforced.
  UNIQUE KEY uk_entry (payroll_period_id, worker_id, planning_line_id, active_guard),
  KEY ix_pe_worker (worker_id),
  KEY ix_pe_pl (planning_line_id),
  KEY ix_pe_item (budget_item_id),
  CONSTRAINT fk_pe_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pe_period  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_pe_worker  FOREIGN KEY (worker_id) REFERENCES workers(id),
  CONSTRAINT fk_pe_pl      FOREIGN KEY (planning_line_id) REFERENCES planning_lines(id) ON DELETE SET NULL,
  CONSTRAINT fk_pe_item    FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Optional: the DTR / timekeeping breakdown behind each payroll entry.
-- Only populate this if you want the app to *compute* payroll rather
-- than just record the weekly total.
CREATE TABLE timekeeping_detail (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payroll_entry_id  INT UNSIGNED NOT NULL,
  work_date         DATE NULL,
  day_of_week       ENUM('Mon','Tue','Wed','Thu','Fri','Sat','Sun') NULL,
  regular_hours     DECIMAL(6,2) NOT NULL DEFAULT 0,
  ot_hours          DECIMAL(6,2) NOT NULL DEFAULT 0,
  night_diff_hours  DECIMAL(6,2) NOT NULL DEFAULT 0,
  late_undertime_hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  is_rest_day       TINYINT(1) NOT NULL DEFAULT 0,
  is_holiday        TINYINT(1) NOT NULL DEFAULT 0,
  KEY ix_tk_entry (payroll_entry_id),
  CONSTRAINT fk_tk_entry FOREIGN KEY (payroll_entry_id)
    REFERENCES payroll_entries(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. Weekly budget-addition log + remaining-cost estimates
-- ---------------------------------------------------------------------

CREATE TABLE weekly_budget_additions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id      INT UNSIGNED NOT NULL,
  week_label      VARCHAR(48) NOT NULL,            -- 'MAY 25-31, 2026'
  week_start      DATE NOT NULL,
  week_end        DATE NOT NULL,
  budget_item_id  INT UNSIGNED NULL,
  -- Position of the source block, left to right. Needed because four blocks
  -- in WEEKLY_ADDITIONAL_FOR_BUDGET_ are all labelled 'JULY 06-JULY 12, 2026'
  -- -- the author copied the block across without updating the header. They are
  -- four different weeks; which ones is not recoverable from the file.
  seq             SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  needs_review    TINYINT(1) NOT NULL DEFAULT 0,
  additional_po   DECIMAL(18,2) NOT NULL DEFAULT 0,
  replen          DECIMAL(18,2) NOT NULL DEFAULT 0,
  labor           DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount    DECIMAL(18,2) AS (additional_po + replen + labor) STORED,
  UNIQUE KEY uk_wba (project_id, week_start, budget_item_id, seq),
  KEY ix_wba_week (week_start),
  CONSTRAINT fk_wba_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_wba_item FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE remaining_cost_estimates (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id      INT UNSIGNED NOT NULL,
  budget_item_id  INT UNSIGNED NULL,
  title           VARCHAR(160) NOT NULL,           -- 'REMAINING COST - LAND DEVT'
  as_of_date      DATE NULL,
  total_amount    DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rce_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_rce_item FOREIGN KEY (budget_item_id) REFERENCES budget_items(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE remaining_cost_lines (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  estimate_id     INT UNSIGNED NOT NULL,
  item_no         VARCHAR(16) NULL,
  particulars     VARCHAR(255) NOT NULL,
  qty             DECIMAL(14,4) NOT NULL DEFAULT 0,
  uom             VARCHAR(24) NULL,                -- lot, liters, m3, bags
  unit_price      DECIMAL(14,4) NOT NULL DEFAULT 0,
  amount          DECIMAL(18,2) NOT NULL DEFAULT 0,
  actual_amount   DECIMAL(18,2) NULL,
  remarks         VARCHAR(255) NULL,
  KEY ix_rcl_est (estimate_id),
  CONSTRAINT fk_rcl_est FOREIGN KEY (estimate_id)
    REFERENCES remaining_cost_estimates(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6. Views — these ARE your dashboard endpoints
-- ---------------------------------------------------------------------

-- Disbursed PO amount per budget item. Excludes voided POs/payments (data
-- entry mistakes) but NOT cancelled POs -- cash already paid before a
-- cancellation still genuinely went out.
CREATE OR REPLACE VIEW v_po_paid_by_item AS
SELECT po.project_id, po.budget_item_id,
       SUM(pp.amount_php) AS paid_po_amount
FROM purchase_orders po
JOIN po_payments pp ON pp.purchase_order_id = po.id
WHERE po.voided_at IS NULL AND pp.voided_at IS NULL
GROUP BY po.project_id, po.budget_item_id;

CREATE OR REPLACE VIEW v_replen_by_item AS
SELECT project_id, budget_item_id, SUM(amount) AS replen_amount
FROM replenishments WHERE needs_review = 0 AND voided_at IS NULL
GROUP BY project_id, budget_item_id;

CREATE OR REPLACE VIEW v_labor_by_item AS
SELECT project_id, budget_item_id, SUM(amount) AS labor_cost
FROM payroll_entries WHERE voided_at IS NULL
GROUP BY project_id, budget_item_id;

CREATE OR REPLACE VIEW v_addl_by_item AS
SELECT project_id, budget_item_id, SUM(amount_php) AS additional_payment
FROM additional_payments WHERE needs_review = 0 AND voided_at IS NULL
GROUP BY project_id, budget_item_id;

CREATE OR REPLACE VIEW v_ca_by_item AS
SELECT project_id, budget_item_id, SUM(amount) AS cash_advanced
FROM cash_advances WHERE voided_at IS NULL
GROUP BY project_id, budget_item_id;

-- The SUMMARY sheet, rebuilt. This is the main dashboard table.
-- NOTE the two remaining columns. `remaining_vs_contract` is budget minus
-- COMMITMENT ("how much can I still award?"). `remaining_vs_disbursed` is
-- budget minus CASH OUT ("how much have I actually spent?"). The source sheet
-- only shows the first. Additional payments count as cash out but never as
-- commitment, because accounting confirmed they do not raise contract value.
CREATE OR REPLACE VIEW v_budget_vs_actual AS
SELECT
  bi.id                                AS budget_item_id,
  bi.project_id,
  bi.item_no,
  bi.description,
  bi.procurement_mode,
  bi.remarks,
  bi.revised_budget                    AS budget,
  bi.contract_amount                   AS contract_amount,
  COALESCE(l.labor_cost, 0)            AS labor_cost,
  COALESCE(c.cash_advanced, 0)         AS cash_advanced,
  COALESCE(p.paid_po_amount, 0)        AS paid_po_amount,
  COALESCE(r.replen_amount, 0)         AS replen_amount,
  COALESCE(a.additional_payment, 0)    AS additional_payment,
  COALESCE(p.paid_po_amount,0) + COALESCE(r.replen_amount,0)
    + COALESCE(c.cash_advanced,0) + COALESCE(l.labor_cost,0)
    + COALESCE(a.additional_payment,0)                        AS total_disbursed,
  bi.revised_budget - bi.contract_amount                      AS remaining_vs_contract,
  bi.revised_budget - (COALESCE(p.paid_po_amount,0) + COALESCE(r.replen_amount,0)
    + COALESCE(c.cash_advanced,0) + COALESCE(l.labor_cost,0)
    + COALESCE(a.additional_payment,0))                       AS remaining_vs_disbursed,
  CASE WHEN bi.revised_budget > 0
       THEN ROUND(bi.contract_amount / bi.revised_budget, 4) END AS commitment_ratio,
  CASE WHEN bi.contract_amount > bi.revised_budget THEN 1 ELSE 0 END AS is_over_budget,
  (SELECT COUNT(*) FROM budget_revisions br WHERE br.budget_item_id = bi.id) AS revision_count
FROM budget_items bi
LEFT JOIN v_po_paid_by_item p ON p.budget_item_id = bi.id
LEFT JOIN v_replen_by_item  r ON r.budget_item_id = bi.id
LEFT JOIN v_ca_by_item      c ON c.budget_item_id = bi.id
LEFT JOIN v_labor_by_item   l ON l.budget_item_id = bi.id
LEFT JOIN v_addl_by_item    a ON a.budget_item_id = bi.id;

-- All amounts are VAT-inclusive, so the VAT component is amount * 12/112.
-- Use this for BIR-style reporting; never add VAT on top of a stored amount.
CREATE OR REPLACE VIEW v_vat_component AS
SELECT bi.project_id, bi.item_no, bi.description,
       v.total_disbursed                                   AS gross_amount,
       ROUND(v.total_disbursed * 12 / 112, 2)              AS vat_component,
       ROUND(v.total_disbursed * 100 / 112, 2)             AS net_of_vat
FROM v_budget_vs_actual v JOIN budget_items bi ON bi.id = v.budget_item_id;

-- PO aging / outstanding balance
-- Voided POs are excluded entirely (a mistaken entry, never real). A
-- cancelled PO stays visible but shows balance_php = 0 -- nothing is
-- outstanding on a contract that won't be fulfilled.
CREATE OR REPLACE VIEW v_po_balance AS
SELECT po.id, po.project_id, po.por_no, po.po_date, s.name AS supplier,
       bi.item_no, bi.description AS budget_item,
       po.currency, po.contract_amount, po.fx_rate, po.contract_amount_php,
       COALESCE(SUM(pp.amount_php), 0) AS paid_php,
       CASE WHEN po.status = 'cancelled' THEN 0
            ELSE po.contract_amount_php - COALESCE(SUM(pp.amount_php), 0) END AS balance_php,
       CASE WHEN po.contract_amount_php > 0
            THEN ROUND(COALESCE(SUM(pp.amount_php),0) / po.contract_amount_php, 4)
       END AS pct_paid,
       po.payment_terms, po.status
FROM purchase_orders po
JOIN suppliers s ON s.id = po.supplier_id
LEFT JOIN budget_items bi ON bi.id = po.budget_item_id
LEFT JOIN po_payments pp ON pp.purchase_order_id = po.id AND pp.voided_at IS NULL
WHERE po.voided_at IS NULL
GROUP BY po.id, po.project_id, po.por_no, po.po_date, s.name, bi.item_no,
         bi.description, po.currency, po.contract_amount, po.fx_rate,
         po.contract_amount_php, po.payment_terms, po.status;

-- Retention exposure: what is contractually held back, and what has been
-- released. 'held' is only an entitlement until the milestone is reached, so
-- it is NOT a payable -- show it as a separate line, never inside a balance.
CREATE OR REPLACE VIEW v_po_retention AS
SELECT po.id, po.project_id, po.por_no, s.name AS supplier,
       bi.item_no, po.contract_amount_php,
       po.retention_pct,
       ROUND(po.contract_amount_php * COALESCE(po.retention_pct,0), 2) AS retention_amount,
       COALESCE(rel.released, 0)                                        AS retention_released,
       ROUND(po.contract_amount_php * COALESCE(po.retention_pct,0), 2)
         - COALESCE(rel.released, 0)                                    AS retention_outstanding
FROM purchase_orders po
JOIN suppliers s ON s.id = po.supplier_id
LEFT JOIN budget_items bi ON bi.id = po.budget_item_id
LEFT JOIN (SELECT purchase_order_id, SUM(amount_php) released
             FROM po_payments WHERE payment_type = 'retention' AND voided_at IS NULL
            GROUP BY purchase_order_id) rel
       ON rel.purchase_order_id = po.id
WHERE COALESCE(po.retention_pct, 0) > 0 AND po.voided_at IS NULL;

-- Weekly burn rate (the chart your PM will actually look at)
CREATE OR REPLACE VIEW v_weekly_burn AS
SELECT project_id, week_start, 'labor' AS bucket, SUM(labor) AS amount
  FROM weekly_budget_additions GROUP BY project_id, week_start
UNION ALL
SELECT project_id, week_start, 'replen', SUM(replen)
  FROM weekly_budget_additions GROUP BY project_id, week_start
UNION ALL
SELECT project_id, week_start, 'po', SUM(additional_po)
  FROM weekly_budget_additions GROUP BY project_id, week_start;

-- Spend rolled up by planning line (WBS drill-down). Mirrors the same
-- needs_review exclusion as v_replen_by_item/v_addl_by_item, and includes
-- all five disbursement sources (like v_budget_vs_actual.total_disbursed),
-- so a budget item's WBS subtree reconciles with its Overview total.
CREATE OR REPLACE VIEW v_planning_line_spend AS
SELECT pl.id AS planning_line_id, pl.project_id, pl.budget_item_id, pl.code, pl.description, pl.parent_id, pl.depth,
       pl.budget_amount, pl.is_active,
       COALESCE(rp.amt, 0) AS replen_amount,
       COALESCE(pa.amt, 0) AS po_paid_amount,
       COALESCE(ca.amt, 0) AS cash_advance_amount,
       COALESCE(ap.amt, 0) AS additional_payment_amount,
       COALESCE(pe.amt, 0) AS labor_amount,
       COALESCE(rp.amt,0) + COALESCE(pa.amt,0) + COALESCE(ca.amt,0)
         + COALESCE(ap.amt,0) + COALESCE(pe.amt,0)              AS total_spend
FROM planning_lines pl
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

-- ---------------------------------------------------------------------
-- 7. Seed
-- ---------------------------------------------------------------------

INSERT INTO projects (code, name, company, location, tin, total_budget, vat_inclusive, status)
VALUES
 ('PLAEX', 'Plaridel Extension', 'Royale Cold Storage North Inc.',
  'Bypass Rd., Brgy. Bulihan, Plaridel, Bulacan', '008-400-912-002',
  1333876003.00, 1, 'active'),
 -- Confirmed a SEPARATE project. Its two estimate sheets live in the payroll
 -- workbook only because they were pasted there.
 ('DSEXP', 'Dry Storage Expansion', 'Royale Cold Storage North Inc.',
  'Brgy. Unzad, Villasis, Pangasinan', '008-400-912-002',
  0.00, 1, 'planning');

-- FX rates are NOT constant -- accounting confirmed the rate applicable at
-- each payment date is used. These are the rates actually implied by the
-- FOREIGN_TO_PHP sheet, one per contract. Add a row per payment going forward.
INSERT INTO fx_rates (currency, rate_to_php, effective_on, note) VALUES
 ('USD', 61.570000, '2025-09-01', 'Civil Works contract'),
 ('USD', 59.554000, '2025-11-01', 'Refrigeration Equipment; Insulated Panels'),
 ('USD', 58.599000, '2026-01-01', 'Double deep racking'),
 ('USD', 57.554000, '2026-02-01', 'Plastic Pallets'),
 ('EUR', 72.480000, '2026-01-01', 'Insulated Panels EUR tranche');

-- Budgets per the SUMMARY sheet, which accounting confirmed is authoritative.
-- Item 6.0 is 94,895,712 (NOT the 100,599,695 in SUMMARY_REVISED_BUDGET).
INSERT INTO budget_items
  (project_id, item_no, sort_order, description, original_budget, revised_budget, contract_amount, procurement_mode, remarks)
VALUES
 (1,'1.0', 10,'Inauguration / Groundbreaking',              0,         0,    400684.56,'other','first job planning line'),
 (1,'2.0', 20,'Land Development',                    61769827,  61769827,  13157501.70,'inhouse','Inhouse'),
 (1,'3.0', 30,'Civil Works',                        385622172, 385622172, 233300113.56,'inhouse','Inhouse'),
 (1,'4.0', 40,'Refrigeration Equipment',            261000762, 261000762, 241736884.38,'po_awarded','PO Awarded'),
 (1,'5.0', 50,'Insulated Panels, Sectional Door, Dock Levelers & Accessories',
                                                    169057719, 169057719, 148864802.10,'bac_recommendation',NULL),
 (1,'6.0', 60,'Electrical & Communications Works',   94895712,  94895712,  79401718.25,'inhouse','Inhouse + materials'),
 (1,'7.0', 70,'PU Flooring, Coving and Zocalo',      26472095,  26472095,  26472099.92,'bac_recommendation','marginally over'),
 (1,'8.0', 80,'Water Distribution',                   5968924,   5968924,   3515724.80,'for_bidding',NULL),
 (1,'9.0', 90,'Office Equipment, Furniture & Fixtures',20859100, 20859100,  17805700.00,'for_bidding',NULL),
 (1,'10.0',100,'Plastic Pallets',                     59214734,  59214734,  59060383.86,'po_awarded','PO Awarded'),
 (1,'11.0',110,'Double Deep Racking System',          78780111,  78780111,  78287831.77,'po_awarded','PO Awarded'),
 (1,'12.0',120,'MHE',                                 17934000,  17934000,  17728320.00,'bac_recommendation',NULL),
 (1,'13.0',130,'Solar PV System',                     46200000,  46200000,         0.00,'third_party','Through Berde Renewables'),
 (1,'14.0',140,'Fire Protection',                     21470805,  21470805,  34661976.86,'for_bidding','OVER BUDGET - budget to be adjusted'),
 (1,'15.0',150,'WWTP',                                       0,         0,         0.00,'other','additional budget'),
 (1,'16.0',160,'Water Filtration System',                    0,         0,   4000000.00,'other','additional budget'),
 (1,'17.0',170,'Bollards',                             5497365,   5497365,   6534100.00,'for_bidding','OVER BUDGET - budget to be adjusted'),
 (1,'18.0',180,'Capex for Operations',                35000000,  35000000,         0.00,'other',NULL),
 (1,'19.0',190,'Interest During Construction',        44132677,  44132677,         0.00,'other',NULL),
 (1,'20.0',200,'Other Expenses',                             0,         0,         0.00,'other','vehicle PMS, laptops, misc admin');

-- NOTE: do NOT seed planning_lines here. Code '1.0' (Inauguration) already
-- comes from planning_lines.csv with its own id. A seed row here takes id=1,
-- which then collides with the CSV's own id=1 on the primary key AND with the
-- CSV's '1.0' row on uk_pl_code. LOAD DATA LOCAL treats duplicates as IGNORE,
-- so rows vanish silently and any transaction pointing at them is orphaned.
