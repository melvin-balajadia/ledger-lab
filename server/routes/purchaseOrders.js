const express = require('express');
const fs = require('fs');
const path = require('path');
const Decimal = require('decimal.js');
const pool = require('../db');
const { recordAudit } = require('../lib/audit');
const { upload, poUploadDir } = require('../lib/poAttachmentStorage');
const { toDecimalOrNull, isPositiveAmount } = require('../lib/money');

const router = express.Router();

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';
const MILESTONE_KINDS = [
  'downpayment', 'progress', 'before_delivery', 'upon_delivery', 'completion', 'retention', 'other',
];
const PAYMENT_TYPES = ['downpayment', 'progress', 'before_delivery', 'cod', 'completion', 'retention', 'other'];
// Matches the currencies actually seeded in fx_rates (see schema.sql) --
// the rate itself floats per payment, but the set of currencies the
// business contracts in is fixed.
const CURRENCIES = ['PHP', 'USD', 'EUR'];

// A non-PHP currency needs its own fx_rate -- silently defaulting to 1
// would misprice the PHP-equivalent columns every downstream view sums on.
function validateCurrencyAndFxRate(currency, fxRate, errors) {
  if (currency && !CURRENCIES.includes(currency)) {
    errors.push(`currency must be one of ${CURRENCIES.join(', ')}`);
  }
  if (currency && currency !== 'PHP' && !isPositiveAmount(fxRate)) {
    errors.push('fx_rate must be a positive number when currency is not PHP');
  }
}
const MAX_PAGE_SIZE = 200;
const SORT_COLUMNS = {
  por_no: 'v.por_no',
  contract_amount_php: 'v.contract_amount_php',
  paid_php: 'v.paid_php',
  balance_php: 'v.balance_php',
};

function validateDateInWindow(date, fieldName) {
  if (!date) return [`${fieldName} is required`];
  if (date < PROJECT_DATE_MIN || date > PROJECT_DATE_MAX) {
    return [`${fieldName} must be between ${PROJECT_DATE_MIN} and ${PROJECT_DATE_MAX}`];
  }
  return [];
}

// Shared by create and edit -- same rules either way: must sum to exactly
// 100%, every milestone needs a label/pct, and a holdback must be a
// minority tail (e.g. "100% Upon Completion" is due-at-end, not retention).
function validateMilestones(milestones) {
  const errors = [];
  if (!Array.isArray(milestones) || milestones.length === 0) {
    errors.push('milestones must be a non-empty array');
    return errors;
  }

  // Parse every pct defensively first -- decimal.js throws synchronously on
  // an unparseable value, so nothing below may construct `new Decimal(m.pct)`
  // directly; a milestone with a bad pct is flagged below and sums as 0.
  const parsed = milestones.map((m) => toDecimalOrNull(m.pct));

  milestones.forEach((m, i) => {
    if (!m.label) errors.push(`milestones[${i}].label is required`);
    if (parsed[i] === null || !parsed[i].gt(0)) {
      errors.push(`milestones[${i}].pct must be a positive number`);
    }
    if (m.kind && !MILESTONE_KINDS.includes(m.kind)) {
      errors.push(`milestones[${i}].kind must be one of ${MILESTONE_KINDS.join(', ')}`);
    }
  });

  const pcts = parsed.map((d) => d ?? new Decimal(0));
  const sum = pcts.reduce((acc, d) => acc.plus(d), new Decimal(0));
  if (!sum.equals(1)) {
    errors.push(`milestone percentages sum to ${sum.times(100).toFixed(2)}%, must sum to exactly 100%`);
  }

  // Holdback must be a MINORITY of the whole schedule -- checked as a total
  // across every holdback-flagged row, not each row in isolation (three
  // milestones at 40/30/30 with the last two flagged holdback sum to 60%
  // retention, which used to pass since neither row was individually >=50%).
  const holdbackSum = milestones.reduce((acc, m, i) => (m.is_holdback ? acc.plus(pcts[i]) : acc), new Decimal(0));
  if (holdbackSum.gte(0.5)) {
    errors.push(
      `holdback milestones total ${holdbackSum.times(100).toFixed(1)}% of the schedule -- ` +
      `a holdback must be a minority tail, not a majority (e.g. "100% Upon Completion" is not retention)`
    );
  }

  return errors;
}

