const express = require('express');
const pool = require('../db');
const { recordAudit } = require('../lib/audit');
const { normalizeSupplierName } = require('../lib/normalizeSupplierName');

const router = express.Router();
const MAX_PAGE_SIZE = 200;

function mapDbError(err) {
  if (err.errno === 1062) {
    return { status: 400, message: 'A supplier with this name already exists.' };
  }
  return null;
}

// Not project-scoped -- suppliers has no project_id column.
router.get('/', async (req, res, next) => {
  try {
    const q = req.query.q || '';

    // Plain autocomplete mode (unchanged): bare array, top 20, active only.
    if (req.query.page === undefined) {
      const [rows] = await pool.query(
        `SELECT id, name, normalized_name, category, is_active
         FROM suppliers
         WHERE is_active = 1 AND (name LIKE ? OR normalized_name LIKE ?)
         ORDER BY name
         LIMIT 20`,
        [`%${q}%`, `%${q}%`]
      );
      return res.json(rows);
    }

    // Admin list mode: real pagination + filters.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || 50));

    const where = [];
    const params = [];
    if (q) {
      where.push('(name LIKE ? OR normalized_name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (req.query.is_active !== undefined) {
      where.push('is_active = ?');
      params.push(req.query.is_active === '1' ? 1 : 0);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM suppliers ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT id, name, normalized_name, tin, category, is_active, created_at, updated_at
       FROM suppliers
       ${whereSql}
       ORDER BY name
       LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ rows, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { name, tin } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  const normalizedName = normalizeSupplierName(name);
  if (!normalizedName) {
    return res.status(400).json({ error: 'name does not normalize to anything usable' });
  }

  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO suppliers (name, normalized_name, tin, is_active, created_by)
       VALUES (?, ?, ?, 1, ?)`,
      [String(name).trim(), normalizedName, tin || null, appUser]
    );

    await recordAudit(conn, {
      table: 'suppliers',
      rowId: result.insertId,
      action: 'insert',
      changedBy: appUser,
      after: { id: result.insertId, name: String(name).trim(), normalized_name: normalizedName, tin: tin || null, is_active: 1 },
    });

    await conn.commit();
    const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [result.insertId]);
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

router.patch('/:id', async (req, res, next) => {
  const { id } = req.params;
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query('SELECT * FROM suppliers WHERE id = ? FOR UPDATE', [id]);
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Supplier not found' });
    }
    const before = existingRows[0];

    const name = req.body.name !== undefined ? String(req.body.name).trim() : before.name;
    const tin = req.body.tin !== undefined ? req.body.tin || null : before.tin;
    const isActive = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : before.is_active;
    const normalizedName = name !== before.name ? normalizeSupplierName(name) : before.normalized_name;

    if (!name) {
      await conn.rollback();
      return res.status(400).json({ error: 'name is required' });
    }

    await conn.query(
      `UPDATE suppliers SET name = ?, normalized_name = ?, tin = ?, is_active = ?, updated_by = ?
       WHERE id = ?`,
      [name, normalizedName, tin, isActive, appUser, id]
    );

    await recordAudit(conn, {
      table: 'suppliers',
      rowId: Number(id),
      action: 'update',
      changedBy: appUser,
      before,
      after: { ...before, name, normalized_name: normalizedName, tin, is_active: isActive, updated_by: appUser },
    });

    await conn.commit();
    const [rows] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id]);
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
