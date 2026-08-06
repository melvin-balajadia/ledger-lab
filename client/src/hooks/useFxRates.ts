import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '../lib/api';

export interface FxRate {
  currency: string;
  rate_to_php: string;
  effective_on: string;
  note: string | null;
}

export function useFxRates() {
  return useQuery({
    queryKey: ['fx-rates'],
    queryFn: () => fetchJson<FxRate[]>('/api/meta/fx-rates'),
    staleTime: 60 * 60 * 1000,
  });
}

// The rate effective on/before `date` for `currency` -- a starting
// suggestion only, since the real settlement rate is confirmed against the
// bank at payment time and can differ from this reference table.
export function suggestFxRate(rates: FxRate[] | undefined, currency: string, date: string): FxRate | null {
  if (!rates || !date) return null;
  const forCurrency = rates.filter((r) => r.currency === currency).sort((a, b) => a.effective_on.localeCompare(b.effective_on));
  if (forCurrency.length === 0) return null;
  return [...forCurrency].reverse().find((r) => r.effective_on <= date) ?? forCurrency[0];
}