// retention_pct and the free-text payment_terms column are both derived
// from the milestone rows -- recomputed the same way on create and edit.
function deriveFromMilestones(milestones) {
  const retentionPct = milestones
    .filter((m) => m.is_holdback)
    .reduce((acc, m) => acc.plus(m.pct), new Decimal(0));
  const paymentTermsText = milestones
    .map((m) => `${new Decimal(m.pct).times(100).toFixed(0)}% ${m.label}`)
    .join(', ');
  return { retentionPct, paymentTermsText };
}

function mapDbError(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return { status: 400, message: 'a purchase order with this PO number already exists for this project' };
  }
  if (err.errno === 1452) {
    return { status: 400, message: 'supplier_id or planning_line_id does not exist' };
  }
  return null;
}

// Shared by payment create, void, and restore -- any of the three can move
// total paid across the fully_paid/partially_paid/open boundary. Never
// overrides a manually cancelled PO. Voided payments don't count as paid.
async function recomputePoStatus(conn, poId) {
  const [poRows] = await conn.query('SELECT status, contract_amount_php FROM purchase_orders WHERE id = ?', [poId]);
  if (poRows.length === 0 || poRows[0].status === 'cancelled') return;

  const [[{ totalPaid }]] = await conn.query(
    'SELECT COALESCE(SUM(amount_php), 0) AS totalPaid FROM po_payments WHERE purchase_order_id = ? AND voided_at IS NULL',
    [poId]
  );
  const contractPhp = new Decimal(poRows[0].contract_amount_php);
  const paidPhp = new Decimal(totalPaid);
  let status = 'open';
  if (contractPhp.gt(0) && paidPhp.gte(contractPhp)) status = 'fully_paid';
  else if (paidPhp.gt(0)) status = 'partially_paid';
  await conn.query('UPDATE purchase_orders SET status = ? WHERE id = ?', [status, poId]);
}

// v_po_balance has no supplier_id/budget_item_id/item_description/remarks --
// join purchase_orders back in for those (filters + detail need them).
const BASE_SELECT = `
  SELECT v.*, po.supplier_id, po.budget_item_id, po.planning_line_id, po.msr_no,
         po.item_description, po.ref_no, po.remarks, po.retention_pct
  FROM v_po_balance v
  JOIN purchase_orders po ON po.id = v.id
`;

