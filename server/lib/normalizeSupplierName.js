// Mirrors etl/etl_ods_to_csv.py's norm_supplier() exactly, so a supplier
// created through the UI dedupes against the existing seeded rows the same
// way the ETL would on a re-import.
const SUFFIXES = /\b(INC|CORP|CORPORATION|COMPANY|CO|LTD|PHILS|PHILIPPINES|ENTERPRISES|TRADING|GENERAL MERCHANDISE|SERVICES)\b/g;

function normalizeSupplierName(name) {
  let s = String(name ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ');
  s = s.replace(SUFFIXES, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

module.exports = { normalizeSupplierName };
