// Top-level codes are always literally "N.0" (see budget_items.item_no,
// e.g. '2.0','3.0',...'19.0') and are siblings of, not ancestors of, "N.1",
// "N.8.4", etc. in the actual code tree -- confirmed against real data:
// "3.0" and "3.1" are both depth 2. But the accountant's mental model of
// "3.0" is "the whole bucket 3", matching every code whose FIRST segment is
// 3 (the same grouping planning_lines.budget_item_id is resolved from) --
// not a literal nested-code descendant. A non-top-level code like "3.1" has
// no such special meaning, so it gets ordinary nested-prefix matching.
const TOP_LEVEL_CODE = /^(\d+)\.0$/;

// Resolves a planning_line_id to itself plus every id "under" it, by
// matching on `code` (dot-segmented, e.g. "3.1.4.2") rather than parent_id.
// parent_id is only populated on ~40% of planning_lines rows (a pre-existing
// ETL gap -- see client/src/lib/sortCodes.ts), so a parent_id graph walk
// would silently miss most descendants. The code string is always fully
// populated and is the reliable hierarchy signal.
async function resolvePlanningLineIdsWithDescendants(pool, projectId, planningLineId) {
  const [[line]] = await pool.query(
    'SELECT code FROM planning_lines WHERE id = ? AND project_id = ?',
    [planningLineId, projectId]
  );
  // Unknown id (bad/stale filter value) -- fall back to the old exact-match
  // behavior instead of erroring or silently matching everything.
  if (!line) return [planningLineId];

  const topLevelMatch = TOP_LEVEL_CODE.exec(line.code);
  const [rows] = topLevelMatch
    ? await pool.query(
        `SELECT id FROM planning_lines WHERE project_id = ? AND code LIKE CONCAT(?, '.%')`,
        [projectId, topLevelMatch[1]]
      )
    : await pool.query(
        `SELECT id FROM planning_lines
         WHERE project_id = ? AND (code = ? OR code LIKE CONCAT(?, '.%'))`,
        [projectId, line.code, line.code]
      );
  return rows.map((r) => r.id);
}

module.exports = { resolvePlanningLineIdsWithDescendants };