// Registered before the generic /:poId route below, or "voided" would
// itself be matched as a poId (same pitfall as payroll's next-suggestion
// route). Direct query, not BASE_SELECT -- v_po_balance excludes voided
// rows entirely, so the "Deleted items" view needs its own simple lookup.
router.get('/:id/purchase-orders/voided', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT po.id, po.por_no, po.po_date, s.name AS supplier, po.contract_amount_php,
              po.voided_at, po.voided_by, po.void_reason
       FROM purchase_orders po
       JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.project_id = ? AND po.voided_at IS NOT NULL
       ORDER BY po.voided_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/purchase-orders', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || 50));

    const where = ['v.project_id = ?'];
    const params = [req.params.id];

    if (req.query.supplier_id) {
      where.push('po.supplier_id = ?');
      params.push(req.query.supplier_id);
    }
    if (req.query.budget_item_id) {
      where.push('po.budget_item_id = ?');
      params.push(req.query.budget_item_id);
    }
    if (req.query.status) {
      where.push('v.status = ?');
      params.push(req.query.status);
    }
    if (req.query.date_from) {
      where.push('v.po_date >= ?');
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      where.push('v.po_date <= ?');
      params.push(req.query.date_to);
    }
    if (req.query.q) {
      where.push('(v.por_no LIKE ? OR po.item_description LIKE ?)');
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    // balance_php is computed live by v_po_balance -- the stored status column
    // can go stale as payments are added, so "outstanding" filters on balance
    // directly rather than trusting status.
    if (req.query.outstanding === '1') {
      where.push('v.balance_php > 0');
    }

    const whereSql = where.join(' AND ');

    // Never interpolate req.query.sortKey directly -- map through the
    // allowlist first so an arbitrary client string can't reach ORDER BY.
    const sortCol = SORT_COLUMNS[req.query.sortKey];
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
    // Default is creation order, not PO date -- a PO backdated to catch up
    // on paperwork would otherwise sort to the bottom the moment it's
    // entered. Explicit column sort (incl. by PO date) still works via sortKey.
    const orderSql = sortCol ? `${sortCol} ${sortDir}, v.id DESC` : 'v.id DESC';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM v_po_balance v JOIN purchase_orders po ON po.id = v.id WHERE ${whereSql}`,
      params
    );
    const [rows] = await pool.query(
      `${BASE_SELECT} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    res.json({ rows, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/purchase-orders/:poId', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `${BASE_SELECT} WHERE v.id = ? AND v.project_id = ?`,
      [req.params.poId, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });

    const [milestones] = await pool.query(
      'SELECT * FROM po_payment_terms WHERE purchase_order_id = ? ORDER BY seq',
      [req.params.poId]
    );
    const [payments] = await pool.query(
      'SELECT * FROM po_payments WHERE purchase_order_id = ? AND voided_at IS NULL ORDER BY paid_on',
      [req.params.poId]
    );
    // v_po_retention already filters to retention_pct > 0, so this is empty
    // (-> null) for every PO without a holdback.
    const [retentionRows] = await pool.query(
      'SELECT * FROM v_po_retention WHERE id = ?',
      [req.params.poId]
    );
    const [attachments] = await pool.query(
      `SELECT id, original_name, content_type, size_bytes, uploaded_at
       FROM purchase_order_attachments WHERE purchase_order_id = ? ORDER BY uploaded_at`,
      [req.params.poId]
    );

    res.json({ ...rows[0], milestones, payments, retention: retentionRows[0] || null, attachments });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/purchase-orders', async (req, res, next) => {
  const projectId = req.params.id;
  const {
    por_no, msr_no, po_date, supplier_id, planning_line_id,
    item_description, ref_no, currency, contract_amount, fx_rate, remarks, milestones,
  } = req.body;

  const errors = [];
  if (!por_no) errors.push('por_no is required');
  errors.push(...validateDateInWindow(po_date, 'po_date'));
  if (!supplier_id) errors.push('supplier_id is required');
  if (!isPositiveAmount(contract_amount)) {
    errors.push('contract_amount must be a positive number');
  }
  validateCurrencyAndFxRate(currency, fx_rate, errors);

  errors.push(...validateMilestones(milestones));

  if (errors.length > 0) return res.status(400).json({ error: errors });

  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let budgetItemId = null;
    if (planning_line_id) {
      const [plRows] = await conn.query(
        'SELECT budget_item_id, is_active FROM planning_lines WHERE id = ? AND project_id = ?',
        [planning_line_id, projectId]
      );
      if (plRows.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'planning_line_id does not belong to this project' });
      }
      if (plRows[0].is_active === 0) {
        await conn.rollback();
        return res.status(400).json({ error: 'This JPL/WBS code is inactive and cannot be used for new entries.' });
      }
      budgetItemId = plRows[0].budget_item_id;
    }

    const { retentionPct, paymentTermsText } = deriveFromMilestones(milestones);

    const [result] = await conn.query(
      `INSERT INTO purchase_orders
         (project_id, por_no, msr_no, po_date, supplier_id, budget_item_id, planning_line_id,
          item_description, ref_no, currency, contract_amount, fx_rate, payment_terms,
          retention_pct, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId, por_no, msr_no || null, po_date, supplier_id, budgetItemId, planning_line_id || null,
        item_description || null, ref_no || null, currency || 'PHP', contract_amount, fx_rate || 1,
        paymentTermsText, retentionPct.gt(0) ? retentionPct.toFixed(4) : null, remarks || null, appUser,
      ]
    );
    const poId = result.insertId;

    let seq = 1;
    for (const m of milestones) {
      await conn.query(
        `INSERT INTO po_payment_terms (purchase_order_id, seq, label, pct, kind, is_holdback)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [poId, seq++, m.label, m.pct, m.kind || 'other', m.is_holdback ? 1 : 0]
      );
    }

    await recordAudit(conn, {
      table: 'purchase_orders',
      rowId: poId,
      action: 'insert',
      changedBy: appUser,
      after: {
        id: poId, project_id: projectId, por_no, po_date, supplier_id, budget_item_id: budgetItemId,
        planning_line_id: planning_line_id || null, contract_amount, payment_terms: paymentTermsText,
        retention_pct: retentionPct.gt(0) ? retentionPct.toFixed(4) : null, milestones, created_by: appUser,
      },
    });

    await conn.commit();
    const [rows] = await pool.query(`${BASE_SELECT} WHERE v.id = ? AND v.project_id = ?`, [poId, projectId]);
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

