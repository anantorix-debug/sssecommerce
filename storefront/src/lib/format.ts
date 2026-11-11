const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Paise to "₹1,24,900" (Indian digit grouping). */
export const inr = (paise: number) => (paise % 100 === 0 ? inr0 : inr2).format(paise / 100);

export const discountPercent = (price: number, mrp: number | null) =>
  mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

export const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const longDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export const dayDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

export const dateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** "Thu, 23 Oct" (Flipkart-style "Delivery by …") */
export const deliveryBy = (iso: string | Date) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/** "Arrives Thu 23 Oct – Sat 25 Oct" */
export function arrivalRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${fmt(f)} – ${fmt(t)}`;
}

export const dims = (d: { length: number | null; width: number | null; height: number | null }) =>
  [d.length, d.width, d.height].every(Boolean) ? `${d.length} × ${d.width} × ${d.height} cm` : null;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Salem, Bengaluru and Mumbai" */
export const listJoin = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
