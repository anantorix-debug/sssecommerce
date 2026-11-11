'use client';

import { ArrowRight, ArrowUpRight, Hammer, PackageCheck, Sparkles, Star, Tag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { inr } from '@/lib/format';
import type { Navigation } from '@/lib/types';

export type MenuKey = `cat:${string}` | 'rooms' | 'collections';

const stagger = (i: number) => ({ animationDelay: `${i * 55}ms` }) as CSSProperties;

export function MegaMenu({ open, nav, onClose, onEnter }: { open: MenuKey | null; nav: Navigation; onClose: () => void; onEnter: () => void }) {
  if (!open) return null;
  const category = open.startsWith('cat:') ? nav.categories.find((c) => `cat:${c.slug}` === open) : null;

  return (
    <div
      data-mega
      className="absolute inset-x-0 top-full hidden border-y border-line bg-surface text-ink shadow-[0_40px_70px_-40px_rgb(20_10_8/0.45)] animate-[mega-in_.28s_var(--ease-out-soft)] lg:block"
      onMouseEnter={onEnter}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div key={open} className="container-x py-8">
        {category && (
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-7 grid grid-cols-3 gap-8">
              <Column title={category.name} i={0}>
                <MenuLink href={`/shop/${category.slug}`} onClick={onClose} strong>
                  All {category.name.toLowerCase()} {category.count > 0 && <span className="font-normal text-muted">({category.count})</span>}
                </MenuLink>
                {category.children.map((ch) => (
                  <MenuLink key={ch.slug} href={`/shop/${category.slug}/${ch.slug}`} onClick={onClose}>
                    {ch.name}
                  </MenuLink>
                ))}
              </Column>
              <Column title="Shop by room" i={1}>
                {nav.rooms.map((r) => (
                  <MenuLink key={r.slug} href={`/rooms/${r.slug}`} onClick={onClose}>
                    {r.name}
                  </MenuLink>
                ))}
              </Column>
              <Column title="Quick picks" i={2}>
                <MenuLink href={`/shop/${category.slug}?sort=new`} onClick={onClose} icon={<Sparkles className="h-3.5 w-3.5" />}>
                  New arrivals
                </MenuLink>
                <MenuLink href={`/shop/${category.slug}?maxPrice=2500000`} onClick={onClose} icon={<Tag className="h-3.5 w-3.5" />}>
                  Under {inr(2_500_000)}
                </MenuLink>
                <MenuLink href={`/shop/${category.slug}?inStock=1`} onClick={onClose} icon={<PackageCheck className="h-3.5 w-3.5" />}>
                  Ready to ship
                </MenuLink>
                <MenuLink href={`/shop/${category.slug}?sort=rating`} onClick={onClose} icon={<Star className="h-3.5 w-3.5" />}>
                  Top rated
                </MenuLink>
                <MenuLink href="/contact" onClick={onClose} icon={<Hammer className="h-3.5 w-3.5" />}>
                  Made to your size
                </MenuLink>
              </Column>
            </div>

            <div className="col-span-5 grid grid-cols-2 gap-4">
              {/* Promo card 1: the category, priced live from the catalogue */}
              <Link
                href={`/shop/${category.slug}`}
                onClick={onClose}
                className="group relative flex min-h-[17rem] flex-col justify-end overflow-hidden rounded-2xl bg-paper-2 animate-[row-in_.5s_var(--ease-out-soft)_both]"
                style={stagger(3)}
              >
                {category.image && <Image src={category.image} alt="" fill sizes="300px" className="object-cover transition-transform duration-[900ms] ease-[var(--ease-out-soft)] group-hover:scale-[1.06]" />}
                <span className="absolute inset-0 bg-[linear-gradient(180deg,rgb(10_9_8/0)_30%,rgb(10_9_8/0.78))]" />
                <span className="relative flex items-end justify-between gap-3 p-5 text-white">
                  <span>
                    <span className="block font-[family-name:var(--font-display)] text-[1.7rem] leading-none">{category.name}</span>
                    {category.fromPrice !== null && (
                      <span className="mt-2 block text-[0.92rem] text-white/85">
                        starting from <span className="text-[1.15rem] font-semibold text-white tabular">{inr(category.fromPrice)}</span>
                      </span>
                    )}
                  </span>
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-white transition-transform duration-500 group-hover:rotate-45">
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </span>
              </Link>

              {/* Promo card 2: this category's bestseller */}
              {category.bestseller ? (
                <Link
                  href={`/products/${category.bestseller.slug}`}
                  onClick={onClose}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-paper animate-[row-in_.5s_var(--ease-out-soft)_both]"
                  style={stagger(4)}
                >
                  <span className="relative block flex-1 overflow-hidden bg-paper-2">
                    {category.bestseller.image && (
                      <Image src={category.bestseller.image.url} alt="" fill sizes="300px" className="object-cover transition-transform duration-[900ms] ease-[var(--ease-out-soft)] group-hover:scale-[1.06]" />
                    )}
                    <span className="absolute left-3 top-3 rounded-full bg-[linear-gradient(120deg,#fbf3e4,#f0dcb6)] px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.08em] text-[#6b4b1c] shadow-sm">
                      Bestseller
                    </span>
                  </span>
                  <span className="grid gap-1 p-4">
                    <span className="truncate text-[0.95rem] font-medium group-hover:text-accent">{category.bestseller.name}</span>
                    <span className="flex items-center justify-between gap-2 text-[0.85rem]">
                      <span className="font-semibold tabular">{inr(category.bestseller.price)}</span>
                      {category.bestseller.ratingCount > 0 && (
                        <span className="flex items-center gap-1 text-muted">
                          <Star className="h-3.5 w-3.5 fill-brass text-brass" /> {category.bestseller.ratingAvg.toFixed(1)}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              ) : (
                <Link href="/contact" onClick={onClose} className="group grid content-end gap-2 rounded-2xl bg-ink p-5 text-paper animate-[row-in_.5s_var(--ease-out-soft)_both]" style={stagger(4)}>
                  <Hammer className="h-6 w-6 text-brass-soft" />
                  <span className="font-[family-name:var(--font-display)] text-[1.4rem] leading-tight">Need a different size?</span>
                  <span className="text-[0.85rem] text-paper/70">Our Salem workshop makes it to order.</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {open === 'rooms' && (
          <div className="grid grid-cols-4 gap-5">
            {nav.rooms.map((r, i) => (
              <Tile key={r.slug} href={`/rooms/${r.slug}`} image={r.image} title={r.name} caption={r.tagline ?? ''} onClick={onClose} tall i={i} />
            ))}
          </div>
        )}
        {open === 'collections' && (
          <div className="grid grid-cols-3 gap-5">
            {nav.collections.map((c, i) => (
              <Tile key={c.slug} href={`/collections/${c.slug}`} image={c.image} title={c.name} caption={c.tagline ?? ''} onClick={onClose} i={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Column({ title, i, children }: { title: string; i: number; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1 border-l border-line pl-6 first:border-l-0 first:pl-0 animate-[row-in_.45s_var(--ease-out-soft)_both]" style={stagger(i)}>
      <p className="eyebrow mb-2 text-ink">{title}</p>
      {children}
    </div>
  );
}

function MenuLink({ href, onClick, children, icon, strong }: { href: string; onClick: () => void; children: ReactNode; icon?: ReactNode; strong?: boolean }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group/link flex items-center gap-2 rounded-md py-1.5 text-[0.9rem] transition-colors ${strong ? 'font-medium text-ink' : 'text-ink-soft hover:text-ink'}`}
    >
      {icon && <span className="text-brass">{icon}</span>}
      <span className="transition-transform duration-300 group-hover/link:translate-x-1">{children}</span>
      <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-accent opacity-0 transition-all duration-300 group-hover/link:translate-x-0 group-hover/link:opacity-100" />
    </Link>
  );
}

function Tile({ href, image, title, caption, onClick, tall, i }: { href: string; image: string | null; title: string; caption: string; onClick: () => void; tall?: boolean; i: number }) {
  return (
    <Link href={href} onClick={onClick} className="group grid gap-3 animate-[row-in_.5s_var(--ease-out-soft)_both]" style={stagger(i)}>
      <div className={`relative overflow-hidden rounded-xl bg-paper-2 ${tall ? 'aspect-[4/3.4]' : 'aspect-[16/11]'}`}>
        {image && <Image src={image} alt="" fill sizes="(min-width: 1440px) 340px, 25vw" className="object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.05]" />}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="display-sm group-hover:text-accent">{title}</p>
          {caption && <p className="mt-0.5 text-[0.85rem] text-muted">{caption}</p>}
        </div>
        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent" strokeWidth={1.5} />
      </div>
    </Link>
  );
}