router.patch('/:id/purchase-orders/:poId', async (req, res, next) => {
  const projectId = req.params.id;
  const { poId } = req.params;
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existingRows] = await conn.query(
      'SELECT * FROM purchase_orders WHERE id = ? AND project_id = ? AND voided_at IS NULL FOR UPDATE',
      [poId, projectId]
    );
    if (existingRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }
    const before = existingRows[0];

    const merged = { ...before };
    for (const field of [
      'por_no', 'msr_no', 'po_date', 'supplier_id', 'planning_line_id',
      'item_description', 'ref_no', 'contract_amount', 'currency', 'fx_rate', 'remarks',
    ]) {
      if (req.body[field] !== undefined) merged[field] = req.body[field];
    }
    // milestones are only touched when the client actually sends them --
    // editing "Description" alone shouldn't require resending the whole
    // payment schedule.
    const milestones = Array.isArray(req.body.milestones) ? req.body.milestones : null;

    const errors = [];
    if (!merged.por_no) errors.push('por_no is required');
    errors.push(...validateDateInWindow(merged.po_date, 'po_date'));
    if (!merged.supplier_id) errors.push('supplier_id is required');
    if (!isPositiveAmount(merged.contract_amount)) {
      errors.push('contract_amount must be a positive number');
    }
    validateCurrencyAndFxRate(merged.currency, merged.fx_rate, errors);
    if (milestones) errors.push(...validateMilestones(milestones));
    if (errors.length > 0) {
      await conn.rollback();
      return res.status(400).json({ error: errors });
    }

    let budgetItemId = merged.budget_item_id;
    if (req.body.planning_line_id !== undefined && req.body.planning_line_id !== before.planning_line_id) {
      if (merged.planning_line_id) {
        const [plRows] = await conn.query(
          'SELECT budget_item_id, is_active FROM planning_lines WHERE id = ? AND project_id = ?',
          [merged.planning_line_id, projectId]
        );
        if (plRows.length === 0) {
          await conn.rollback();
          return res.status(400).json({ error: 'planning_line_id does not belong to this project' });
        }
        if (plRows[0].is_active === 0) {
          await conn.rollback();
          return res.status(400).json({ error: 'This JPL/WBS code is inactive and cannot be used for new entries.' });
        }
        budgetItemId = plRows[0].budget_item_id;
      } else {
        budgetItemId = null;
      }
    }

    let retentionPct = before.retention_pct;
    let paymentTermsText = before.payment_terms;
    if (milestones) {
      const derived = deriveFromMilestones(milestones);
      retentionPct = derived.retentionPct.gt(0) ? derived.retentionPct.toFixed(4) : null;
      paymentTermsText = derived.paymentTermsText;
    }

    await conn.query(
      `UPDATE purchase_orders SET
         por_no = ?, msr_no = ?, po_date = ?, supplier_id = ?, budget_item_id = ?, planning_line_id = ?,
         item_description = ?, ref_no = ?, currency = ?, contract_amount = ?, fx_rate = ?, payment_terms = ?,
         retention_pct = ?, remarks = ?, updated_by = ?
       WHERE id = ?`,
      [
        merged.por_no, merged.msr_no || null, merged.po_date, merged.supplier_id, budgetItemId,
        merged.planning_line_id || null, merged.item_description || null, merged.ref_no || null,
        merged.currency || 'PHP', merged.contract_amount, merged.fx_rate || 1, paymentTermsText, retentionPct,
        merged.remarks || null, appUser, poId,
      ]
    );

    if (milestones) {
      // Rebuilt wholesale rather than diffed -- same approach create uses,
      // and simplest to reason about for a full-schedule edit.
      await conn.query('DELETE FROM po_payment_terms WHERE purchase_order_id = ?', [poId]);
      let seq = 1;
      for (const m of milestones) {
        await conn.query(
          `INSERT INTO po_payment_terms (purchase_order_id, seq, label, pct, kind, is_holdback)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [poId, seq++, m.label, m.pct, m.kind || 'other', m.is_holdback ? 1 : 0]
        );
      }
    }

    await recordAudit(conn, {
      table: 'purchase_orders',
      rowId: Number(poId),
      action: 'update',
      changedBy: appUser,
      before,
      after: { ...merged, budget_item_id: budgetItemId, payment_terms: paymentTermsText, retention_pct: retentionPct, milestones: milestones || undefined, updated_by: appUser },
    });

    // contract_amount may have changed -- balance/status must be
    // recomputed against the new figure, same as after a payment change.
    await recomputePoStatus(conn, poId);

    await conn.commit();
    const [rows] = await pool.query(`${BASE_SELECT} WHERE v.id = ? AND v.project_id = ?`, [poId, projectId]);
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

router.post('/:id/purchase-orders/:poId/payments', async (req, res, next) => {
  const { paid_on, payment_type, amount, currency, fx_rate, voucher_no, remarks } = req.body;

  const errors = [];
  errors.push(...validateDateInWindow(paid_on, 'paid_on'));
  if (!isPositiveAmount(amount)) errors.push('amount must be a positive number');
  if (payment_type && !PAYMENT_TYPES.includes(payment_type)) {
    errors.push(`payment_type must be one of ${PAYMENT_TYPES.join(', ')}`);
  }
  validateCurrencyAndFxRate(currency, fx_rate, errors);
  if (errors.length > 0) return res.status(400).json({ error: errors });

  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [poRows] = await conn.query(
      'SELECT id, status, contract_amount_php FROM purchase_orders WHERE id = ? AND project_id = ? AND voided_at IS NULL FOR UPDATE',
      [req.params.poId, req.params.id]
    );
    if (poRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }

    const [result] = await conn.query(
      `INSERT INTO po_payments (purchase_order_id, paid_on, payment_type, currency, amount, fx_rate, voucher_no, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.poId, paid_on, payment_type || 'other', currency || 'PHP', amount, fx_rate || 1, voucher_no || null, remarks || null, appUser]
    );

    await recordAudit(conn, {
      table: 'po_payments',
      rowId: result.insertId,
      action: 'insert',
      changedBy: appUser,
      after: { purchase_order_id: Number(req.params.poId), paid_on, payment_type: payment_type || 'other', amount, voucher_no, remarks },
    });

    await recomputePoStatus(conn, req.params.poId);

    await conn.commit();
    const [rows] = await pool.query(`${BASE_SELECT} WHERE v.id = ? AND v.project_id = ?`, [req.params.poId, req.params.id]);
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

router.get('/:id/purchase-orders/:poId/payments/voided', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT pp.* FROM po_payments pp
       JOIN purchase_orders po ON po.id = pp.purchase_order_id
       WHERE pp.purchase_order_id = ? AND po.project_id = ? AND pp.voided_at IS NOT NULL
       ORDER BY pp.voided_at DESC`,
      [req.params.poId, req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Voids rather than deletes -- disappears from the PO's balance exactly like
// removing it from the spreadsheet, but stays restorable, and the PO's
// status is recomputed since removing a payment can drop it back out of
// fully_paid/partially_paid.
router.delete('/:id/purchase-orders/:poId/payments/:paymentId', async (req, res, next) => {
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT pp.* FROM po_payments pp
       JOIN purchase_orders po ON po.id = pp.purchase_order_id
       WHERE pp.id = ? AND pp.purchase_order_id = ? AND po.project_id = ? AND pp.voided_at IS NULL
       FOR UPDATE`,
      [req.params.paymentId, req.params.poId, req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }

    await conn.query(
      'UPDATE po_payments SET voided_at = NOW(), voided_by = ?, void_reason = ? WHERE id = ?',
      [appUser, req.body?.reason || null, req.params.paymentId]
    );
    await recordAudit(conn, {
      table: 'po_payments',
      rowId: Number(req.params.paymentId),
      action: 'update',
      changedBy: appUser,
      before: rows[0],
      after: { ...rows[0], voided_at: new Date(), voided_by: appUser, void_reason: req.body?.reason || null },
    });

    await recomputePoStatus(conn, req.params.poId);

    await conn.commit();
    res.status(204).end();
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

router.post('/:id/purchase-orders/:poId/payments/:paymentId/restore', async (req, res, next) => {
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT pp.* FROM po_payments pp
       JOIN purchase_orders po ON po.id = pp.purchase_order_id
       WHERE pp.id = ? AND pp.purchase_order_id = ? AND po.project_id = ? AND pp.voided_at IS NOT NULL
       FOR UPDATE`,
      [req.params.paymentId, req.params.poId, req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found, or not currently voided' });
    }

    await conn.query(
      'UPDATE po_payments SET voided_at = NULL, voided_by = NULL, void_reason = NULL WHERE id = ?',
      [req.params.paymentId]
    );
    await recordAudit(conn, {
      table: 'po_payments',
      rowId: Number(req.params.paymentId),
      action: 'update',
      changedBy: appUser,
      before: rows[0],
      after: { ...rows[0], voided_at: null, voided_by: null, void_reason: null },
    });

    await recomputePoStatus(conn, req.params.poId);

    await conn.commit();
    const [poRows] = await pool.query(`${BASE_SELECT} WHERE v.id = ? AND v.project_id = ?`, [req.params.poId, req.params.id]);
    res.json(poRows[0]);
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Voids the whole PO -- hidden from v_po_balance (so out of every list and
// total) but restorable, unlike a real DELETE which would cascade away
// po_payments/po_payment_terms permanently.
router.delete('/:id/purchase-orders/:poId', async (req, res, next) => {
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM purchase_orders WHERE id = ? AND project_id = ? AND voided_at IS NULL FOR UPDATE',
      [req.params.poId, req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }

    await conn.query(
      'UPDATE purchase_orders SET voided_at = NOW(), voided_by = ?, void_reason = ? WHERE id = ?',
      [appUser, req.body?.reason || null, req.params.poId]
    );
    await recordAudit(conn, {
      table: 'purchase_orders',
      rowId: Number(req.params.poId),
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

router.post('/:id/purchase-orders/:poId/restore', async (req, res, next) => {
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM purchase_orders WHERE id = ? AND project_id = ? AND voided_at IS NOT NULL FOR UPDATE',
      [req.params.poId, req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found, or not currently voided' });
    }

    await conn.query(
      'UPDATE purchase_orders SET voided_at = NULL, voided_by = NULL, void_reason = NULL WHERE id = ?',
      [req.params.poId]
    );
    await recordAudit(conn, {
      table: 'purchase_orders',
      rowId: Number(req.params.poId),
      action: 'update',
      changedBy: appUser,
      before: rows[0],
      after: { ...rows[0], voided_at: null, voided_by: null, void_reason: null },
    });

    await conn.commit();
    const [poRows] = await pool.query(`${BASE_SELECT} WHERE v.id = ? AND v.project_id = ?`, [req.params.poId, req.params.id]);
    res.json(poRows[0]);
  } catch (err) {
    await conn.rollback();
    const mapped = mapDbError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.message });
    next(err);
  } finally {
    conn.release();
  }
});

router.post('/:id/purchase-orders/:poId/attachments', (req, res, next) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!req.file) return res.status(400).json({ error: 'file is required' });

    const appUser = req.session.username;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [poRows] = await conn.query(
        'SELECT id FROM purchase_orders WHERE id = ? AND project_id = ? AND voided_at IS NULL FOR UPDATE',
        [req.params.poId, req.params.id]
      );
      if (poRows.length === 0) {
        await conn.rollback();
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'not found' });
      }

      const [result] = await conn.query(
        `INSERT INTO purchase_order_attachments
           (purchase_order_id, file_name, original_name, content_type, size_bytes, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.params.poId, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, appUser]
      );
      await recordAudit(conn, {
        table: 'purchase_order_attachments',
        rowId: result.insertId,
        action: 'insert',
        changedBy: appUser,
        after: { purchase_order_id: Number(req.params.poId), original_name: req.file.originalname },
      });

      await conn.commit();
      res.status(201).json({
        id: result.insertId,
        original_name: req.file.originalname,
        content_type: req.file.mimetype,
        size_bytes: req.file.size,
        uploaded_at: new Date().toISOString(),
      });
    } catch (err) {
      await conn.rollback();
      fs.unlink(req.file.path, () => {});
      next(err);
    } finally {
      conn.release();
    }
  });
});

