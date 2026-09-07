// Verifies the Overview's "Cost by JPL code" panel against its own drill-down:
// for every JPL code with activity, the transactions listed behind the code
// must sum to exactly the figures the summary shows -- in total AND per
// ledger.
//
// This is the check for the JPL summary + drill-down. It catches two failures
// a type-checker cannot: a JOIN in the transactions query fanning out and
// double-counting a row, and a source label mapped to the wrong summary
// column (which would keep the grand total right while both columns lie).
//
// Run:  node --env-file=.env scripts/check-jpl-reconciliation.js
// Exits non-zero on any mismatch.

const express = require('express');
const Decimal = require('decimal.js');

const PROJECT_ID = process.env.CHECK_PROJECT_ID ?? 1;
const PORT = 4099;

// Which summary column each ledger's transactions must add up to.
const LEDGER_COLUMN = {
  Replenishment: 'replen_amount',
  'PO Paid': 'po_paid_amount',
  'Cash Advance': 'cash_advance_amount',
  'Additional Payment': 'additional_payment_amount',
  Payroll: 'labor_amount',
};

const app = express();
app.use('/api/projects', require('../routes/wbs'));

const server = app.listen(PORT, async () => {
  const base = `http://localhost:${PORT}/api/projects/${PROJECT_ID}`;
  let mismatches = 0;

  try {
    const codes = await (await fetch(`${base}/wbs`)).json();
    const active = codes.filter(
      (r) => Number(r.total_spend) !== 0 || Number(r.contract_amount) !== 0,
    );

    for (const row of active) {
      const txns = await (await fetch(`${base}/wbs/${row.planning_line_id}/transactions`)).json();
      const contract = txns
        .filter((t) => t.kind === 'contract')
        .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));
      const cash = txns
        .filter((t) => t.kind === 'disbursement')
        .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));

      if (!contract.equals(row.contract_amount) || !cash.equals(row.total_spend)) {
        mismatches++;
        console.error(
          `MISMATCH ${row.code}: contract ${contract.toFixed(2)} vs ${row.contract_amount}, ` +
            `cash ${cash.toFixed(2)} vs ${row.total_spend}`,
        );
      }

      // Per-ledger: every source must tie to its own summary column, so a
      // label landing in the wrong bucket cannot hide behind a right total.
      for (const [source, column] of Object.entries(LEDGER_COLUMN)) {
        const actual = txns
          .filter((t) => t.source === source)
          .reduce((sum, t) => sum.plus(t.amount), new Decimal(0));
        if (!actual.equals(row[column])) {
          mismatches++;
          console.error(
            `MISMATCH ${row.code} / ${source}: ${actual.toFixed(2)} vs ${column} ${row[column]}`,
          );
        }
      }

      // The panel sums the five ledger columns itself so it can total a
      // subset of them. That is only safe while the five add up to the stored
      // total_spend -- if a sixth source is ever added to the view without a
      // column, the unfiltered total would silently drift below the real one.
      const columnSum = Object.values(LEDGER_COLUMN).reduce(
        (sum, column) => sum.plus(row[column]),
        new Decimal(0),
      );
      if (!columnSum.equals(row.total_spend)) {
        mismatches++;
        console.error(
          `MISMATCH ${row.code}: five ledger columns sum to ${columnSum.toFixed(2)} ` +
            `but total_spend is ${row.total_spend}`,
        );
      }

      // An unrecognised source would be summarised in the modal but tie to no
      // column at all -- surface it rather than letting it pass silently.
      for (const t of txns) {
        if (t.kind === 'disbursement' && !(t.source in LEDGER_COLUMN)) {
          mismatches++;
          console.error(`UNKNOWN LEDGER ${row.code}: "${t.source}" maps to no summary column`);
        }
      }
    }

    console.log(`checked ${active.length} active JPL codes; ${mismatches} mismatches`);
  } catch (err) {
    console.error('check failed:', err.message);
    mismatches = 1;
  }

  server.close();
  process.exit(mismatches ? 1 : 0);
});
