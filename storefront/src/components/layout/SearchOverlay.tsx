'use client';

import clsx from 'clsx';
import { ArrowRight, ArrowUpRight, BookOpen, Clock, Home, LayoutGrid, Phone, Search, SearchX, TrendingUp, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type CSSProperties, Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { call } from '@/lib/client';
import { inr } from '@/lib/format';
import type { Navigation, ProductCard } from '@/lib/types';
import { useSettings } from '../providers';
import { Spinner } from '../ui/Button';

interface Suggest {
  products: ProductCard[];
  categories: { name: string; slug: string }[];
  rooms: { name: string; slug: string }[];
  guides: { title: string; slug: string }[];
  correctedQuery?: string | null;
}

interface Item {
  key: string;
  href: string;
  label: string;
  kind: 'product' | 'category' | 'room' | 'guide';
  product?: ProductCard;
}

const POPULAR = ['Teak furniture', 'Recliner sofa', 'Three-seater sofa', 'Storage bed', 'Dining set', 'Office chair'];
const RECENT_KEY = 'recentSearches';

/**
 * Site search: a floating panel on larger screens, a full-screen sheet on phones.
 * Empty: recent and popular searches plus category tiles. Typing: live suggestions with the
 * match highlighted, arrow-key navigation, and "See all results" pinned at the bottom.
 */
export function SearchOverlay({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: Navigation }) {
  const router = useRouter();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [data, setData] = useState<Suggest | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  // Open: focus, lock page scroll, Esc closes. Depends on `open` only, so header re-renders don't re-run it.
  useEffect(() => {
    if (!open) return;
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'));
    } catch {}
    const t = setTimeout(() => input.current?.focus(), 30);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      call<Suggest>(`/store/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((d) => {
          setData(d);
          setActive(-1);
        })
        .catch(() => undefined)
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    if (!data) return [];
    return [
      ...data.products.map((p) => ({ key: `p-${p.id}`, href: `/products/${p.slug}`, label: p.name, kind: 'product' as const, product: p })),
      ...data.categories.map((c) => ({ key: `c-${c.slug}`, href: `/shop/${c.slug}`, label: c.name, kind: 'category' as const })),
      ...data.rooms.map((r) => ({ key: `r-${r.slug}`, href: `/rooms/${r.slug}`, label: r.name, kind: 'room' as const })),
      ...data.guides.map((g) => ({ key: `g-${g.slug}`, href: `/guides/${g.slug}`, label: g.title, kind: 'guide' as const })),
    ];
  }, [data]);

  useEffect(() => {
    if (active < 0) return;
    list.current?.querySelector(`#search-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const remember = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };

  const submit = (term: string) => {
    const t = term.trim();
    if (!t) return;
    remember(t);
    onClose();
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  const go = (item: Item) => {
    remember(q);
    onClose();
    router.push(item.href);
  };

  const clearRecent = () => {
    setRecent([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {}
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      go(items[active]);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  const term = q.trim();
  const typing = term.length >= 2;
  const empty = data && items.length === 0;
  const products = items.filter((i) => i.kind === 'product');
  const others = items.filter((i) => i.kind !== 'product');
  const highlight = data?.correctedQuery ?? term;
  const indexOf = (key: string) => items.findIndex((i) => i.key === key);

  return createPortal(
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[6px] animate-[fade-in_.25s_ease-out]" onClick={onClose} aria-hidden />

      <div className="relative flex h-[100svh] flex-col overflow-hidden bg-paper animate-[search-in_.38s_var(--ease-out-soft)] sm:mx-auto sm:mt-[8vh] sm:h-auto sm:max-h-[min(84vh,760px)] sm:w-[min(960px,calc(100vw-3rem))] sm:rounded-[1.25rem] sm:border sm:border-white/60 sm:shadow-[0_40px_120px_-20px_rgb(20_10_8/0.45)]">
        {/* Search field */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (active >= 0 && items[active]) go(items[active]);
            else submit(q);
          }}
          className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:h-[4.75rem] sm:px-6"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center text-accent">
            {loading ? <Spinner className="h-5 w-5" /> : <Search className="h-[22px] w-[22px]" strokeWidth={1.6} />}
          </span>
          <label htmlFor="site-search" className="sr-only">
            Search the store
          </label>
          <input
            ref={input}
            id="site-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search sofas, beds, teak…"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `search-opt-${active}` : undefined}
            className="min-w-0 flex-1 bg-transparent font-[family-name:var(--font-display)] text-[1.2rem] tracking-[-0.01em] placeholder:text-muted/60 focus:outline-none sm:text-[1.5rem] [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                input.current?.focus();
              }}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper-2 text-ink-soft transition-colors hover:bg-line hover:text-ink"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          )}
          <button type="button" onClick={onClose} className="shrink-0 text-[0.9rem] font-medium text-ink-soft hover:text-ink sm:hidden">
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="hidden h-8 shrink-0 items-center rounded-md border border-line-strong px-2 text-[0.72rem] font-semibold tracking-[0.06em] text-muted transition-colors hover:border-ink hover:text-ink sm:flex"
            aria-label="Close search"
          >
            ESC
          </button>
        </form>

        {/* Body */}
        <div ref={list} id="search-results" role="listbox" aria-label="Suggestions" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6 sm:py-7">
          {!typing && (
            <div className="grid gap-8">
              {recent.length > 0 && (
                <Section
                  title="Recent searches"
                  action={
                    <button onClick={clearRecent} className="text-[0.8rem] text-muted underline-offset-4 hover:text-ink hover:underline">
                      Clear
                    </button>
                  }
                >
                  <Chips terms={recent} icon={<Clock className="h-3.5 w-3.5" strokeWidth={1.8} />} onPick={submit} />
                </Section>
              )}
              <Section title="Popular searches">
                <Chips terms={POPULAR} icon={<TrendingUp className="h-3.5 w-3.5" strokeWidth={1.8} />} onPick={submit} />
              </Section>
              {nav.categories.length > 0 && (
                <Section title="Shop by category">
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {nav.categories.slice(0, 8).map((c, i) => (
                      <li key={c.slug} className="animate-[row-in_.5s_var(--ease-out-soft)_both]" style={stagger(i, 40)}>
                        <Link href={`/shop/${c.slug}`} onClick={onClose} className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-paper-2">
                          {c.image && <Image src={c.image} alt="" fill sizes="(min-width: 640px) 220px, 45vw" className="object-cover transition-transform duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.06]" />}
                          <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgb(10_9_8/0.68))]" />
                          <span className="absolute inset-x-3 bottom-2.5 flex items-center justify-between text-[0.92rem] font-medium text-white">
                            {c.name}
                            <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}

          {typing && !data && loading && <ResultsSkeleton />}

          {typing && empty && (
            <div className="mx-auto grid max-w-md justify-items-center gap-4 py-6 text-center animate-[row-in_.4s_var(--ease-out-soft)_both]">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent">
                <SearchX className="h-6 w-6" strokeWidth={1.6} />
              </span>
              <div>
                <p className="display-sm">No matches for “{term}”</p>
                <p className="mt-2 text-[0.95rem] text-ink-soft">Check the spelling, or try a simpler word like sofa, bed or table.</p>
              </div>
              <Chips terms={POPULAR.slice(0, 4)} onPick={submit} center />
              <a href={`tel:${settings.store.phone.replace(/[^\d+]/g, '')}`} className="mt-2 flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left text-[0.88rem] transition-colors hover:border-ink">
                <Phone className="h-4 w-4 shrink-0 text-accent" strokeWidth={1.7} />
                <span>
                  Can’t find it? Call us on <span className="font-semibold tabular">{settings.store.phone}</span>
                  <span className="block text-[0.78rem] text-muted">We also make pieces to order.</span>
                </span>
              </a>
            </div>
          )}

          {data && !empty && (
            <div className={clsx('grid gap-8 transition-opacity duration-200', others.length > 0 && 'md:grid-cols-[minmax(0,1fr)_minmax(0,15.5rem)]', loading && 'opacity-60')}>
              {data.correctedQuery && (
                <p className="text-[0.9rem] text-ink-soft md:col-span-full">
                  Showing results for <span className="font-semibold text-ink">“{data.correctedQuery}”</span>
                </p>
              )}
              {products.length > 0 && (
                <Section title="Products" count={products.length}>
                  <ul className={clsx('grid gap-1', others.length === 0 && 'md:grid-cols-2')}>
                    {products.map((item, i) => {
                      const idx = indexOf(item.key);
                      const p = item.product!;
                      return (
                        <li key={item.key} className="animate-[row-in_.45s_var(--ease-out-soft)_both]" style={stagger(i, 35)}>
                          <Link
                            id={`search-opt-${idx}`}
                            role="option"
                            aria-selected={active === idx}
                            href={item.href}
                            onClick={() => remember(q)}
                            onMouseEnter={() => setActive(idx)}
                            className={clsx('group flex items-center gap-4 rounded-xl p-2 pr-3 transition-colors', active === idx ? 'bg-paper-2' : 'hover:bg-paper-2')}
                          >
                            <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-paper-2 sm:h-[4.5rem] sm:w-[4.5rem]">
                              {p.image && <Image src={p.image.url} alt="" fill sizes="72px" className="object-cover transition-transform duration-500 group-hover:scale-105" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.98rem] font-medium">
                                <Highlight text={p.name} term={highlight} />
                              </span>
                              <span className="mt-0.5 flex items-baseline gap-2 text-[0.84rem]">
                                <span className="truncate text-muted">{p.category.name}</span>
                                <span className="text-line-strong">·</span>
                                <span className="shrink-0 font-medium tabular text-ink">{inr(p.price)}</span>
                                {p.mrp && p.mrp > p.price && <span className="shrink-0 text-[0.78rem] text-muted line-through tabular">{inr(p.mrp)}</span>}
                              </span>
                            </span>
                            <ArrowUpRight className={clsx('h-4 w-4 shrink-0 text-muted transition-all duration-300', active === idx ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100')} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              )}

              {others.length > 0 && (
                <div className="grid min-w-0 content-start gap-6 md:border-l md:border-line md:pl-6">
                  {(['category', 'room', 'guide'] as const).map((kind) => {
                    const group = others.filter((i) => i.kind === kind);
                    if (!group.length) return null;
                    return (
                      <Section key={kind} title={kind === 'category' ? 'Categories' : kind === 'room' ? 'Rooms' : 'Guides'}>
                        <ul className="grid gap-0.5">
                          {group.map((item, i) => {
                            const idx = indexOf(item.key);
                            const Icon = kind === 'category' ? LayoutGrid : kind === 'room' ? Home : BookOpen;
                            return (
                              <li key={item.key} className="animate-[row-in_.45s_var(--ease-out-soft)_both]" style={stagger(i + 2, 35)}>
                                <Link
                                  id={`search-opt-${idx}`}
                                  role="option"
                                  aria-selected={active === idx}
                                  href={item.href}
                                  onClick={() => remember(q)}
                                  onMouseEnter={() => setActive(idx)}
                                  className={clsx('group flex items-center gap-3 rounded-lg px-2.5 py-2 text-[0.92rem] transition-colors', active === idx ? 'bg-paper-2 text-ink' : 'text-ink-soft hover:bg-paper-2 hover:text-ink')}
                                >
                                  <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.6} />
                                  <span className="line-clamp-2 min-w-0 flex-1 leading-snug">
                                    <Highlight text={item.label} term={highlight} />
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </Section>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer: see all, and keyboard hints on desktop */}
        {typing && data && !empty && (
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line bg-surface px-4 py-3 sm:px-6">
            <p className="hidden items-center gap-3 text-[0.75rem] text-muted md:flex">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> to move <Kbd>↵</Kbd> to open <Kbd>esc</Kbd> to close
            </p>
            <button onClick={() => submit(q)} className="btn-sheen relative isolate flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-ink px-5 text-[0.88rem] font-medium text-paper transition-colors hover:bg-accent md:w-auto">
              See all results for “{term}” <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const stagger = (i: number, step: number) => ({ animationDelay: `${Math.min(i, 10) * step}ms` }) as CSSProperties;

function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="eyebrow">
          {title}
          {count !== undefined && <span className="ml-2 font-normal tracking-normal text-muted/80">{count}</span>}
        </p>
        {action}
      </div>
      {children}
    </section>
  );
}

function Chips({ terms, icon, onPick, center }: { terms: string[]; icon?: ReactNode; onPick: (t: string) => void; center?: boolean }) {
  return (
    <div className={clsx('flex flex-wrap gap-2', center && 'justify-center')}>
      {terms.map((t, i) => (
        <button
          key={t}
          onClick={() => onPick(t)}
          className="flex items-center gap-2 rounded-full border border-line-strong bg-surface px-3.5 py-2 text-[0.86rem] text-ink-soft transition-all duration-300 animate-[row-in_.4s_var(--ease-out-soft)_both] hover:-translate-y-0.5 hover:border-ink hover:text-ink hover:shadow-[0_6px_16px_-8px_rgb(0_0_0/0.3)]"
          style={stagger(i, 30)}
        >
          {icon && <span className="text-muted">{icon}</span>}
          {t}
        </button>
      ))}
    </div>
  );
}

/** Marks every occurrence of the search words in a label. */
function Highlight({ text, term }: { text: string; term: string }) {
  const words = term.split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-[2px] bg-transparent bg-[linear-gradient(transparent_58%,var(--color-accent-soft)_58%)] font-semibold text-ink">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="grid h-5 min-w-5 place-items-center rounded border border-line-strong bg-paper px-1 font-sans text-[0.68rem] font-semibold text-ink-soft">{children}</kbd>;
}

function ResultsSkeleton() {
  return (
    <ul className="grid gap-3" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="flex items-center gap-4 p-2">
          <div className="skeleton h-16 w-16 rounded-lg sm:h-[4.5rem] sm:w-[4.5rem]" />
          <div className="grid flex-1 gap-2">
            <div className="skeleton h-4 w-2/5 rounded" />
            <div className="skeleton h-3 w-1/4 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}
