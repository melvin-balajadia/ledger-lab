const express = require('express');
const Decimal = require('decimal.js');
const pool = require('../db');
const { recordAudit } = require('../lib/audit');

const router = express.Router();

const PROJECT_DATE_MIN = '2025-01-01';
const PROJECT_DATE_MAX = '2027-12-31';
const PROCUREMENT_MODES = ['inhouse', 'po_awarded', 'for_bidding', 'bac_recommendation', 'third_party', 'other'];

// item_no is structural, not a label: deriveFromCode() in planningLines.js
// resolves a JPL code to its budget item by matching the code's first segment
// against this string, so anything other than '<n>.0' is a code that no JPL
// line can ever attach to.
const ITEM_NO_RE = /^\d+\.0$/;

const MONEY_FIELDS = ['original_budget', 'revised_budget', 'contract_amount'];

// Only the two budget columns freeze once a revision is logged -- after that
// budget_revisions is the only correct way to move the figure (CLAUDE.md
// rule 9). contract_amount is not a budget: it's the commitment total, which
// keeps growing as POs are awarded regardless of any budget revision.
const BUDGET_FIELDS = ['original_budget', 'revised_budget'];

// 0 is a legitimate value here -- a seeded item sits at 0 until she enters the
// real figure -- so this is >= 0, not > 0 like the revision endpoint.
function isAmount(value) {
  try {
    return new Decimal(value).gte(0);
  } catch {
    return false;
  }
}

// Point any existing JPL code whose first segment names this item at it.
// Mirrors deriveFromCode() in planningLines.js, which is what a code created
// through the UI goes through.
//
// Needed because codes can predate their budget item -- every seeded site
// starts that way (db/seed_master_data.sql). An orphaned code is not a display
// problem: each transaction copies budget_item_id off the line it is charged
// to, and the five *_by_item views GROUP BY that column, so amounts charged to
// an unlinked code roll up to nothing and the dashboard reports zero spend
// with no error anywhere.
async function relinkPlanningLines(conn, projectId, budgetItemId, itemNo) {
  const [result] = await conn.query(
    `UPDATE planning_lines SET budget_item_id = ?
     WHERE project_id = ? AND budget_item_id IS NULL
       AND SUBSTRING_INDEX(code, '.', 1) = ?`,
    [budgetItemId, projectId, itemNo.split('.')[0]]
  );
  return result.affectedRows;
}

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

