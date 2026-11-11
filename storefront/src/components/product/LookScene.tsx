'use client';

import clsx from 'clsx';
import { ArrowUpRight, Plus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { inr } from '@/lib/format';
import type { Look } from '@/lib/types';
import { useCart, useToast } from '../providers';
import { Button } from '../ui/Button';
import { Img } from '../ui/Img';

/**
 * Shop the room: numbered pins on the scene (a small courtyard square, our brand mark), a matching
 * list beside it, and one button to add every piece. On phones the list sits under the image,
 * so nobody has to hit tiny targets.
 */
export function LookScene({ look, compact, hideHeading }: { look: Look; compact?: boolean; hideHeading?: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const { add } = useCart();
  const { notify } = useToast();
  const [adding, setAdding] = useState(false);

  const addAll = async () => {
    setAdding(true);
    let added = 0;
    for (const h of look.hotspots) {
      if (h.product.defaultVariantId && (await add(h.product.defaultVariantId, 1, { silent: true }))) added++;
    }
    setAdding(false);
    if (added) notify(`${added} pieces added to your cart`, { action: { label: 'View cart', href: '/cart' } });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      <div className={clsx('relative overflow-hidden bg-paper-2 lg:col-span-8', compact ? 'aspect-[4/3]' : 'aspect-[4/3] lg:aspect-[16/11]')}>
        <Img image={look.image} sizes="(min-width: 1024px) 64vw, 100vw" className="object-cover" />
        {look.hotspots.map((h, i) => (
          <div key={h.id} className="absolute" style={{ left: `${h.x}%`, top: `${h.y}%` }}>
            <button
              onClick={() => setActive(active === h.id ? null : h.id)}
              onMouseEnter={() => setActive(h.id)}
              aria-label={`${i + 1}: ${h.product.name}, ${inr(h.product.price)}`}
              aria-expanded={active === h.id}
              className={clsx(
                'relative -ml-[15px] -mt-[15px] grid h-[30px] w-[30px] place-items-center rounded-[8px] border-[1.5px] border-white bg-ink/40 text-[0.72rem] font-semibold text-white backdrop-blur-md transition-transform duration-300 hover:scale-110',
                active === h.id ? 'scale-110 bg-white text-ink' : 'animate-[pin-pulse_2.4s_ease-out_infinite]',
              )}
            >
              {i + 1}
            </button>
            {active === h.id && (
              <Link
                href={`/products/${h.product.slug}`}
                className={clsx(
                  'absolute z-10 hidden w-60 gap-3 rounded-lg bg-paper p-2.5 shadow-[0_18px_40px_rgb(0_0_0/0.25)] animate-[fade-in_.2s_ease-out] sm:flex',
                  h.x > 60 ? 'right-5' : 'left-5',
                  h.y > 60 ? 'bottom-5' : 'top-5',
                )}
                onMouseLeave={() => setActive(null)}
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden bg-paper-2">
                  {h.product.image && <Image src={h.product.image.url} alt="" fill sizes="64px" className="object-cover" />}
                </div>
                <div className="min-w-0 py-0.5">
                  <p className="truncate text-[0.88rem] font-medium">{h.product.name}</p>
                  <p className="text-[0.85rem] tabular text-ink-soft">{inr(h.product.price)}</p>
                  <p className="mt-1 flex items-center gap-1 text-[0.78rem] font-medium text-accent">
                    View <ArrowUpRight className="h-3 w-3" />
                  </p>
                </div>
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="grid content-start gap-6 lg:col-span-4">
        <div>
          {!hideHeading && <p className="display-sm">{look.name}</p>}
          {look.description && <p className={hideHeading ? 'text-[1.02rem] text-ink-soft' : 'mt-2 text-ink-soft'}>{look.description}</p>}
        </div>
        <ol className="divide-y divide-line border-y border-line">
          {look.hotspots.map((h, i) => (
            <li key={h.id} onMouseEnter={() => setActive(h.id)} onMouseLeave={() => setActive(null)} className={clsx('transition-colors', active === h.id && 'bg-paper-2')}>
              <Link href={`/products/${h.product.slug}`} className="flex items-center gap-4 py-3 pr-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border border-ink/30 text-[0.7rem] font-semibold">{i + 1}</span>
                <div className="relative h-14 w-14 shrink-0 overflow-hidden bg-paper-2">
                  {h.product.image && <Image src={h.product.image.url} alt="" fill sizes="56px" className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{h.product.name}</p>
                  <p className="truncate text-[0.82rem] text-muted">{h.product.material}</p>
                </div>
                <span className="text-[0.92rem] tabular">{inr(h.product.price)}</span>
              </Link>
            </li>
          ))}
        </ol>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[0.8rem] text-muted">The whole look from</p>
            <p className="text-xl font-medium tabular">{inr(look.totalPrice)}</p>
          </div>
          <Button onClick={addAll} loading={adding} icon={<Plus className="h-4 w-4" />}>
            Add the whole look
          </Button>
        </div>
      </div>
    </div>
  );
}
