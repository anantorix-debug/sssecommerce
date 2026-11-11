'use client';

import clsx from 'clsx';
import { Box, GitCompareArrows, Heart } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import type { ProductCard as Card } from '@/lib/types';
import { TransitionLink } from '../motion';
import { useSaved } from '../providers';
import { Img } from '../ui/Img';
import { Price, Stars } from '../ui/misc';

interface Props {
  product: Card;
  priority?: boolean;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  showCompare?: boolean;
}

/** Product card: second image on hover, finish swatches swap the image, wishlist and compare toggles. */
export function ProductCard({ product: p, priority, sizes = '(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw', className, style, showCompare = true }: Props) {
  const { wishlist, toggleWishlist, compare, toggleCompare } = useSaved();
  const [swatch, setSwatch] = useState<number | null>(null);
  const saved = wishlist.has(p.id);
  const comparing = compare.includes(p.id);
  const active = swatch !== null ? p.swatches[swatch] : null;
  const image = active?.image ?? p.image;
  const href = `/products/${p.slug}${active ? `?finish=${encodeURIComponent(active.value)}` : ''}`;

  return (
    <article className={clsx('group relative grid min-w-0 content-start gap-3', className)} style={style}>
      <div className="relative">
        <TransitionLink href={href} className="relative block aspect-[4/5] overflow-hidden bg-paper-2" aria-label={p.name}>
          <span data-vt-image className="absolute inset-0 block">
            <Img
              image={image}
              alt={image?.alt ?? p.name}
              sizes={sizes}
              priority={priority}
              className={clsx('object-cover transition-[opacity,transform] duration-700 ease-[var(--ease-out-soft)]', p.hoverImage && !active && 'group-hover:opacity-0')}
            />
          </span>
          {p.hoverImage && !active && (
            <Img image={p.hoverImage} alt="" sizes={sizes} className="scale-[1.03] object-cover opacity-0 transition-[opacity,transform] duration-700 ease-[var(--ease-out-soft)] group-hover:scale-100 group-hover:opacity-100" />
          )}
          <span className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
            {p.badge && (
              <span className="rounded-full bg-paper/92 px-2.5 py-1 text-[0.68rem] font-semibold tracking-[0.04em] text-ink backdrop-blur">{p.badge}</span>
            )}
            {p.has3d && p.badge !== 'View in 3D' && (
              <span className="flex items-center gap-1 rounded-full bg-paper/92 px-2.5 py-1 text-[0.68rem] font-semibold text-ink backdrop-blur">
                <Box className="h-3 w-3" /> 3D
              </span>
            )}
          </span>
        </TransitionLink>

        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <button
            onClick={() => toggleWishlist(p.id, p.name)}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}
            className={clsx(
              'grid h-9 w-9 place-items-center rounded-full bg-paper/92 backdrop-blur transition-[opacity,transform] duration-300 hover:scale-105',
              saved ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100',
            )}
          >
            <Heart className={clsx('h-[17px] w-[17px]', saved && 'fill-clay text-clay')} strokeWidth={1.6} />
          </button>
          {showCompare && (
            <button
              onClick={() => toggleCompare(p.id, p.name)}
              aria-pressed={comparing}
              aria-label={comparing ? `Remove ${p.name} from compare` : `Add ${p.name} to compare`}
              className={clsx(
                'grid h-9 w-9 place-items-center rounded-full backdrop-blur transition-[opacity,transform] duration-300 hover:scale-105',
                comparing ? 'bg-accent text-white opacity-100' : 'bg-paper/92 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100',
              )}
            >
              <GitCompareArrows className="h-[16px] w-[16px]" strokeWidth={1.6} />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <h3 className="min-w-0 text-[0.98rem] font-medium leading-snug">
            <TransitionLink href={href} className="hover:text-accent">
              {p.name}
            </TransitionLink>
          </h3>
          {p.ratingCount > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-[0.78rem] text-muted sm:mt-[3px]">
              <Stars value={p.ratingAvg} size={11} /> <span className="tabular">({p.ratingCount})</span>
            </span>
          )}
        </div>
        {p.material && <p className="-mt-1 text-[0.82rem] text-muted">{p.material}</p>}
        <Price price={p.price} mrp={p.mrp} size="sm" />
        {p.swatches.length > 1 && (
          <div className="mt-1 flex items-center gap-1.5" role="group" aria-label="Finishes">
            {p.swatches.slice(0, 5).map((s, i) => (
              <button
                key={s.id}
                onMouseEnter={() => s.image && setSwatch(i)}
                onFocus={() => s.image && setSwatch(i)}
                onClick={() => setSwatch(swatch === i ? null : i)}
                aria-label={s.value}
                title={s.value}
                aria-pressed={swatch === i}
                className={clsx('h-[18px] w-[18px] rounded-full border border-black/10 ring-offset-2 ring-offset-paper transition-shadow', swatch === i && 'ring-1 ring-ink')}
                style={{ background: s.hex ?? '#ddd' }}
              />
            ))}
            {p.swatches.length > 5 && <span className="text-[0.75rem] text-muted">+{p.swatches.length - 5}</span>}
          </div>
        )}
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="grid gap-3">
      <div className="skeleton aspect-[4/5]" />
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-4 w-1/3" />
    </div>
  );
}
