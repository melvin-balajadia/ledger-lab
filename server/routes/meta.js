const express = require('express');
const pool = require('../db');

const router = express.Router();

// The only ENUM columns meant to drive UI pickers. Keeps this endpoint from
// being used to probe arbitrary schema info, and keeps the enum-conversion
// decision (see docs/superpowers/specs) explicit: these stay ENUMs, this
// endpoint just stops the frontend from hand-duplicating their values.
const ALLOWED = new Set([
  'replenishments.ref_type',
  'po_payments.payment_type',
  'additional_payments.expense_type',
  'po_payment_terms.kind',
  'budget_items.procurement_mode',
]);

router.get('/enum-values', async (req, res, next) => {
  try {
    const { table, column } = req.query;
    if (!table || !column || !ALLOWED.has(`${table}.${column}`)) {
      return res.status(400).json({ error: 'Unknown or disallowed table/column' });
    }

    const [rows] = await pool.query(
      `SELECT COLUMN_TYPE AS columnType FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Column not found' });
    }

    const match = rows[0].columnType.match(/^enum\((.*)\)$/i);
    if (!match) {
      return res.status(400).json({ error: 'Column is not an ENUM' });
    }
    const values = match[1].split(',').map((v) => v.trim().replace(/^'(.*)'$/, '$1').replace(/''/g, "'"));

    res.json({ values });
  } catch (err) {
    next(err);
  }
});

// Historical rates for foreign-currency POs/payments -- a lookup the
// frontend suggests a default from, not something it trusts blindly, since
// the actual settlement rate is confirmed against the bank at payment time
// (see CLAUDE.md: FX rates vary per payment).
router.get('/fx-rates', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT currency, rate_to_php, effective_on, note FROM fx_rates ORDER BY currency, effective_on'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
