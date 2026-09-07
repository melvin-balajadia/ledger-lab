const express = require('express');
const pool = require('../db');

const router = express.Router();

// ~99 rows per project; client builds the tree from parent_id.
router.get('/:id/wbs', async (req, res, next) => {
  try {
    const where = ['project_id = ?'];
    const params = [req.params.id];
    if (req.query.budget_item_id) {
      where.push('budget_item_id = ?');
      params.push(req.query.budget_item_id);
    }
    const [rows] = await pool.query(
      `SELECT * FROM v_planning_line_spend WHERE ${where.join(' AND ')} ORDER BY code`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Every transaction behind one JPL code's figures, so the Overview's JPL
// summary can be opened up without leaving the page.
//
// One UNION rather than five round-trips: the five disbursement sources have
// nothing in common but "date, reference, who, how much", and normalising
// them here keeps the client from having to know five row shapes. `kind`
// separates the commitment row (the PO award) from the cash-out rows -- they
// are never added together (CLAUDE.md rule #1), so the client totals them
// separately.
//
// Amounts stay DECIMAL strings; nothing is summed in Node. No pagination:
// the busiest single code holds a few hundred rows, and this is a drill-down
// the user opens one code at a time.
router.get('/:id/wbs/:planningLineId/transactions', async (req, res, next) => {
  try {
    // Six blocks, each filtered by the same (project, planning line) pair.
    const ids = [req.params.id, req.params.planningLineId];
    const params = [...ids, ...ids, ...ids, ...ids, ...ids, ...ids];

    const sql = `
      SELECT 'contract' AS kind, 'Contract (PO)' AS source, po.po_date AS txn_date,
             po.por_no AS reference, s.name AS party,
             po.item_description AS description, po.contract_amount_php AS amount,
             0 AS needs_review
        FROM purchase_orders po
        LEFT JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.project_id = ? AND po.planning_line_id = ? AND po.voided_at IS NULL

      UNION ALL
      SELECT 'disbursement', 'PO Paid', pp.paid_on,
             COALESCE(pp.voucher_no, po.por_no), s.name,
             CONCAT('PO ', po.por_no, ' — ', pp.payment_type), pp.amount_php, 0
        FROM po_payments pp
        JOIN purchase_orders po ON po.id = pp.purchase_order_id
        LEFT JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.project_id = ? AND po.planning_line_id = ?
         AND pp.voided_at IS NULL AND po.voided_at IS NULL

      UNION ALL
      SELECT 'disbursement', 'Replenishment', r.txn_date,
             COALESCE(r.ref_no, r.document_no), s.name,
             r.item_description, r.amount, r.needs_review
        FROM replenishments r
        LEFT JOIN suppliers s ON s.id = r.supplier_id
       WHERE r.project_id = ? AND r.planning_line_id = ? AND r.voided_at IS NULL

      UNION ALL
      SELECT 'disbursement', 'Cash Advance', ca.txn_date,
             COALESCE(ca.control_no, ca.document_no), ca.requested_by,
             ca.purpose, ca.amount, ca.needs_review
        FROM cash_advances ca
       WHERE ca.project_id = ? AND ca.planning_line_id = ? AND ca.voided_at IS NULL

      UNION ALL
      SELECT 'disbursement', 'Additional Payment', ap.txn_date,
             COALESCE(ap.voucher_no, ap.document_no), COALESCE(ap.payee, s.name),
             ap.description, ap.amount_php, ap.needs_review
        FROM additional_payments ap
        LEFT JOIN suppliers s ON s.id = ap.supplier_id
       WHERE ap.project_id = ? AND ap.planning_line_id = ? AND ap.voided_at IS NULL

      UNION ALL
      SELECT 'disbursement', 'Payroll', per.period_end,
             per.label, w.full_name, w.position, pe.amount, 0
        FROM payroll_entries pe
        LEFT JOIN payroll_periods per ON per.id = pe.payroll_period_id
        LEFT JOIN workers w ON w.id = pe.worker_id
       WHERE pe.project_id = ? AND pe.planning_line_id = ? AND pe.voided_at IS NULL

      ORDER BY txn_date, source, reference`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
