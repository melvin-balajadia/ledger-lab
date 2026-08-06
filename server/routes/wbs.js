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

module.exports = router;
