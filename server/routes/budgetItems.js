const express = require('express');
const Decimal = require('decimal.js');
const pool = require('../db');
const { recordAudit } = require('../lib/audit');

const router = express.Router();

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';
const PROCUREMENT_MODES = ['inhouse', 'po_awarded', 'for_bidding', 'bac_recommendation', 'third_party', 'other'];

async function loadDetail(conn, budgetItemId, projectId) {
  const [rows] = await conn.query(
    'SELECT * FROM v_budget_vs_actual WHERE budget_item_id = ? AND project_id = ?',
    [budgetItemId, projectId]
  );
  if (rows.length === 0) return null;

  const [revisions] = await conn.query(
    'SELECT * FROM budget_revisions WHERE budget_item_id = ? ORDER BY revision_no',
    [budgetItemId]
  );
  return { ...rows[0], revisions };
}

router.get('/:id/budget-items/:budgetItemId', async (req, res, next) => {
  try {
    const detail = await loadDetail(pool, req.params.budgetItemId, req.params.id);
    if (!detail) return res.status(404).json({ error: 'not found' });
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/budget-items/:budgetItemId/revisions', async (req, res, next) => {
  const { effective_on, amount_after, reason, approved_by } = req.body;

  const errors = [];
  if (!effective_on) errors.push('effective_on is required');
  else if (effective_on < PROJECT_DATE_MIN || effective_on > PROJECT_DATE_MAX) {
    errors.push(`effective_on must be between ${PROJECT_DATE_MIN} and ${PROJECT_DATE_MAX}`);
  }
  if (amount_after === undefined || !new Decimal(amount_after).gt(0)) {
    errors.push('amount_after must be a positive number');
  }
  if (errors.length > 0) return res.status(400).json({ error: errors });

  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [itemRows] = await conn.query(
      'SELECT revised_budget FROM budget_items WHERE id = ? AND project_id = ?',
      [req.params.budgetItemId, req.params.id]
    );
    if (itemRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }
    const amountBefore = itemRows[0].revised_budget;

    const [[{ nextNo }]] = await conn.query(
      'SELECT COALESCE(MAX(revision_no), 0) + 1 AS nextNo FROM budget_revisions WHERE budget_item_id = ?',
      [req.params.budgetItemId]
    );

    const [result] = await conn.query(
      `INSERT INTO budget_revisions
         (project_id, budget_item_id, revision_no, effective_on, amount_before, amount_after, reason, approved_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, req.params.budgetItemId, nextNo, effective_on, amountBefore, amount_after, reason || null, approved_by || null]
    );

    await conn.query('UPDATE budget_items SET revised_budget = ? WHERE id = ?', [amount_after, req.params.budgetItemId]);

    await recordAudit(conn, {
      table: 'budget_revisions',
      rowId: result.insertId,
      action: 'insert',
      changedBy: appUser,
      after: {
        project_id: Number(req.params.id), budget_item_id: Number(req.params.budgetItemId),
        revision_no: nextNo, effective_on, amount_before: amountBefore, amount_after, reason, approved_by,
      },
    });

    await conn.commit();
    const detail = await loadDetail(pool, req.params.budgetItemId, req.params.id);
    res.status(201).json(detail);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

router.patch('/:id/budget-items/:budgetItemId', async (req, res, next) => {
  const { budgetItemId } = req.params;
  const appUser = req.session.username;

  if (req.body.procurement_mode !== undefined && !PROCUREMENT_MODES.includes(req.body.procurement_mode)) {
    return res.status(400).json({ error: `procurement_mode must be one of: ${PROCUREMENT_MODES.join(', ')}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query('SELECT * FROM budget_items WHERE id = ? AND project_id = ? FOR UPDATE', [
      budgetItemId,
      req.params.id,
    ]);
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }
    const before = existingRows[0];

    const procurementMode = req.body.procurement_mode !== undefined ? req.body.procurement_mode : before.procurement_mode;
    const remarks = req.body.remarks !== undefined ? req.body.remarks || null : before.remarks;

    await conn.query('UPDATE budget_items SET procurement_mode = ?, remarks = ?, updated_by = ? WHERE id = ?', [
      procurementMode,
      remarks,
      appUser,
      budgetItemId,
    ]);

    await recordAudit(conn, {
      table: 'budget_items',
      rowId: Number(budgetItemId),
      action: 'update',
      changedBy: appUser,
      before,
      after: { ...before, procurement_mode: procurementMode, remarks, updated_by: appUser },
    });

    await conn.commit();
    const detail = await loadDetail(pool, budgetItemId, req.params.id);
    res.json(detail);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
