const express = require('express');
const crypto = require('crypto');
const Decimal = require('decimal.js');
const pool = require('../db');
const { recordAudit } = require('../lib/audit');
const { isPositiveAmount } = require('../lib/money');

const router = express.Router();

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';
const MAX_PAGE_SIZE = 200;
const SORT_COLUMNS = { txn_date: 'r.txn_date', amount: 'r.amount' };

function validateLine(line) {
  const errors = [];
  if (!line.txn_date) {
    errors.push('txn_date is required');
  } else if (line.txn_date < PROJECT_DATE_MIN || line.txn_date > PROJECT_DATE_MAX) {
    errors.push(`txn_date must be between ${PROJECT_DATE_MIN} and ${PROJECT_DATE_MAX}`);
  }
  if (!isPositiveAmount(line.amount)) {
    errors.push('amount must be a positive number');
  }
  return errors;
}

// FK constraints catch a bad id outright, but not a valid planning_line_id
// that belongs to a different project -- that's an application-level check.
async function assertPlanningLinesBelongToProject(conn, projectId, planningLineIds) {
  const ids = [...new Set(planningLineIds.filter((id) => id != null))];
  if (ids.length === 0) return null;
  const [rows] = await conn.query(
    'SELECT id FROM planning_lines WHERE project_id = ? AND id IN (?)',
    [projectId, ids]
  );
  if (rows.length !== ids.length) {
    return 'one or more planning_line_id values do not belong to this project';
  }
  return null;
}

// Only enforced when a planning_line_id is newly being set/changed -- an
// existing row that already cites a since-deactivated code must stay
// editable for its other fields (never invalidate history).
async function assertPlanningLinesActive(conn, planningLineIds) {
  const ids = [...new Set(planningLineIds.filter((id) => id != null))];
  if (ids.length === 0) return null;
  const [rows] = await conn.query('SELECT id FROM planning_lines WHERE id IN (?) AND is_active = 0', [ids]);
  if (rows.length > 0) {
    return 'One or more JPL/WBS codes are inactive and cannot be used for new entries.';
  }
  return null;
}

function mapDbError(err) {
  if (err.errno === 1452) {
    return { status: 400, message: 'supplier_id or budget_item_id does not exist' };
  }
  return null;
}

