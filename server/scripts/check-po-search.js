// Verifies the PO list finds the same records however she searches for them:
//   1. Every PO is found by its own PO no.
//   2. Searching a supplier's name finds every PO the supplier filter finds,
//      plus those filed under the same company spelled differently
//      ("ECP ENTERPRISES" / "E C P ENTERPRISES" -- the reported bug).
//   3. The supplier autocomplete offers every spelling of that company.
//   4. Every sort, paged at 50, returns the same rows as one 200-row page,
//      in order, no row twice or missing.
//   5. The summary tiles equal the sum of the rows they summarize.
//
// Run:  node --env-file=.env scripts/check-po-search.js
// Exits non-zero on any failure.

const express = require('express');
const Decimal = require('decimal.js');
const pool = require('../db');

const PROJECT_ID = process.env.CHECK_PROJECT_ID ?? 1;
const PORT = 4098;

const app = express();
app.use('/api/projects', require('../routes/purchaseOrders'));
app.use('/api/suppliers', require('../routes/suppliers'));

let failures = 0;
function check(ok, message) {
  if (!ok) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}

const server = app.listen(PORT, async () => {
  const base = `http://localhost:${PORT}/api`;
  const get = async (path) => (await fetch(`${base}${path}`)).json();
  const listPos = async (query) => {
    const rows = [];
    for (let page = 1; ; page++) {
      const json = await get(`/projects/${PROJECT_ID}/purchase-orders?pageSize=200&page=${page}&${query}`);
      rows.push(...json.rows);
      if (rows.length >= json.total || json.rows.length === 0) return { rows, json };
    }
  };

  try {
    const { rows: all } = await listPos('');

    // 1. By PO no.
    for (const po of all) {
      const { rows } = await listPos(`q=${encodeURIComponent(po.por_no)}`);
      check(rows.some((r) => r.id === po.id), `${po.por_no} not found by its own PO no.`);
    }

    // 2 + 3. By supplier, grouped by company key (normalized name, spaces out).
    const [suppliers] = await pool.query(
      `SELECT DISTINCT s.id, s.name, REPLACE(s.normalized_name, ' ', '') AS company_key
       FROM suppliers s JOIN purchase_orders po ON po.supplier_id = s.id
       WHERE po.project_id = ? AND po.voided_at IS NULL`,
      [PROJECT_ID]
    );
    for (const s of suppliers) {
      const sameCompany = suppliers.filter((o) => o.company_key === s.company_key).map((o) => o.id);
      const expected = all.filter((po) => sameCompany.includes(po.supplier_id)).map((po) => po.id);
      const { rows: bySearch } = await listPos(`q=${encodeURIComponent(s.name)}`);
      const found = new Set(bySearch.map((r) => r.id));
      const missing = expected.filter((id) => !found.has(id));
      check(missing.length === 0, `search "${s.name}" misses ${missing.length} PO(s) of the same company`);

      const { rows: byFilter } = await listPos(`supplier_id=${s.id}`);
      check(byFilter.every((r) => found.has(r.id)), `supplier filter #${s.id} finds a PO the search for "${s.name}" does not`);

      const offered = (await get(`/suppliers?q=${encodeURIComponent(s.company_key)}`)).map((o) => o.id);
      const notOffered = sameCompany.filter((id) => !offered.includes(id));
      check(notOffered.length === 0, `autocomplete "${s.company_key}" does not offer supplier(s) #${notOffered.join(', #')}`);
    }

    // 4. Sorts are stable across pages.
    for (const sortKey of ['por_no', 'contract_amount_php', 'paid_php', 'balance_php']) {
      for (const sortDir of ['asc', 'desc']) {
        const qs = `sortKey=${sortKey}&sortDir=${sortDir}`;
        const { rows: whole } = await listPos(qs);
        const paged = [];
        for (let page = 1; paged.length < whole.length; page++) {
          const json = await get(`/projects/${PROJECT_ID}/purchase-orders?pageSize=50&page=${page}&${qs}`);
          if (json.rows.length === 0) break;
          paged.push(...json.rows);
        }
        check(
          paged.map((r) => r.id).join() === whole.map((r) => r.id).join(),
          `sort ${qs}: 50-row pages differ from one 200-row page`
        );
        const key = (r) => (sortKey === 'por_no' ? r.por_no : new Decimal(r[sortKey]));
        const outOfOrder = whole.some((r, i) => {
          if (i === 0) return false;
          const a = key(whole[i - 1]);
          const b = key(r);
          const cmp = sortKey === 'por_no' ? a.localeCompare(b) : a.cmp(b);
          return sortDir === 'asc' ? cmp > 0 : cmp < 0;
        });
        check(!outOfOrder, `sort ${qs}: rows out of order`);
      }
    }

    // 5. Summary tiles match the rows, under a combined filter too.
    for (const qs of ['', 'outstanding=1', `supplier_id=${suppliers[0].id}&outstanding=1`]) {
      const { rows, json } = await listPos(qs);
      const sum = (k) => rows.reduce((acc, r) => acc.plus(r[k]), new Decimal(0));
      check(sum('contract_amount_php').equals(json.summary.total_contract), `summary contract != rows [${qs}]`);
      check(sum('paid_php').equals(json.summary.total_paid), `summary paid != rows [${qs}]`);
      check(sum('balance_php').equals(json.summary.total_balance), `summary balance != rows [${qs}]`);
      check(rows.length === json.total, `row count ${rows.length} != total ${json.total} [${qs}]`);
    }

    console.log(`${all.length} POs, ${suppliers.length} suppliers checked -- ${failures ? `${failures} FAILURE(S)` : 'all OK'}`);
  } catch (err) {
    console.error(err);
    failures++;
  }
  server.close();
  await pool.end();
  process.exit(failures ? 1 : 0);
});
