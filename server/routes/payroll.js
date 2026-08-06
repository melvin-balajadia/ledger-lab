const express = require('express');
const pool = require('../db');
const { recordAudit } = require('../lib/audit');

const router = express.Router();

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function formatPeriodLabel(startStr, endStr) {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const sMonth = MONTHS[start.getUTCMonth()];
  const eMonth = MONTHS[end.getUTCMonth()];
  const year = end.getUTCFullYear();
  if (sMonth === eMonth) {
    return `${sMonth} ${start.getUTCDate()}-${end.getUTCDate()}, ${year}`;
  }
  return `${sMonth} ${start.getUTCDate()} - ${eMonth} ${end.getUTCDate()}, ${year}`;
}

// Next Monday on/after `from` (inclusive if `from` is itself a Monday).
function nextMonday(from) {
  const d = new Date(from);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const delta = (8 - day) % 7;
  return addDays(d, delta);
}

function mapDbError(err) {
  if (err.errno === 1062) {
    return { status: 400, message: 'This worker is already charged to that JPL code in this period.' };
  }
  if (err.errno === 1452) {
    return { status: 400, message: 'worker_id or planning_line_id does not exist' };
  }
  return null;
}

async function assertPlanningLineBelongsToProject(conn, projectId, planningLineId) {
  if (planningLineId == null) return null;
  const [rows] = await conn.query('SELECT id FROM planning_lines WHERE project_id = ? AND id = ?', [
    projectId,
    planningLineId,
  ]);
  if (rows.length === 0) return 'planning_line_id does not belong to this project';
  return null;
}

// Only enforced when a planning_line_id is newly being set/changed -- an
// existing entry that already cites a since-deactivated code must stay
// editable for its other fields (never invalidate history).
async function assertPlanningLineIsActive(conn, planningLineId) {
  if (planningLineId == null) return null;
  const [rows] = await conn.query('SELECT is_active FROM planning_lines WHERE id = ?', [planningLineId]);
  if (rows.length > 0 && rows[0].is_active === 0) {
    return 'This JPL/WBS code is inactive and cannot be used for new entries.';
  }
  return null;
}

// budget_item_id is never taken from the client -- planning_lines.budget_item_id
// ("resolved from the code's first segment", see schema.sql) is the only
// source of truth, so a JPL code and its budget item can never drift apart
// regardless of what a caller sends.
async function resolveBudgetItemId(conn, planningLineId) {
  if (planningLineId == null) return null;
  const [rows] = await conn.query('SELECT budget_item_id FROM planning_lines WHERE id = ?', [planningLineId]);
  return rows[0]?.budget_item_id ?? null;
}

const MAX_PAGE_SIZE = 200;
// Only these exact keys are allowed onto ORDER BY -- never interpolate
// req.query.sortKey directly into SQL.
const SORT_COLUMNS = {
  period_start: 'period_start',
  control_total: 'control_total',
  extracted_total: 'extracted_total',
  delta: 'delta',
};

// reconciliation_status has to be a real computed column (not a JS .map()
// after the fact) so it can be filtered and paginated in the same query --
// otherwise LIMIT would cut the page before the status of the remaining
// rows is even known. Shared by the list and single-period handlers.
const PERIODS_DERIVED_SQL = `
  SELECT pp.id, pp.label, pp.period_start, pp.period_end, pp.status,
         pp.total_amount AS control_total,
         COALESCE(SUM(pe.amount), 0) AS extracted_total,
         pp.total_amount - COALESCE(SUM(pe.amount), 0) AS delta,
         COUNT(pe.id) AS entry_count,
         CASE
           WHEN COUNT(pe.id) = 0 AND pp.total_amount > 0 THEN 'no_entries'
           WHEN pp.total_amount = 0 AND COUNT(pe.id) > 0 THEN 'no_control'
           WHEN ABS(pp.total_amount - COALESCE(SUM(pe.amount), 0)) > 0.01 THEN 'review'
           ELSE 'ok'
         END AS reconciliation_status
  FROM payroll_periods pp
  LEFT JOIN payroll_entries pe ON pe.payroll_period_id = pp.id AND pe.voided_at IS NULL
  WHERE pp.project_id = ?
  GROUP BY pp.id, pp.label, pp.period_start, pp.period_end, pp.status, pp.total_amount
`;

