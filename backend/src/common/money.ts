/** All money is integer paise. Prices include GST. */

export const rupees = (paise: number) => Math.round(paise) / 100;

export function formatInr(paise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);
}

/** GST contained in a GST-inclusive amount. */
export function includedTax(amountInclusive: number, gstRate: number) {
  return Math.round((amountInclusive * gstRate) / (100 + gstRate));
}

/** Split a discount across lines in proportion to their totals; remainders go to the largest line. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((total * w) / sum));
  let rest = total - parts.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => [w, i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) parts[order[k][1]]++;
  return parts;
}

/** Indian financial year label for a date, e.g. 2026-27. */
export function financialYear(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
