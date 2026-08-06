const express = require('express');
const pool = require('../db');
const { recordAudit } = require('../lib/audit');

const router = express.Router();

const CODE_RE = /^\d+(\.\d+)*$/;

// The five tables with an FK to planning_lines.id. All ON DELETE SET NULL --
// checked here so a code can be renamed only while nothing has cited it yet.
const REFERENCING_TABLES = ['purchase_orders', 'replenishments', 'cash_advances', 'additional_payments', 'payroll_entries'];

async function hasTransactions(conn, planningLineId) {
  for (const table of REFERENCING_TABLES) {
    const [rows] = await conn.query(`SELECT 1 FROM ${table} WHERE planning_line_id = ? LIMIT 1`, [planningLineId]);
    if (rows.length > 0) return true;
  }
  return false;
}

// Mirrors etl_ods_to_csv.py's item_id_for_jpl()/depth rule exactly, so a
// line created through the UI resolves the same way the ETL always has.
async function deriveFromCode(conn, projectId, code) {
  const firstSegment = code.split('.')[0];
  const [rows] = await conn.query('SELECT id FROM budget_items WHERE project_id = ? AND item_no = ?', [
    projectId,
    `${firstSegment}.0`,
  ]);
  return {
    budgetItemId: rows.length > 0 ? rows[0].id : null,
    depth: code.split('.').length,
  };
}

// Returns every line, active or not -- callers that build a selectable
// picker (PlanningLinePicker) filter to is_active client-side, so a
// historical entry that already points at a since-deactivated code still
// renders its current value correctly instead of showing blank.
router.get('/:id/planning-lines', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, parent_id, depth, description, budget_item_id, is_active
       FROM planning_lines
       WHERE project_id = ?
       ORDER BY code`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/planning-lines', async (req, res, next) => {
  const projectId = req.params.id;
  const { code, description, budget_amount: budgetAmount } = req.body;

  if (!code || !CODE_RE.test(code)) {
    return res.status(400).json({ error: 'code must be digits and dots only, e.g. "3.2.5" -- no leading/trailing/double dots' });
  }

  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { budgetItemId, depth } = await deriveFromCode(conn, projectId, code);

    const [result] = await conn.query(
      `INSERT INTO planning_lines (project_id, budget_item_id, code, parent_id, depth, description, budget_amount, created_by)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
      [projectId, budgetItemId, code, depth, description || null, budgetAmount || null, appUser]
    );

    await recordAudit(conn, {
      table: 'planning_lines',
      rowId: result.insertId,
      action: 'insert',
      changedBy: appUser,
      after: { id: result.insertId, code, budget_item_id: budgetItemId, depth, description: description || null, budget_amount: budgetAmount || null },
    });

    await conn.commit();
    const [rows] = await pool.query('SELECT * FROM planning_lines WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await conn.rollback();
    if (err.errno === 1062) {
      return res.status(400).json({ error: 'This code already exists on this project.' });
    }
    next(err);
  } finally {
    conn.release();
  }
});

router.patch('/:id/planning-lines/:lineId', async (req, res, next) => {
  const projectId = req.params.id;
  const { lineId } = req.params;
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query('SELECT * FROM planning_lines WHERE id = ? FOR UPDATE', [lineId]);
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Planning line not found' });
    }
    const before = existingRows[0];

    const description = req.body.description !== undefined ? req.body.description || null : before.description;
    const budgetAmount = req.body.budget_amount !== undefined ? req.body.budget_amount || null : before.budget_amount;
    // Deactivating only ever affects picker visibility for new entries --
    // never data integrity -- so it carries none of the rename-lock's
    // restrictions and can be flipped regardless of whether this line
    // already has transactions.
    const isActive = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : before.is_active;

    let code = before.code;
    let budgetItemId = before.budget_item_id;
    let depth = before.depth;

    if (req.body.code !== undefined && req.body.code !== before.code) {
      if (!CODE_RE.test(req.body.code)) {
        await conn.rollback();
        return res.status(400).json({ error: 'code must be digits and dots only, e.g. "3.2.5" -- no leading/trailing/double dots' });
      }
      if (await hasTransactions(conn, lineId)) {
        await conn.rollback();
        return res.status(400).json({ error: 'This code has recorded transactions and can no longer be renamed.' });
      }
      code = req.body.code;
      ({ budgetItemId, depth } = await deriveFromCode(conn, projectId, code));
    }

    await conn.query(
      `UPDATE planning_lines SET code = ?, budget_item_id = ?, depth = ?, description = ?, budget_amount = ?, is_active = ?, updated_by = ?
       WHERE id = ?`,
      [code, budgetItemId, depth, description, budgetAmount, isActive, appUser, lineId]
    );

    await recordAudit(conn, {
      table: 'planning_lines',
      rowId: Number(lineId),
      action: 'update',
      changedBy: appUser,
      before,
      after: { ...before, code, budget_item_id: budgetItemId, depth, description, budget_amount: budgetAmount, is_active: isActive, updated_by: appUser },
    });

    await conn.commit();
    const [rows] = await pool.query('SELECT * FROM planning_lines WHERE id = ?', [lineId]);
    res.json(rows[0]);
  } catch (err) {
    await conn.rollback();
    if (err.errno === 1062) {
      return res.status(400).json({ error: 'This code already exists on this project.' });
    }
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
