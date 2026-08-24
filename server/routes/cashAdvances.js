const express = require('express');
const crypto = require('crypto');
const Decimal = require('decimal.js');
const pool = require('../db');
const { recordAudit } = require('../lib/audit');
const { toDecimalOrNull, isPositiveAmount } = require('../lib/money');
const { resolvePlanningLineIdsWithDescendants } = require('../lib/planningLines');

const router = express.Router();

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';
const STATUSES = ['open', 'partially_liquidated', 'liquidated'];
const LIQUIDATION_REQUIRED_STATUSES = ['liquidated', 'partially_liquidated'];
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
  if (line.status && !STATUSES.includes(line.status)) {
    errors.push(`status must be one of ${STATUSES.join(', ')}`);
  }
  if (
    LIQUIDATION_REQUIRED_STATUSES.includes(line.status) &&
    !String(line.liquidation_control_no ?? '').trim()
  ) {
    errors.push('liquidation_control_no is required when status is liquidated or partially liquidated');
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

// budget_item_id is never taken from the client -- planning_lines.budget_item_id
// ("resolved from the code's first segment", see schema.sql) is the only
// source of truth, so a JPL code and its budget item can never drift apart
// regardless of what a caller sends. Same helper as payroll.js; the drift it
// prevents is exactly what db/migrations/019 had to repair.
async function resolveBudgetItemId(conn, planningLineId) {
  if (planningLineId == null) return null;
  const [rows] = await conn.query('SELECT budget_item_id FROM planning_lines WHERE id = ?', [planningLineId]);
  return rows[0]?.budget_item_id ?? null;
}

function mapDbError(err) {
  if (err.errno === 1452) {
    return { status: 400, message: 'budget_item_id does not exist' };
  }
  return null;
}

router.get('/:id/cash-advances', async (req, res, next) => {
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
    if (req.query.status) {
      where.push('r.status = ?');
      params.push(req.query.status);
    }
    if (req.query.planning_line_id) {
      // Includes descendant JPL codes -- selecting "3.0" should also match
      // rows tagged "3.1", "3.8.4", etc., not just an exact "3.0" tag.
      const planningLineIds = await resolvePlanningLineIdsWithDescendants(
        pool, projectId, req.query.planning_line_id
      );
      where.push('r.planning_line_id IN (?)');
      params.push(planningLineIds);
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
      where.push('(r.purpose LIKE ? OR r.requested_by LIKE ? OR r.control_no LIKE ?)');
      params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`);
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

    // One aggregate query covers both the pagination total and the summary
    // tiles above the table -- same WHERE as the list itself, so the numbers
    // always match what's currently filtered/visible.
    const [[summaryRow]] = await pool.query(
      `SELECT COUNT(*) AS row_count,
              COALESCE(SUM(r.amount), 0) AS total_amount,
              COALESCE(SUM(r.liquidated_amount), 0) AS total_liquidated,
              COALESCE(SUM(r.amount - r.liquidated_amount), 0) AS outstanding_amount,
              SUM(CASE WHEN r.needs_review = 1 THEN 1 ELSE 0 END) AS needs_review_count
       FROM cash_advances r WHERE ${whereSql}`,
      params
    );
    const total = summaryRow.row_count;
    // budget_item_id resolves to a real label (item_no + description);
    // planning_line descriptions are all blank in the source (CLAUDE.md), so
    // JPL codes are grouped underneath by their raw code only.
    const [byBudgetItem] = await pool.query(
      `SELECT r.budget_item_id, bi.item_no AS budget_item_no, bi.description AS budget_item_description,
              r.planning_line_id, pl.code AS planning_line_code,
              COALESCE(SUM(r.amount), 0) AS total
       FROM cash_advances r
       LEFT JOIN budget_items bi ON bi.id = r.budget_item_id
       LEFT JOIN planning_lines pl ON pl.id = r.planning_line_id
       WHERE ${whereSql}
       GROUP BY r.budget_item_id, bi.item_no, bi.description, r.planning_line_id, pl.code
       ORDER BY total DESC`,
      params
    );
    const summary = {
      row_count: summaryRow.row_count,
      total_amount: summaryRow.total_amount,
      total_liquidated: summaryRow.total_liquidated,
      outstanding_amount: summaryRow.outstanding_amount,
      needs_review_count: Number(summaryRow.needs_review_count),
      by_budget_item: byBudgetItem,
    };
    const [rows] = await pool.query(
      `SELECT r.*, pl.code AS planning_line_code, pl.description AS planning_line_description
       FROM cash_advances r
       LEFT JOIN planning_lines pl ON pl.id = r.planning_line_id
       WHERE ${whereSql}
       ORDER BY ${orderSql}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ rows, page, pageSize, total, summary });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cash-advances', async (req, res, next) => {
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
        `INSERT INTO cash_advances
           (project_id, txn_date, planning_line_id, budget_item_id,
            requested_by, purpose, amount, document_no, control_no, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          line.txn_date,
          line.planning_line_id || null,
          await resolveBudgetItemId(conn, line.planning_line_id || null),
          line.requested_by || null,
          line.purpose || null,
          line.amount,
          documentNo,
          line.control_no || null,
          appUser,
        ]
      );
      insertedIds.push(result.insertId);
      await recordAudit(conn, {
        table: 'cash_advances',
        rowId: result.insertId,
        action: 'insert',
        changedBy: appUser,
        after: { ...line, id: result.insertId, project_id: projectId, document_no: documentNo, created_by: appUser },
      });
    }

    await conn.commit();
    const [rows] = await pool.query('SELECT * FROM cash_advances WHERE id IN (?)', [insertedIds]);
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

router.patch('/:id/cash-advances/:caId', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query(
      'SELECT * FROM cash_advances WHERE id = ? AND project_id = ?',
      [req.params.caId, req.params.id]
    );
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }
    const before = existingRows[0];

    // budget_item_id is deliberately NOT editable -- it is derived from
    // planning_line_id below, never accepted from the client.
    const editable = [
      'txn_date', 'planning_line_id', 'requested_by', 'purpose',
      'amount', 'liquidated_amount', 'status', 'document_no', 'control_no',
      'liquidation_control_no', 'needs_review',
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
    merged.budget_item_id = await resolveBudgetItemId(conn, merged.planning_line_id);
    await conn.query(
      `UPDATE cash_advances SET
         txn_date = ?, planning_line_id = ?, budget_item_id = ?, requested_by = ?, purpose = ?,
         amount = ?, liquidated_amount = ?, status = ?, document_no = ?, control_no = ?,
         liquidation_control_no = ?, needs_review = ?, updated_by = ?
       WHERE id = ?`,
      [
        merged.txn_date, merged.planning_line_id, merged.budget_item_id, merged.requested_by, merged.purpose,
        merged.amount, merged.liquidated_amount, merged.status, merged.document_no, merged.control_no,
        merged.liquidation_control_no, merged.needs_review, appUser, req.params.caId,
      ]
    );
    await recordAudit(conn, {
      table: 'cash_advances',
      rowId: Number(req.params.caId),
      action: 'update',
      changedBy: appUser,
      before,
      after: merged,
    });

    await conn.commit();
    const [rows] = await pool.query('SELECT * FROM cash_advances WHERE id = ?', [req.params.caId]);
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
router.delete('/:id/cash-advances/:caId', async (req, res, next) => {
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM cash_advances WHERE id = ? AND project_id = ? AND voided_at IS NULL FOR UPDATE',
      [req.params.caId, req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }

    await conn.query(
      'UPDATE cash_advances SET voided_at = NOW(), voided_by = ?, void_reason = ? WHERE id = ?',
      [appUser, req.body?.reason || null, req.params.caId]
    );
    await recordAudit(conn, {
      table: 'cash_advances',
      rowId: Number(req.params.caId),
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

router.post('/:id/cash-advances/:caId/restore', async (req, res, next) => {
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM cash_advances WHERE id = ? AND project_id = ? AND voided_at IS NOT NULL FOR UPDATE',
      [req.params.caId, req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found, or not currently voided' });
    }

    await conn.query(
      'UPDATE cash_advances SET voided_at = NULL, voided_by = NULL, void_reason = NULL WHERE id = ?',
      [req.params.caId]
    );
    await recordAudit(conn, {
      table: 'cash_advances',
      rowId: Number(req.params.caId),
      action: 'update',
      changedBy: appUser,
      before: rows[0],
      after: { ...rows[0], voided_at: null, voided_by: null, void_reason: null },
    });

    await conn.commit();
    const [restored] = await pool.query('SELECT * FROM cash_advances WHERE id = ?', [req.params.caId]);
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
