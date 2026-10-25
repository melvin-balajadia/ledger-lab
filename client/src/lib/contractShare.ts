import Decimal from 'decimal.js';

export interface ContractShare {
  share: string; // this payment / contract, as a fraction ("0.200000" = 20%)
  cumulative: string; // (already paid + this payment) / contract
  exceeds: boolean; // cumulative > 100%
}

// Live preview for the Record a payment form. All three inputs are native
// contract-currency strings, the same basis the server uses for the saved
// rows. Null whenever there's nothing sensible to show: empty or half-typed
// amount, zero/negative amount, or a contract of zero.
export function contractShare(amount: string, contract: string, paid: string): ContractShare | null {
  try {
    const a = new Decimal(amount);
    const c = new Decimal(contract);
    if (!a.isFinite() || a.lte(0) || !c.isFinite() || c.lte(0)) return null;
    const cumulative = a.plus(paid).div(c);
    return { share: a.div(c).toFixed(6), cumulative: cumulative.toFixed(6), exceeds: cumulative.gt(1) };
  } catch {
    return null; // decimal.js throws on '', '-', 'abc'
  }
}
