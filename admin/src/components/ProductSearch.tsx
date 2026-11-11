'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface ProductHit {
  id: string;
  name: string;
  image: string | null;
  status: string;
}

/** Type-ahead search over the catalogue; picks one product. */
export function ProductSearch({ onPick, exclude = [], placeholder = 'Search products to add' }: { onPick: (p: ProductHit) => void; exclude?: string[]; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const t = setTimeout(() => {
      api<{ items: ProductHit[] }>(`/products?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setHits(r.items.filter((h) => !exclude.includes(h.id)).slice(0, 8)))
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, exclude]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[0.86rem]"
      />
      {open && hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(h);
                  setQ('');
                  setHits([]);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-[0.84rem] hover:bg-canvas"
              >
                <span className="h-9 w-8 shrink-0 overflow-hidden rounded bg-canvas">{h.image && <img src={h.image} alt="" className="h-full w-full object-cover" />}</span>
                <span className="flex-1">{h.name}</span>
                {h.status !== 'ACTIVE' && <span className="text-[0.72rem] text-muted">{h.status.toLowerCase()}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
