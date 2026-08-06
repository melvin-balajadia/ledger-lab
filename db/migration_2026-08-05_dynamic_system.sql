-- Schema-only migration: brings a database up to date with every structural
-- change made during the "Make the System Dynamic" work (Suppliers,
-- Workers, Payroll, JPL/WBS codes, budget item procurement details), plus
-- the inactive-JPL-code follow-up.
--
-- HOW TO USE:
--   1. Restore your original backup (the one WITHOUT any of this session's
--      test data) into a database first, exactly as it was.
--   2. Run this script against that restored database, ONCE:
--        mysql -u root -p rcsni_cost < migration_2026-08-05_dynamic_system.sql
--   3. That's it -- no data is touched, only table structure and two views.
--
-- Every statement here is additive (new nullable columns with safe
-- defaults) or a view replacement -- nothing here can drop or alter
-- existing data. Run it against a database that does NOT already have
-- these columns (a plain restore of the pre-session backup) -- MySQL has
-- no "add column if it doesn't already exist" syntax, so running this
-- twice against the same database will error on the second run (harmless:
-- it just means the columns are already there).
--
-- Verified end-to-end: reconstructed the exact pre-migration shape of all
-- six tables in a scratch database and ran this script against it, twice,
-- confirming it applies cleanly and produces the same column layout as the
-- live, migrated database (checked directly, not from memory).

-- ---------------------------------------------------------------------
-- Suppliers (Phase 1)
-- ---------------------------------------------------------------------
ALTER TABLE suppliers
  ADD COLUMN created_by VARCHAR(64) NULL AFTER is_active,
  ADD COLUMN updated_by VARCHAR(64) NULL AFTER created_by,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- ---------------------------------------------------------------------
-- Workers (Phase 2)
-- ---------------------------------------------------------------------
ALTER TABLE workers
  ADD COLUMN created_by VARCHAR(64) NULL AFTER is_active,
  ADD COLUMN updated_by VARCHAR(64) NULL AFTER created_by,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER updated_by;

-- ---------------------------------------------------------------------
-- Payroll periods + entries (Phase 3)
-- ---------------------------------------------------------------------
ALTER TABLE payroll_periods
  ADD COLUMN created_by VARCHAR(64) NULL AFTER total_amount,
  ADD COLUMN updated_by VARCHAR(64) NULL AFTER created_by,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER updated_by;

ALTER TABLE payroll_entries
  ADD COLUMN created_by VARCHAR(64) NULL AFTER amount,
  ADD COLUMN updated_by VARCHAR(64) NULL AFTER created_by,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- ---------------------------------------------------------------------
-- JPL / WBS codes (Phase 4 + inactive-code follow-up, merged into one
-- statement in final column order: budget_amount, is_active, created_by,
-- updated_by, updated_at)
-- ---------------------------------------------------------------------
ALTER TABLE planning_lines
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER budget_amount,
  ADD COLUMN created_by VARCHAR(64) NULL AFTER is_active,
  ADD COLUMN updated_by VARCHAR(64) NULL AFTER created_by,
  ADD COLUMN updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER updated_by;

-- ---------------------------------------------------------------------
-- Budget items -- procurement mode & remarks (Phase 5 sweep)
-- ---------------------------------------------------------------------
ALTER TABLE budget_items
  ADD COLUMN created_by VARCHAR(64) NULL AFTER remarks,
  ADD COLUMN updated_by VARCHAR(64) NULL AFTER created_by;

-- ---------------------------------------------------------------------
-- Views -- CREATE OR REPLACE is always safe, never touches underlying data
-- ---------------------------------------------------------------------
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
            WHERE needs_review = 0 GROUP BY planning_line_id) rp ON rp.planning_line_id = pl.id
LEFT JOIN (SELECT po.planning_line_id, SUM(pp.amount_php) amt
             FROM purchase_orders po JOIN po_payments pp ON pp.purchase_order_id = po.id
            GROUP BY po.planning_line_id) pa ON pa.planning_line_id = pl.id
LEFT JOIN (SELECT planning_line_id, SUM(amount) amt FROM cash_advances
            GROUP BY planning_line_id) ca ON ca.planning_line_id = pl.id
LEFT JOIN (SELECT planning_line_id, SUM(amount_php) amt FROM additional_payments
            WHERE needs_review = 0 GROUP BY planning_line_id) ap ON ap.planning_line_id = pl.id
LEFT JOIN (SELECT planning_line_id, SUM(amount) amt FROM payroll_entries
            GROUP BY planning_line_id) pe ON pe.planning_line_id = pl.id;

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
