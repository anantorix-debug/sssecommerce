import { BadgeCheck } from 'lucide-react';
import Image from 'next/image';
import { brand } from '@/lib/api';
import { longDate } from '@/lib/format';
import type { ProductDetail } from '@/lib/types';
import { Stars } from '../ui/misc';

export function Reviews({ product: p }: { product: ProductDetail }) {
  const max = Math.max(1, ...p.rating.distribution.map((d) => d.count));
  return (
    <section id="reviews" className="container-x scroll-mt-28 border-t border-line pt-16 lg:pt-20">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="grid content-start gap-5 lg:col-span-4">
          <p className="eyebrow">Reviews</p>
          {p.rating.count > 0 ? (
            <>
              <div className="flex items-end gap-4">
                <span className="font-[family-name:var(--font-display)] text-[4rem] leading-none tabular">{p.rating.average.toFixed(1)}</span>
                <div className="grid gap-1 pb-2">
                  <Stars value={p.rating.average} size={18} />
                  <span className="text-[0.85rem] text-muted">
                    {p.rating.count} verified review{p.rating.count > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <ul className="grid gap-2" aria-label="Rating breakdown">
                {p.rating.distribution.map((d) => (
                  <li key={d.rating} className="flex items-center gap-3 text-[0.82rem] text-muted">
                    <span className="w-10 tabular">{d.rating} star</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-2">
                      <span className="block h-full rounded-full bg-brass" style={{ width: `${(d.count / max) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right tabular">{d.count}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-ink-soft">No reviews yet. Customers can review this piece after it’s delivered.</p>
          )}
          <p className="text-[0.82rem] text-muted">Only customers who bought and received this piece can review it. Every review is checked before it appears.</p>
        </div>
        <div className="lg:col-span-8">
          {p.reviews.length > 0 && (
            <ul className="divide-y divide-line">
              {p.reviews.map((r) => (
                <li key={r.id} className="grid gap-3 py-7 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Stars value={r.rating} />
                    <span className="text-[0.8rem] text-muted">{longDate(r.createdAt)}</span>
                  </div>
                  <h3 className="display-sm">{r.title}</h3>
                  <p className="max-w-2xl text-ink-soft">{r.body}</p>
                  {r.photos.length > 0 && (
                    <div className="flex gap-2">
                      {r.photos.map((src) => (
                        <div key={src} className="relative h-20 w-20 overflow-hidden bg-paper-2">
                          <Image src={src} alt="Customer photo" fill sizes="80px" className="object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="flex items-center gap-1.5 text-[0.82rem] text-muted">
                    <span className="font-medium text-ink">{r.author}</span>
                    {r.verified && (
                      <>
                        · <BadgeCheck className="h-4 w-4 text-accent" strokeWidth={1.6} /> Verified buyer
                      </>
                    )}
                  </p>
                  {r.reply && (
                    <div className="mt-1 border-l-2 border-accent/40 pl-4 text-[0.9rem] text-ink-soft">
                      <p className="font-medium text-ink">Reply from {brand}</p>
                      <p>{r.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
