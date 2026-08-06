const Decimal = require('decimal.js');

// decimal.js throws synchronously on an unparseable value (e.g. new
// Decimal('abc')). In an async Express handler that's an unhandled
// rejection, not a clean 500 -- on Node >=15 that crashes the whole
// process. Every request-body amount must go through this, never a bare
// `new Decimal(x)`, before any try/catch is in scope.
function toDecimalOrNull(value) {
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

function isPositiveAmount(value) {
  const d = toDecimalOrNull(value);
  return d !== null && d.gt(0);
}

module.exports = { toDecimalOrNull, isPositiveAmount };