router.get('/:id/payroll-periods', async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const derived = PERIODS_DERIVED_SQL;

    const where = ['1=1'];
    const params = [];
    if (req.query.q) {
      where.push('label LIKE ?');
      params.push(`%${req.query.q}%`);
    }
    if (req.query.date_from) {
      where.push('period_start >= ?');
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      where.push('period_start <= ?');
      params.push(req.query.date_to);
    }
    if (req.query.workflow_status) {
      where.push('status = ?');
      params.push(req.query.workflow_status);
    }
    // 'attention' is a sentinel, not a real reconciliation_status value --
    // it's the compound "anything but ok" the Payroll page's segmented
    // All/Needs-attention toggle sends; an exact status from the filter
    // bar's own select (if present) takes precedence over it.
    if (req.query.reconciliation_status === 'attention') {
      where.push("reconciliation_status != 'ok'");
    } else if (req.query.reconciliation_status) {
      where.push('reconciliation_status = ?');
      params.push(req.query.reconciliation_status);
    }
    const whereSql = where.join(' AND ');

    const sortCol = SORT_COLUMNS[req.query.sortKey];
    const sortDir = req.query.sortDir === 'desc' ? 'DESC' : 'ASC';
    const orderSql = sortCol ? `${sortCol} ${sortDir}` : 'period_start ASC';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM (${derived}) t WHERE ${whereSql}`,
      [projectId, ...params]
    );
    const [rows] = await pool.query(
      `SELECT * FROM (${derived}) t WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      [projectId, ...params, pageSize, (page - 1) * pageSize]
    );

    res.json({ rows, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

// Registered before the generic /:periodId route below, or "next-suggestion"
// would itself be matched as a periodId.
router.get('/:id/payroll-periods/next-suggestion', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT period_end FROM payroll_periods WHERE project_id = ? ORDER BY period_start DESC LIMIT 1',
      [req.params.id]
    );

    const periodStart = rows.length > 0 ? addDays(rows[0].period_end, 1) : nextMonday(new Date());
    const periodEnd = addDays(periodStart, 6);
    const startStr = toDateStr(periodStart);
    const endStr = toDateStr(periodEnd);

    res.json({ period_start: startStr, period_end: endStr, label: formatPeriodLabel(startStr, endStr) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payroll-periods', async (req, res, next) => {
  const projectId = req.params.id;
  const { label, period_start: periodStart, period_end: periodEnd, total_amount: totalAmount } = req.body;

  if (!label || !periodStart || !periodEnd) {
    return res.status(400).json({ error: 'label, period_start and period_end are required' });
  }
  if (periodStart > periodEnd) {
    return res.status(400).json({ error: 'period_start must be on or before period_end' });
  }

  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO payroll_periods (project_id, label, period_start, period_end, status, total_amount, created_by)
       VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
      [projectId, label, periodStart, periodEnd, totalAmount || 0, appUser]
    );

    await recordAudit(conn, {
      table: 'payroll_periods',
      rowId: result.insertId,
      action: 'insert',
      changedBy: appUser,
      after: { id: result.insertId, label, period_start: periodStart, period_end: periodEnd, status: 'draft', total_amount: totalAmount || 0 },
    });

    await conn.commit();
    const [rows] = await pool.query(`SELECT * FROM (${PERIODS_DERIVED_SQL}) t WHERE id = ?`, [projectId, result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    await conn.rollback();
    if (err.errno === 1062) {
      return res.status(400).json({ error: 'A period with these exact dates already exists.' });
    }
    next(err);
  } finally {
    conn.release();
  }
});

router.patch('/:id/payroll-periods/:periodId', async (req, res, next) => {
  const { periodId } = req.params;
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query('SELECT * FROM payroll_periods WHERE id = ? FOR UPDATE', [periodId]);
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll period not found' });
    }
    const before = existingRows[0];

    const label = req.body.label !== undefined ? req.body.label : before.label;
    const periodStart = req.body.period_start !== undefined ? req.body.period_start : before.period_start;
    const periodEnd = req.body.period_end !== undefined ? req.body.period_end : before.period_end;
    const totalAmount = req.body.total_amount !== undefined ? req.body.total_amount : before.total_amount;
    const status = req.body.status !== undefined ? req.body.status : before.status;

    if (!label || !periodStart || !periodEnd) {
      await conn.rollback();
      return res.status(400).json({ error: 'label, period_start and period_end are required' });
    }

    await conn.query(
      `UPDATE payroll_periods SET label = ?, period_start = ?, period_end = ?, total_amount = ?, status = ?, updated_by = ?
       WHERE id = ?`,
      [label, periodStart, periodEnd, totalAmount, status, appUser, periodId]
    );

    await recordAudit(conn, {
      table: 'payroll_periods',
      rowId: Number(periodId),
      action: 'update',
      changedBy: appUser,
      before,
      after: { ...before, label, period_start: periodStart, period_end: periodEnd, total_amount: totalAmount, status, updated_by: appUser },
    });

    await conn.commit();
    const [rows] = await pool.query(`SELECT * FROM (${PERIODS_DERIVED_SQL}) t WHERE id = ?`, [req.params.id, periodId]);
    res.json(rows[0]);
  } catch (err) {
    await conn.rollback();
    if (err.errno === 1062) {
      return res.status(400).json({ error: 'A period with these exact dates already exists.' });
    }
    next(err);
  } finally {
    conn.release();
  }
});

