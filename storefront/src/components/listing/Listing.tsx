'use client';

import clsx from 'clsx';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type CSSProperties, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { call } from '@/lib/client';
import { inr, plural } from '@/lib/format';
import type { ProductCard as Card, ProductList } from '@/lib/types';
import { ProductCard } from '../product/ProductCard';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/misc';
import { Sheet } from '../ui/Sheet';

const SORTS = [
  { value: 'featured', label: 'Recommended' },
  { value: 'bestselling', label: 'Best selling' },
  { value: 'new', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
];

const PRICE_BANDS = [
  { label: 'Under ₹10,000', min: 0, max: 1_000_000 },
  { label: '₹10,000 – ₹40,000', min: 1_000_000, max: 4_000_000 },
  { label: '₹40,000 – ₹80,000', min: 4_000_000, max: 8_000_000 },
  { label: 'Above ₹80,000', min: 8_000_000, max: undefined },
];

const FILTER_KEYS = ['material', 'finish', 'seating', 'style', 'minPrice', 'maxPrice', 'maxWidth', 'inStock'];

/** `base` holds the fixed scope of the page (category, room, collection or q). */
export function Listing({ data, base, emptyHint }: { data: ProductList; base: Record<string, string>; emptyHint?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [items, setItems] = useState<Card[]>(data.items);
  const [page, setPage] = useState(data.page);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheet, setSheet] = useState<null | 'filter' | 'sort'>(null);

  useEffect(() => {
    setItems(data.items);
    setPage(data.page);
  }, [data]);

  const selected = (key: string) => params.get(key)?.split(',').filter(Boolean) ?? [];
  const activeCount = FILTER_KEYS.filter((k) => params.get(k)).length;

  const navigate = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete('page');
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const toggle = (key: string, value: string) =>
    navigate((p) => {
      const cur = p.get(key)?.split(',').filter(Boolean) ?? [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      if (next.length) p.set(key, next.join(','));
      else p.delete(key);
    });

  const setValue = (key: string, value: string | null) =>
    navigate((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });

  const clearAll = () => navigate((p) => FILTER_KEYS.forEach((k) => p.delete(k)));

  const loadMore = async () => {
    setLoadingMore(true);
    const q = new URLSearchParams({ ...base, ...Object.fromEntries(params.entries()), page: String(page + 1) });
    try {
      const next = await call<ProductList>(`/store/products?${q.toString()}`);
      setItems((prev) => [...prev, ...next.items]);
      setPage(next.page);
      const url = new URLSearchParams(params.toString());
      url.set('page', String(next.page));
      window.history.replaceState(null, '', `${pathname}?${url.toString()}`);
    } finally {
      setLoadingMore(false);
    }
  };

  const chips = useMemo(() => {
    const out: { label: string; remove: () => void }[] = [];
    for (const key of ['material', 'finish', 'seating', 'style']) {
      for (const v of selected(key)) out.push({ label: v, remove: () => toggle(key, v) });
    }
    if (params.get('minPrice') || params.get('maxPrice')) {
      const min = Number(params.get('minPrice') ?? 0);
      const max = params.get('maxPrice');
      out.push({ label: max ? `${inr(min)} – ${inr(Number(max))}` : `Above ${inr(min)}`, remove: () => navigate((p) => { p.delete('minPrice'); p.delete('maxPrice'); }) });
    }
    if (params.get('maxWidth')) out.push({ label: `Fits ${params.get('maxWidth')} cm`, remove: () => setValue('maxWidth', null) });
    if (params.get('inStock')) out.push({ label: 'In stock', remove: () => setValue('inStock', null) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const sort = params.get('sort') ?? (base.q ? 'relevance' : 'featured');
  const sorts = base.q ? [{ value: 'relevance', label: 'Most relevant' }, ...SORTS] : SORTS;
  const facets = data.facets;
  const filterPanels = (
    <FacetPanels facets={facets} selected={selected} toggle={toggle} params={params} setValue={setValue} navigate={navigate} />
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-[4.5rem] z-30 -mx-[clamp(1rem,4vw,3rem)] border-y border-line bg-paper/92 px-[clamp(1rem,4vw,3rem)] backdrop-blur-xl">
        <div className="flex h-14 items-center gap-2">
          <div className="hidden items-center gap-1 lg:flex">
            {facets.attributes.map((a) => (
              <Dropdown key={a.key} label={a.label} count={selected(a.key).length}>
                <div className="grid max-h-80 gap-1 overflow-y-auto">
                  {a.values.map((v) => (
                    <CheckRow key={v.value} label={v.value} count={v.count} checked={selected(a.key).includes(v.value)} onChange={() => toggle(a.key, v.value)} />
                  ))}
                </div>
              </Dropdown>
            ))}
            {facets.finishes.length > 0 && (
              <Dropdown label="Finish" count={selected('finish').length} wide>
                <div className="grid max-h-80 grid-cols-2 gap-1 overflow-y-auto">
                  {facets.finishes.map((f) => (
                    <CheckRow key={f.value} label={f.value} count={f.count} swatch={f.hex} checked={selected('finish').includes(f.value)} onChange={() => toggle('finish', f.value)} />
                  ))}
                </div>
              </Dropdown>
            )}
            <Dropdown label="Price" count={params.get('minPrice') || params.get('maxPrice') ? 1 : 0}>
              <PricePanel params={params} navigate={navigate} />
            </Dropdown>
            <Dropdown label="Size" count={params.get('maxWidth') ? 1 : 0}>
              <WidthPanel value={params.get('maxWidth')} onChange={(v) => setValue('maxWidth', v)} />
            </Dropdown>
            <label className="ml-1 flex cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-[0.86rem] hover:bg-ink/[0.05]">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={Boolean(params.get('inStock'))} onChange={(e) => setValue('inStock', e.target.checked ? '1' : null)} />
              In stock
            </label>
          </div>

          <button onClick={() => setSheet('filter')} className="flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-[0.86rem] lg:hidden">
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} /> Filter{activeCount ? ` (${activeCount})` : ''}
          </button>
          <button onClick={() => setSheet('sort')} className="flex items-center gap-2 rounded-full border border-line-strong px-4 py-2 text-[0.86rem] lg:hidden">
            Sort
          </button>

          <div className="ml-auto flex items-center gap-4">
            <p className="hidden text-[0.85rem] text-muted sm:block" aria-live="polite">
              {pending ? 'Updating…' : plural(data.total, 'piece')}
            </p>
            <label className="hidden items-center gap-2 text-[0.86rem] lg:flex">
              <span className="text-muted">Sort</span>
              <select value={sort} onChange={(e) => setValue('sort', e.target.value === 'featured' ? null : e.target.value)} className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[0.86rem]">
                {sorts.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button key={c.label} onClick={c.remove} className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[0.8rem] text-paper hover:bg-accent" aria-label={`Remove filter ${c.label}`}>
              {c.label} <X className="h-3.5 w-3.5" />
            </button>
          ))}
          <button onClick={clearAll} className="link-underline ml-1 text-[0.82rem] text-muted hover:text-ink">
            Clear all
          </button>
        </div>
      )}

      {/* Results */}
      <div className={clsx('mt-8 transition-opacity duration-300', pending && 'opacity-50')}>
        {items.length === 0 ? (
          <EmptyState
            title={activeCount ? 'No pieces match these filters' : 'Nothing here yet'}
            body={activeCount ? 'Try removing a filter or widening the price range.' : emptyHint}
            action={activeCount ? <Button onClick={clearAll} variant="secondary">Clear filters</Button> : <Link href="/shop" className="link-underline">Shop all furniture</Link>}
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4">
            {items.map((p, i) => (
              <ProductCard key={`${p.id}-${i}`} product={p} priority={i < 4} className={i < 4 ? undefined : 'reveal'} style={{ '--reveal-delay': `${(i % 4) * 70}ms` } as CSSProperties} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination: load more for people, numbered links for crawlers */}
      {items.length > 0 && (
        <div className="mt-14 grid justify-items-center gap-4">
          <p className="text-[0.85rem] text-muted">
            Showing {items.length} of {data.total}
          </p>
          {page < data.pageCount && (
            <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
              Load more
            </Button>
          )}
          {data.pageCount > 1 && (
            <nav aria-label="Pages" className="flex gap-1 text-[0.82rem] text-muted">
              {Array.from({ length: data.pageCount }, (_, i) => i + 1).map((n) => {
                const q = new URLSearchParams(params.toString());
                if (n === 1) q.delete('page');
                else q.set('page', String(n));
                return (
                  <Link key={n} href={`${pathname}${q.toString() ? `?${q}` : ''}`} aria-current={n === data.page ? 'page' : undefined} className={clsx('grid h-8 w-8 place-items-center rounded-full', n === data.page ? 'bg-ink text-paper' : 'hover:bg-ink/[0.06]')}>
                    {n}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
      )}

      <Sheet
        open={sheet === 'filter'}
        onClose={() => setSheet(null)}
        title="Filter"
        side="bottom"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={clearAll}>
              Clear all
            </Button>
            <Button className="flex-1" onClick={() => setSheet(null)}>
              Show {plural(data.total, 'piece')}
            </Button>
          </div>
        }
      >
        <div className="px-5 py-2">{filterPanels}</div>
      </Sheet>
      <Sheet open={sheet === 'sort'} onClose={() => setSheet(null)} title="Sort by" side="bottom">
        <div className="grid gap-1 px-5 py-4 pb-8">
          {sorts.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setValue('sort', s.value === 'featured' ? null : s.value);
                setSheet(null);
              }}
              className={clsx('flex items-center justify-between rounded-md px-3 py-3 text-left', sort === s.value ? 'bg-ink text-paper' : 'hover:bg-ink/[0.05]')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function FacetPanels({ facets, selected, toggle, params, setValue, navigate }: {
  facets: ProductList['facets'];
  selected: (k: string) => string[];
  toggle: (k: string, v: string) => void;
  params: URLSearchParams;
  setValue: (k: string, v: string | null) => void;
  navigate: (m: (p: URLSearchParams) => void) => void;
}) {
  return (
    <div className="divide-y divide-line">
      {facets.attributes.map((a) => (
        <details key={a.key} className="group py-2" open={selected(a.key).length > 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between py-2 font-medium">
            {a.label}
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-1 pb-2">
            {a.values.map((v) => (
              <CheckRow key={v.value} label={v.value} count={v.count} checked={selected(a.key).includes(v.value)} onChange={() => toggle(a.key, v.value)} />
            ))}
          </div>
        </details>
      ))}
      {facets.finishes.length > 0 && (
        <details className="group py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between py-2 font-medium">
            Finish <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid grid-cols-2 gap-1 pb-2">
            {facets.finishes.map((f) => (
              <CheckRow key={f.value} label={f.value} swatch={f.hex} count={f.count} checked={selected('finish').includes(f.value)} onChange={() => toggle('finish', f.value)} />
            ))}
          </div>
        </details>
      )}
      <details className="group py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between py-2 font-medium">
          Price <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="pb-3">
          <PricePanel params={params} navigate={navigate} />
        </div>
      </details>
      <details className="group py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between py-2 font-medium">
          Size <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="pb-3">
          <WidthPanel value={params.get('maxWidth')} onChange={(v) => setValue('maxWidth', v)} />
        </div>
      </details>
      <label className="flex items-center justify-between py-4 font-medium">
        In stock only
        <input type="checkbox" className="h-5 w-5 accent-[var(--color-accent)]" checked={Boolean(params.get('inStock'))} onChange={(e) => setValue('inStock', e.target.checked ? '1' : null)} />
      </label>
    </div>
  );
}

function PricePanel({ params, navigate }: { params: URLSearchParams; navigate: (m: (p: URLSearchParams) => void) => void }) {
  const min = params.get('minPrice');
  const max = params.get('maxPrice');
  return (
    <div className="grid gap-1">
      {PRICE_BANDS.map((b) => {
        const active = String(b.min) === (min ?? '0') && (b.max ? String(b.max) === max : !max) && Boolean(min || max);
        return (
          <CheckRow
            key={b.label}
            label={b.label}
            checked={active}
            radio
            onChange={() =>
              navigate((p) => {
                if (active) {
                  p.delete('minPrice');
                  p.delete('maxPrice');
                  return;
                }
                p.set('minPrice', String(b.min));
                if (b.max) p.set('maxPrice', String(b.max));
                else p.delete('maxPrice');
              })
            }
          />
        );
      })}
    </div>
  );
}

function WidthPanel({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [w, setW] = useState(value ?? '');
  return (
    <form
      className="grid w-64 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onChange(w ? String(Math.round(Number(w))) : null);
      }}
    >
      <label className="grid gap-1.5 text-[0.85rem] text-ink-soft">
        Must fit within (width, cm)
        <div className="flex gap-2">
          <input type="number" min={20} max={600} inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} placeholder="e.g. 200" className="h-10 w-full rounded-md border border-line-strong bg-surface px-3" />
          <Button size="sm" type="submit" className="h-10">
            Apply
          </Button>
        </div>
      </label>
      <p className="text-[0.78rem] text-muted">Measure your wall and leave about 10 cm each side.</p>
    </form>
  );
}

function CheckRow({ label, count, checked, onChange, swatch, radio }: { label: string; count?: number; checked: boolean; onChange: () => void; swatch?: string | null; radio?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-[0.9rem] hover:bg-ink/[0.04]">
      <input type={radio ? 'radio' : 'checkbox'} checked={checked} onChange={onChange} className="h-4 w-4 accent-[var(--color-accent)]" />
      {swatch && <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: swatch }} aria-hidden />}
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-[0.78rem] text-muted tabular">{count}</span>}
    </label>
  );
}

function Dropdown({ label, count, children, wide }: { label: string; count: number; children: React.ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className={clsx('flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[0.86rem] transition-colors', open || count ? 'bg-ink/[0.07]' : 'hover:bg-ink/[0.05]')}>
        {label}
        {count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[0.68rem] text-paper">{count}</span>}
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className={clsx('absolute left-0 top-full z-40 mt-2 rounded-xl border border-line bg-paper p-3 shadow-[0_20px_50px_rgb(0_0_0/0.14)] animate-[fade-in_.18s_ease-out]', wide ? 'w-96' : 'w-72')}>
          {children}
        </div>
      )}
    </div>
  );
}
