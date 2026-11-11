'use client';

import { Box, Plus, Search, Star } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCan } from '@/components/staff';
import { Badge, Button, Card, ErrorBox, FilterTabs, Input, Loading, Modal, PageHeader, Pager, Select, StatusBadge, Table, useToast } from '@/components/ui';
import { api, date, inr, message, useApi } from '@/lib/api';

interface Row {
  id: string;
  name: string;
  slug: string;
  status: string;
  category: string;
  minPrice: number;
  variantCount: number;
  available: number;
  image: string | null;
  has3d: boolean;
  featured: boolean;
  ratingAvg: number;
  updatedAt: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const can = useCan();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useApi<{ items: Row[]; page: number; pageCount: number; total: number }>(`/products?page=${page}${status ? `&status=${status}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`);
  const { data: categories } = useApi<{ id: string; name: string; parentId: string | null }[]>('/categories');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', categoryId: '' });
  const [busy, setBusy] = useState(false);

  const catOptions = (categories ?? []).flatMap((c) => (c.parentId ? [] : [c, ...(categories ?? []).filter((x) => x.parentId === c.id)])).map((c) => ({ value: c.id, label: c.parentId ? `— ${c.name}` : c.name }));

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything in the catalogue. Drafts are hidden from the store until published."
        actions={
          can('catalog.write') && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          )
        }
      />
      <div className="mb-4">
        <FilterTabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: '', label: 'All' }, { value: 'ACTIVE', label: 'Live' }, { value: 'DRAFT', label: 'Drafts' }, { value: 'ARCHIVED', label: 'Archived' }]} />
      </div>
      <Card padded={false}>
        <form className="relative border-b border-line p-4" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }}>
          <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name or SKU" aria-label="Search products" className="h-10 w-full max-w-md rounded-lg border border-line-strong pl-9 pr-3 text-[0.86rem]" />
        </form>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data.items}
              rowHref={(r) => `/products/${r.id}`}
              columns={[
                {
                  key: 'p',
                  label: 'Product',
                  render: (r) => (
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-10 shrink-0 overflow-hidden rounded-md bg-canvas">{r.image && <img src={r.image} alt="" className="h-full w-full object-cover" />}</div>
                      <div>
                        <Link href={`/products/${r.id}`} className="flex items-center gap-1.5 font-medium hover:text-accent">
                          {r.name} {r.featured && <Star className="h-3.5 w-3.5 fill-current text-clay" aria-label="Featured" />} {r.has3d && <Box className="h-3.5 w-3.5 text-accent" aria-label="Has 3D model" />}
                        </Link>
                        <p className="text-[0.76rem] text-muted">{r.category} · {r.variantCount} variant{r.variantCount === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                  ),
                },
                { key: 's', label: 'Status', render: (r) => <StatusBadge status={r.status} label={r.status === 'ACTIVE' ? 'Live' : undefined} /> },
                { key: 'st', label: 'Available', className: 'text-right', render: (r) => (r.available <= 0 ? <Badge tone="danger">Out of stock</Badge> : r.available <= 3 ? <Badge tone="warning">{r.available} left</Badge> : <span className="tabular">{r.available}</span>) },
                { key: 'pr', label: 'From', className: 'text-right', render: (r) => <span className="tabular">{inr(r.minPrice)}</span> },
                { key: 'u', label: 'Updated', render: (r) => <span className="text-muted">{date(r.updatedAt)}</span> },
              ]}
              empty={<p className="p-10 text-center text-muted">No products match.</p>}
            />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New product"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={draft.name.trim().length < 2 || !draft.categoryId}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await api<{ id: string }>('/products', { method: 'POST', json: draft });
                  router.push(`/products/${r.id}`);
                } catch (err) {
                  toast(message(err), 'error');
                  setBusy(false);
                }
              }}
            >
              Create draft
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Input label="Product name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Kerala Teak Bench" autoFocus />
          <Select label="Category" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} options={[{ value: '', label: 'Choose a category' }, ...catOptions]} />
          <p className="text-[0.8rem] text-muted">The product starts as a hidden draft. Add images, finishes, prices and stock, then publish.</p>
        </div>
      </Modal>
    </>
  );
}
