const { normalizeSupplierName } = require('./normalizeSupplierName');

// Matches a supplier by name the way she'd type it, ignoring spacing,
// punctuation and company suffixes. The source carries the same company
// under several hand-typed spellings ("ECP ENTERPRISES" / "E C P
// ENTERPRISES", "HEBREW 3:4" / "HEBREW 3:4 BUILDERS"), so a plain LIKE on
// one spelling silently hides every row filed under the others.
// `alias` is the suppliers table alias in the caller's query.
function supplierNameMatch(q, alias = 's') {
  const key = normalizeSupplierName(q).replace(/ /g, '');
  // A query that is only a suffix ("TRADING", "INC") normalizes to nothing --
  // fall back to the raw name rather than match every supplier.
  if (!key) return { sql: `${alias}.name LIKE ?`, params: [`%${q}%`] };
  return {
    sql: `(${alias}.name LIKE ? OR REPLACE(${alias}.normalized_name, ' ', '') LIKE ?)`,
    params: [`%${q}%`, `%${key}%`],
  };
}

module.exports = { supplierNameMatch };