// Skip past any empty gap weeks -- "copy the roster from last period" means
// the last period that actually had one, not the literal chronologically-
// previous row if that happens to be a blank week. Shared by the preview
// endpoint (so the button can be labeled before she clicks) and the POST's
// own fallback when no explicit source_period_id is given.
async function findAutoSourcePeriod(conn, projectId, periodId, periodStart) {
  const [rows] = await conn.query(
    `SELECT pp.id, pp.label, pp.period_start, pp.period_end,
            (SELECT COUNT(*) FROM payroll_entries pe WHERE pe.payroll_period_id = pp.id AND pe.voided_at IS NULL) AS entry_count
     FROM payroll_periods pp
     WHERE pp.project_id = ? AND pp.id != ? AND pp.period_start < ?
       AND EXISTS (SELECT 1 FROM payroll_entries pe WHERE pe.payroll_period_id = pp.id AND pe.voided_at IS NULL)
     ORDER BY pp.period_start DESC LIMIT 1`,
    [projectId, periodId, periodStart]
  );
  return rows[0] ?? null;
}

// Read-only preview so the client can label the "Copy roster" button with
// the actual period it would copy from (or show none found) before she
// clicks, instead of finding out only after a failed attempt.
router.get('/:id/payroll-periods/:periodId/copy-roster-source', async (req, res, next) => {
  try {
    const [periodRows] = await pool.query(
      'SELECT id, period_start FROM payroll_periods WHERE id = ? AND project_id = ?',
      [req.params.periodId, req.params.id]
    );
    if (periodRows.length === 0) return res.status(404).json({ error: 'Payroll period not found' });

    const source = await findAutoSourcePeriod(pool, req.params.id, req.params.periodId, periodRows[0].period_start);
    res.json({ source });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payroll-periods/:periodId/copy-roster', async (req, res, next) => {
  const projectId = req.params.id;
  const { periodId } = req.params;
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [periodRows] = await conn.query(
      'SELECT id, period_start FROM payroll_periods WHERE id = ? AND project_id = ? FOR UPDATE',
      [periodId, projectId]
    );
    if (periodRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll period not found' });
    }

    let sourcePeriodId;
    if (req.body.source_period_id) {
      // She picked a specific period from the "change source" list instead
      // of the auto-detected one -- validate it belongs to this project,
      // isn't itself, and actually has entries to copy.
      const [chosenRows] = await conn.query(
        `SELECT pp.id FROM payroll_periods pp
         WHERE pp.id = ? AND pp.project_id = ? AND pp.id != ?
           AND EXISTS (SELECT 1 FROM payroll_entries pe WHERE pe.payroll_period_id = pp.id AND pe.voided_at IS NULL)`,
        [req.body.source_period_id, projectId, periodId]
      );
      if (chosenRows.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'That period is not a valid roster source.' });
      }
      sourcePeriodId = chosenRows[0].id;
    } else {
      const auto = await findAutoSourcePeriod(conn, projectId, periodId, periodRows[0].period_start);
      if (!auto) {
        await conn.rollback();
        return res.status(400).json({ error: 'No earlier period with a roster to copy from.' });
      }
      sourcePeriodId = auto.id;
    }

    // A code deactivated since the source period was populated shouldn't be
    // used for a new entry either -- excluded here rather than counted as
    // "skipped" (that label means "already on this period", a different
    // reason). Rare enough in practice not to need its own separate count.
    const [sourceEntries] = await conn.query(
      `SELECT pe.worker_id, pe.planning_line_id, pe.budget_item_id
       FROM payroll_entries pe
       LEFT JOIN planning_lines pl ON pl.id = pe.planning_line_id
       WHERE pe.payroll_period_id = ? AND pe.voided_at IS NULL
         AND (pe.planning_line_id IS NULL OR pl.is_active = 1)`,
      [sourcePeriodId]
    );

    // Additive, not a full replace -- a worker/JPL pair already on this
    // period is left exactly as-is (whatever amount was already entered),
    // never overwritten or duplicated. Only fills in what's missing. A
    // voided entry doesn't count as "already there" -- she removed it, so
    // copy-roster should be free to bring it back.
    const [existingEntries] = await conn.query(
      'SELECT worker_id, planning_line_id FROM payroll_entries WHERE payroll_period_id = ? AND voided_at IS NULL',
      [periodId]
    );
    const existingKeys = new Set(existingEntries.map((e) => `${e.worker_id}:${e.planning_line_id}`));

    let inserted = 0;
    let skipped = 0;
    for (const entry of sourceEntries) {
      if (existingKeys.has(`${entry.worker_id}:${entry.planning_line_id}`)) {
        skipped += 1;
        continue;
      }
      const [result] = await conn.query(
        `INSERT INTO payroll_entries (project_id, payroll_period_id, worker_id, planning_line_id, budget_item_id, amount, created_by)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [projectId, periodId, entry.worker_id, entry.planning_line_id, entry.budget_item_id, appUser]
      );
      inserted += 1;
      await recordAudit(conn, {
        table: 'payroll_entries',
        rowId: result.insertId,
        action: 'insert',
        changedBy: appUser,
        after: { id: result.insertId, payroll_period_id: Number(periodId), worker_id: entry.worker_id, planning_line_id: entry.planning_line_id, amount: '0.00', copied_from_period_id: sourcePeriodId },
      });
    }

    await conn.commit();
    res.status(201).json({ copied_from_period_id: sourcePeriodId, entries_copied: inserted, entries_skipped: skipped });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

router.get('/:id/payroll-periods/:periodId', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM (${PERIODS_DERIVED_SQL}) t WHERE id = ?`,
      [req.params.id, req.params.periodId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/payroll-periods/:periodId/entries', async (req, res, next) => {
  try {
    const [periodRows] = await pool.query(
      'SELECT id FROM payroll_periods WHERE id = ? AND project_id = ?',
      [req.params.periodId, req.params.id]
    );
    if (periodRows.length === 0) return res.status(404).json({ error: 'not found' });

    // Default view hides voided entries entirely; ?voided=1 is the
    // "Deleted items" view instead.
    const voidedFilter = req.query.voided === '1' ? 'pe.voided_at IS NOT NULL' : 'pe.voided_at IS NULL';
    const [rows] = await pool.query(
      `SELECT pe.id, pe.worker_id, w.full_name AS worker_name, w.position,
              pe.planning_line_id, pl.code AS planning_line_code,
              pe.budget_item_id, bi.item_no AS budget_item_no, bi.description AS budget_item_description,
              pe.amount, pe.void_reason
       FROM payroll_entries pe
       JOIN workers w ON w.id = pe.worker_id
       LEFT JOIN planning_lines pl ON pl.id = pe.planning_line_id
       LEFT JOIN budget_items bi ON bi.id = pe.budget_item_id
       WHERE pe.payroll_period_id = ? AND ${voidedFilter}
       ORDER BY w.full_name`,
      [req.params.periodId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payroll-periods/:periodId/entries', async (req, res, next) => {
  const projectId = req.params.id;
  const { periodId } = req.params;
  const { worker_id: workerId, planning_line_id: planningLineId, amount } = req.body;

  if (!workerId || amount === undefined || amount === null) {
    return res.status(400).json({ error: 'worker_id and amount are required' });
  }

  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [periodRows] = await conn.query('SELECT id FROM payroll_periods WHERE id = ? AND project_id = ?', [
      periodId,
      projectId,
    ]);
    if (periodRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll period not found' });
    }

    const planningLineErr = await assertPlanningLineBelongsToProject(conn, projectId, planningLineId);
    if (planningLineErr) {
      await conn.rollback();
      return res.status(400).json({ error: planningLineErr });
    }
    const activeErr = await assertPlanningLineIsActive(conn, planningLineId);
    if (activeErr) {
      await conn.rollback();
      return res.status(400).json({ error: activeErr });
    }
    const budgetItemId = await resolveBudgetItemId(conn, planningLineId);

    const [result] = await conn.query(
      `INSERT INTO payroll_entries (project_id, payroll_period_id, worker_id, planning_line_id, budget_item_id, amount, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [projectId, periodId, workerId, planningLineId || null, budgetItemId || null, amount, appUser]
    );

    await recordAudit(conn, {
      table: 'payroll_entries',
      rowId: result.insertId,
      action: 'insert',
      changedBy: appUser,
      after: { id: result.insertId, payroll_period_id: Number(periodId), worker_id: workerId, planning_line_id: planningLineId || null, amount },
    });

    await conn.commit();
    const [rows] = await pool.query(
      `SELECT pe.id, pe.worker_id, w.full_name AS worker_name, w.position,
              pe.planning_line_id, pl.code AS planning_line_code, pe.budget_item_id, pe.amount
       FROM payroll_entries pe
       JOIN workers w ON w.id = pe.worker_id
       LEFT JOIN planning_lines pl ON pl.id = pe.planning_line_id
       WHERE pe.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    await conn.rollback();
    const mapped = mapDbError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.message });
    next(err);
  } finally {
    conn.release();
  }
});

router.patch('/:id/payroll-periods/:periodId/entries/:entryId', async (req, res, next) => {
  const projectId = req.params.id;
  const { entryId } = req.params;
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query('SELECT * FROM payroll_entries WHERE id = ? FOR UPDATE', [entryId]);
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Entry not found' });
    }
    const before = existingRows[0];

    const planningLineId = req.body.planning_line_id !== undefined ? req.body.planning_line_id : before.planning_line_id;
    const amount = req.body.amount !== undefined ? req.body.amount : before.amount;

    const planningLineErr = await assertPlanningLineBelongsToProject(conn, projectId, planningLineId);
    if (planningLineErr) {
      await conn.rollback();
      return res.status(400).json({ error: planningLineErr });
    }
    if (req.body.planning_line_id !== undefined && Number(req.body.planning_line_id) !== Number(before.planning_line_id)) {
      const activeErr = await assertPlanningLineIsActive(conn, planningLineId);
      if (activeErr) {
        await conn.rollback();
        return res.status(400).json({ error: activeErr });
      }
    }

    const budgetItemId = await resolveBudgetItemId(conn, planningLineId);

    await conn.query(
      `UPDATE payroll_entries SET planning_line_id = ?, budget_item_id = ?, amount = ?, updated_by = ?
       WHERE id = ?`,
      [planningLineId || null, budgetItemId, amount, appUser, entryId]
    );

    await recordAudit(conn, {
      table: 'payroll_entries',
      rowId: Number(entryId),
      action: 'update',
      changedBy: appUser,
      before,
      after: { ...before, planning_line_id: planningLineId, budget_item_id: budgetItemId, amount, updated_by: appUser },
    });

    await conn.commit();
    const [rows] = await pool.query(
      `SELECT pe.id, pe.worker_id, w.full_name AS worker_name, w.position,
              pe.planning_line_id, pl.code AS planning_line_code, pe.budget_item_id, pe.amount
       FROM payroll_entries pe
       JOIN workers w ON w.id = pe.worker_id
       LEFT JOIN planning_lines pl ON pl.id = pe.planning_line_id
       WHERE pe.id = ?`,
      [entryId]
    );
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

// Voids rather than deletes -- the entry disappears from the period's total
// exactly like removing it from the spreadsheet, but stays restorable.
router.delete('/:id/payroll-periods/:periodId/entries/:entryId', async (req, res, next) => {
  const { entryId } = req.params;
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query(
      'SELECT * FROM payroll_entries WHERE id = ? AND voided_at IS NULL FOR UPDATE',
      [entryId]
    );
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Entry not found' });
    }

    await conn.query(
      'UPDATE payroll_entries SET voided_at = NOW(), voided_by = ?, void_reason = ? WHERE id = ?',
      [appUser, req.body?.reason || null, entryId]
    );
    await recordAudit(conn, {
      table: 'payroll_entries',
      rowId: Number(entryId),
      action: 'update',
      changedBy: appUser,
      before: existingRows[0],
      after: { ...existingRows[0], voided_at: new Date(), voided_by: appUser, void_reason: req.body?.reason || null },
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

router.post('/:id/payroll-periods/:periodId/entries/:entryId/restore', async (req, res, next) => {
  const { entryId } = req.params;
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query(
      'SELECT * FROM payroll_entries WHERE id = ? AND voided_at IS NOT NULL FOR UPDATE',
      [entryId]
    );
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found, or not currently voided' });
    }

    await conn.query(
      'UPDATE payroll_entries SET voided_at = NULL, voided_by = NULL, void_reason = NULL WHERE id = ?',
      [entryId]
    );
    await recordAudit(conn, {
      table: 'payroll_entries',
      rowId: Number(entryId),
      action: 'update',
      changedBy: appUser,
      before: existingRows[0],
      after: { ...existingRows[0], voided_at: null, voided_by: null, void_reason: null },
    });

    await conn.commit();
    const [rows] = await pool.query(
      `SELECT pe.id, pe.worker_id, w.full_name AS worker_name, w.position,
              pe.planning_line_id, pl.code AS planning_line_code, pe.budget_item_id, pe.amount
       FROM payroll_entries pe
       JOIN workers w ON w.id = pe.worker_id
       LEFT JOIN planning_lines pl ON pl.id = pe.planning_line_id
       WHERE pe.id = ?`,
      [entryId]
    );
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

module.exports = router;