router.post('/:id/budget-items', async (req, res, next) => {
  const projectId = req.params.id;
  const { item_no: itemNo, description, original_budget: originalBudget, contract_amount: contractAmount } = req.body;

  const errors = [];
  if (!itemNo || !ITEM_NO_RE.test(itemNo)) errors.push('item_no must look like "21.0" -- a number followed by ".0"');
  if (!description || !description.trim()) errors.push('description is required');
  else if (description.length > 191) errors.push('description must be 191 characters or fewer');
  if (originalBudget !== undefined && !isAmount(originalBudget)) errors.push('original_budget must be a number, 0 or more');
  if (contractAmount !== undefined && !isAmount(contractAmount)) errors.push('contract_amount must be a number, 0 or more');
  if (req.body.procurement_mode !== undefined && !PROCUREMENT_MODES.includes(req.body.procurement_mode)) {
    errors.push(`procurement_mode must be one of: ${PROCUREMENT_MODES.join(', ')}`);
  }
  if (errors.length > 0) return res.status(400).json({ error: errors });

  // Every view reads revised_budget; original_budget is the never-overwritten
  // baseline the revision log measures against. A new item has not been
  // revised, so both start at the figure she enters -- same as the seed.
  const budget = originalBudget !== undefined ? originalBudget : 0;
  // Matches the seed's convention (1.0 -> 10, ... 20.0 -> 200), so ordering is
  // derived rather than another number to type and keep unique.
  const sortOrder = Number(itemNo.split('.')[0]) * 10;
  const appUser = req.session.username;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO budget_items
         (project_id, item_no, sort_order, description, original_budget, revised_budget,
          contract_amount, procurement_mode, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectId, itemNo, sortOrder, description.trim(), budget, budget,
        contractAmount !== undefined ? contractAmount : 0,
        req.body.procurement_mode || 'other', req.body.remarks || null, appUser,
      ]
    );

    const relinked = await relinkPlanningLines(conn, projectId, result.insertId, itemNo);

    await recordAudit(conn, {
      table: 'budget_items',
      rowId: result.insertId,
      action: 'insert',
      changedBy: appUser,
      after: {
        id: result.insertId, project_id: Number(projectId), item_no: itemNo, sort_order: sortOrder,
        description: description.trim(), original_budget: budget, revised_budget: budget,
        contract_amount: contractAmount !== undefined ? contractAmount : 0,
        procurement_mode: req.body.procurement_mode || 'other', remarks: req.body.remarks || null,
        planning_lines_relinked: relinked,
      },
    });

    await conn.commit();
    const detail = await loadDetail(pool, result.insertId, projectId);
    res.status(201).json(detail);
  } catch (err) {
    await conn.rollback();
    if (err.errno === 1062) {
      return res.status(400).json({ error: `Item number ${itemNo} already exists on this project.` });
    }
    next(err);
  } finally {
    conn.release();
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

  const errors = [];
  if (req.body.procurement_mode !== undefined && !PROCUREMENT_MODES.includes(req.body.procurement_mode)) {
    errors.push(`procurement_mode must be one of: ${PROCUREMENT_MODES.join(', ')}`);
  }
  if (req.body.description !== undefined) {
    if (!req.body.description || !req.body.description.trim()) errors.push('description cannot be blank');
    else if (req.body.description.length > 191) errors.push('description must be 191 characters or fewer');
  }
  // item_no is deliberately absent from this list -- see ITEM_NO_RE above.
  for (const field of MONEY_FIELDS) {
    if (req.body[field] !== undefined && !isAmount(req.body[field])) {
      errors.push(`${field} must be a number, 0 or more`);
    }
  }
  if (errors.length > 0) return res.status(400).json({ error: errors });

  const touchesBudget = BUDGET_FIELDS.some((field) => req.body[field] !== undefined);

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

    // Once a revision is logged, revised_budget is the tail of an audited
    // chain and original_budget is the figure that chain is measured from --
    // editing either in place would orphan the log and break exactly the
    // explainability budget_revisions exists to provide (CLAUDE.md rule 9).
    if (touchesBudget) {
      const [[{ revisions }]] = await conn.query(
        'SELECT COUNT(*) AS revisions FROM budget_revisions WHERE budget_item_id = ?',
        [budgetItemId]
      );
      if (revisions > 0) {
        await conn.rollback();
        return res.status(400).json({
          error:
            'This item already has a logged budget revision, so its baseline budget is fixed. ' +
            'Use "Log a revision" to change the budget.',
        });
      }
    }

    const procurementMode = req.body.procurement_mode !== undefined ? req.body.procurement_mode : before.procurement_mode;
    const remarks = req.body.remarks !== undefined ? req.body.remarks || null : before.remarks;
    const description = req.body.description !== undefined ? req.body.description.trim() : before.description;
    const merged = {};
    for (const field of MONEY_FIELDS) {
      merged[field] = req.body[field] !== undefined ? req.body[field] : before[field];
    }

    await conn.query(
      `UPDATE budget_items SET description = ?, original_budget = ?, revised_budget = ?, contract_amount = ?,
         procurement_mode = ?, remarks = ?, updated_by = ?
       WHERE id = ?`,
      [
        description, merged.original_budget, merged.revised_budget, merged.contract_amount,
        procurementMode, remarks, appUser, budgetItemId,
      ]
    );

    await recordAudit(conn, {
      table: 'budget_items',
      rowId: Number(budgetItemId),
      action: 'update',
      changedBy: appUser,
      before,
      after: { ...before, ...merged, description, procurement_mode: procurementMode, remarks, updated_by: appUser },
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