router.get('/:id/replenishments', async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || 50));

    const where = ['r.project_id = ?'];
    const params = [projectId];

    if (req.query.needs_review !== undefined) {
      where.push('r.needs_review = ?');
      params.push(req.query.needs_review === '1' ? 1 : 0);
    }
    if (req.query.supplier_id) {
      where.push('r.supplier_id = ?');
      params.push(req.query.supplier_id);
    }
    if (req.query.planning_line_id) {
      where.push('r.planning_line_id = ?');
      params.push(req.query.planning_line_id);
    }
    if (req.query.date_from) {
      where.push('r.txn_date >= ?');
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      where.push('r.txn_date <= ?');
      params.push(req.query.date_to);
    }
    if (req.query.q) {
      where.push('(r.item_description LIKE ? OR r.ref_no LIKE ?)');
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    if (req.query.ref_type) {
      where.push('r.ref_type = ?');
      params.push(req.query.ref_type);
    }
    // Default view hides voided rows entirely (same as removing a
    // spreadsheet row); ?voided=1 is the "Deleted items" view instead.
    if (req.query.voided === '1') {
      where.push('r.voided_at IS NOT NULL');
    } else {
      where.push('r.voided_at IS NULL');
    }

    const whereSql = where.join(' AND ');

    // Never interpolate req.query.sortKey directly -- map through the
    // allowlist first so an arbitrary client string can't reach ORDER BY.
    const sortCol = SORT_COLUMNS[req.query.sortKey];
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
    // Default is creation order, not transaction date -- a row backdated to
    // catch up on paperwork would otherwise sort to the bottom the moment
    // it's entered. Explicit column sort (incl. by date) still works via sortKey.
    const orderSql = sortCol ? `${sortCol} ${sortDir}, r.id DESC` : 'r.id DESC';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM replenishments r WHERE ${whereSql}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT r.*, s.name AS supplier_name, pl.code AS planning_line_code, pl.description AS planning_line_description
       FROM replenishments r
       LEFT JOIN suppliers s ON s.id = r.supplier_id
       LEFT JOIN planning_lines pl ON pl.id = r.planning_line_id
       WHERE ${whereSql}
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ rows, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/replenishments', async (req, res, next) => {
  const projectId = req.params.id;
  const { lines, document_no: bodyDocumentNo, total_amount } = req.body;

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'lines must be a non-empty array' });
  }

  const lineErrors = lines.flatMap((line, i) => validateLine(line).map((e) => `lines[${i}]: ${e}`));
  if (lineErrors.length > 0) {
    return res.status(400).json({ error: lineErrors });
  }

  if (total_amount !== undefined) {
    const totalDecimal = toDecimalOrNull(total_amount);
    if (totalDecimal === null) {
      return res.status(400).json({ error: 'total_amount must be a number' });
    }
    const sum = lines.reduce((acc, l) => acc.plus(l.amount), new Decimal(0));
    if (!sum.equals(totalDecimal)) {
      return res.status(400).json({
        error: `lines sum to ${sum.toFixed(2)}, which does not match total_amount ${total_amount}`,
      });
    }
  }

  const documentNo = lines.length > 1 ? bodyDocumentNo || `SPLIT-${crypto.randomUUID()}` : bodyDocumentNo || null;
  const appUser = req.session.username;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const planningLineErr = await assertPlanningLinesBelongToProject(
      conn,
      projectId,
      lines.map((l) => l.planning_line_id)
    );
    if (planningLineErr) {
      await conn.rollback();
      return res.status(400).json({ error: planningLineErr });
    }
    const activeErr = await assertPlanningLinesActive(conn, lines.map((l) => l.planning_line_id));
    if (activeErr) {
      await conn.rollback();
      return res.status(400).json({ error: activeErr });
    }

    const insertedIds = [];
    for (const line of lines) {
      const [result] = await conn.query(
        `INSERT INTO replenishments
           (project_id, txn_date, supplier_id, planning_line_id, budget_item_id,
            item_description, ref_no, ref_type, amount, document_no, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          line.txn_date,
          line.supplier_id || null,
          line.planning_line_id || null,
          line.budget_item_id || null,
          line.item_description || null,
          line.ref_no || null,
          line.ref_type || null,
          line.amount,
          documentNo,
          appUser,
        ]
      );
      insertedIds.push(result.insertId);
      await recordAudit(conn, {
        table: 'replenishments',
        rowId: result.insertId,
        action: 'insert',
        changedBy: appUser,
        after: { ...line, id: result.insertId, project_id: projectId, document_no: documentNo, created_by: appUser },
      });
    }

    await conn.commit();
    const [rows] = await pool.query('SELECT * FROM replenishments WHERE id IN (?)', [insertedIds]);
    res.status(201).json(rows);
  } catch (err) {
    await conn.rollback();
    const mapped = mapDbError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.message });
    next(err);
  } finally {
    conn.release();
  }
});

router.patch('/:id/replenishments/:repId', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query(
      'SELECT * FROM replenishments WHERE id = ? AND project_id = ?',
      [req.params.repId, req.params.id]
    );
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }
    const before = existingRows[0];

    const editable = [
      'txn_date', 'supplier_id', 'planning_line_id', 'budget_item_id',
      'item_description', 'ref_no', 'ref_type', 'amount', 'document_no', 'needs_review',
    ];
    const merged = { ...before };
    for (const field of editable) {
      if (req.body[field] !== undefined) merged[field] = req.body[field];
    }

    const errors = validateLine(merged);
    if (errors.length > 0) {
      await conn.rollback();
      return res.status(400).json({ error: errors });
    }

    // Both checks only apply when planning_line_id is actually being
    // set/changed -- an existing row that already cites a code from a data
    // anomaly, or one since deactivated, must stay editable for its other
    // fields (never invalidate history).
    if (req.body.planning_line_id !== undefined && Number(req.body.planning_line_id) !== Number(before.planning_line_id)) {
      const planningLineErr = await assertPlanningLinesBelongToProject(conn, before.project_id, [merged.planning_line_id]);
      if (planningLineErr) {
        await conn.rollback();
        return res.status(400).json({ error: planningLineErr });
      }
      const activeErr = await assertPlanningLinesActive(conn, [merged.planning_line_id]);
      if (activeErr) {
        await conn.rollback();
        return res.status(400).json({ error: activeErr });
      }
    }

    const appUser = req.session.username;
    await conn.query(
      `UPDATE replenishments SET
         txn_date = ?, supplier_id = ?, planning_line_id = ?, budget_item_id = ?,
         item_description = ?, ref_no = ?, ref_type = ?, amount = ?, document_no = ?,
         needs_review = ?, updated_by = ?
       WHERE id = ?`,
      [
        merged.txn_date, merged.supplier_id, merged.planning_line_id, merged.budget_item_id,
        merged.item_description, merged.ref_no, merged.ref_type, merged.amount, merged.document_no,
        merged.needs_review, appUser, req.params.repId,
      ]
    );
    await recordAudit(conn, {
      table: 'replenishments',
      rowId: Number(req.params.repId),
      action: 'update',
      changedBy: appUser,
      before,
      after: merged,
    });

    await conn.commit();
    const [rows] = await pool.query('SELECT * FROM replenishments WHERE id = ?', [req.params.repId]);
    res.json(rows[0]);
  } catch (err) {
    await conn.rollback();
    const mapped = mapDbError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.message });
    next(err);
  } finally {
    conn.release();
  }
});

// "Delete" voids rather than deletes -- the row disappears from every list
// and total exactly like removing a spreadsheet row, but stays restorable.
router.delete('/:id/replenishments/:repId', async (req, res, next) => {
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM replenishments WHERE id = ? AND project_id = ? AND voided_at IS NULL FOR UPDATE',
      [req.params.repId, req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }

    await conn.query(
      'UPDATE replenishments SET voided_at = NOW(), voided_by = ?, void_reason = ? WHERE id = ?',
      [appUser, req.body?.reason || null, req.params.repId]
    );
    await recordAudit(conn, {
      table: 'replenishments',
      rowId: Number(req.params.repId),
      action: 'update',
      changedBy: appUser,
      before: rows[0],
      after: { ...rows[0], voided_at: new Date(), voided_by: appUser, void_reason: req.body?.reason || null },
    });

    await conn.commit();
    res.status(204).end();
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

router.post('/:id/replenishments/:repId/restore', async (req, res, next) => {
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM replenishments WHERE id = ? AND project_id = ? AND voided_at IS NOT NULL FOR UPDATE',
      [req.params.repId, req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found, or not currently voided' });
    }

    await conn.query(
      'UPDATE replenishments SET voided_at = NULL, voided_by = NULL, void_reason = NULL WHERE id = ?',
      [req.params.repId]
    );
    await recordAudit(conn, {
      table: 'replenishments',
      rowId: Number(req.params.repId),
      action: 'update',
      changedBy: appUser,
      before: rows[0],
      after: { ...rows[0], voided_at: null, voided_by: null, void_reason: null },
    });

    await conn.commit();
    const [restored] = await pool.query('SELECT * FROM replenishments WHERE id = ?', [req.params.repId]);
    res.json(restored[0]);
  } catch (err) {
    await conn.rollback();
    const mapped = mapDbError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.message });
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