router.get('/:id/purchase-orders/:poId/attachments/:attachmentId/file', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.file_name, a.content_type
       FROM purchase_order_attachments a
       JOIN purchase_orders po ON po.id = a.purchase_order_id
       WHERE a.id = ? AND a.purchase_order_id = ? AND po.project_id = ?`,
      [req.params.attachmentId, req.params.poId, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });

    const filePath = path.join(poUploadDir(req.params.poId), rows[0].file_name);
    res.type(rows[0].content_type);
    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'file missing on disk' });
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/purchase-orders/:poId/attachments/:attachmentId', async (req, res, next) => {
  const appUser = req.session.username;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT a.file_name, a.original_name
       FROM purchase_order_attachments a
       JOIN purchase_orders po ON po.id = a.purchase_order_id
       WHERE a.id = ? AND a.purchase_order_id = ? AND po.project_id = ?`,
      [req.params.attachmentId, req.params.poId, req.params.id]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'not found' });
    }

    await conn.query('DELETE FROM purchase_order_attachments WHERE id = ?', [req.params.attachmentId]);
    // audit_log.action is ENUM('insert','update') -- no 'delete' value exists
    // (same constraint payroll_entries' bulk-delete route already works
    // around), so a hard delete is logged as an 'update' to null.
    await recordAudit(conn, {
      table: 'purchase_order_attachments',
      rowId: Number(req.params.attachmentId),
      action: 'update',
      changedBy: appUser,
      before: { purchase_order_id: Number(req.params.poId), original_name: rows[0].original_name },
      after: null,
    });

    await conn.commit();
    fs.unlink(path.join(poUploadDir(req.params.poId), rows[0].file_name), () => {});
    res.status(204).end();
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

module.exports = router;
