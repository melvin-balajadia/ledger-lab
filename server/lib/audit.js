// Appends one row to audit_log. Call within the same transaction as the
// write it's recording, on the connection that write used.
async function recordAudit(conn, { table, rowId, action, changedBy, before, after }) {
  await conn.query(
    `INSERT INTO audit_log (table_name, row_id, action, changed_by, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [table, rowId, action, changedBy, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
  );
}

module.exports = { recordAudit };
