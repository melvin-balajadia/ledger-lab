const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const foreignFormatters = new Map<string, Intl.NumberFormat>();

// Formats a single already-computed DECIMAL string for display. Never sum
// multiple values after converting to Number -- that's what loses centavos.
export function formatMoney(value: string): string {
  return peso.format(Number(value));
}

// Accounting style, "(₱4.92)" instead of "-₱4.92" -- display only, scoped to
// the Budget vs. actual table rather than a global formatMoney() change,
// since several other screens concatenate formatMoney() output with their
// own literal parens for currency conversions (e.g. PurchaseOrderDetail's
// "$1,000.00 (₱58,599.00)"), which would double up if this became the
// default everywhere.
export function formatMoneyAccounting(value: string): string {
  const n = Number(value);
  return n < 0 ? `(${peso.format(-n)})` : peso.format(n);
}

// For a PO/payment's native (pre-conversion) amount, e.g. the USD figure
// on a foreign-currency contract -- formatMoney is PHP-only.
export function formatCurrency(value: string, currency: string): string {
  if (currency === 'PHP') return formatMoney(value);
  let fmt = foreignFormatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency });
    foreignFormatters.set(currency, fmt);
  }
  return fmt.format(Number(value));
}

export function formatPercent(ratio: string | null): string {
  if (ratio == null) return '—';
  return `${(Number(ratio) * 100).toFixed(1)}%`;
}

// Sums DECIMAL strings as integer cents (BigInt), never as JS floats -- for
// client-side display totals where there's no SQL SUM() to lean on (e.g. a
// table footer). Still never used for anything but display.
export function sumMoney(values: string[]): string {
  let totalCents = 0n;
  for (const raw of values) {
    const trimmed = raw.trim();
    const negative = trimmed.startsWith('-');
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [whole, frac = '0'] = unsigned.split('.');
    const cents = BigInt(whole || '0') * 100n + BigInt((frac + '00').slice(0, 2));
    totalCents += negative ? -cents : cents;
  }
  const negative = totalCents < 0n;
  const abs = negative ? -totalCents : totalCents;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
