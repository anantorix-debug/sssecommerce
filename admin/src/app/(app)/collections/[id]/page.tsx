'use client';

import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ImageKeyField } from '@/components/MediaPicker';
import { ProductSearch } from '@/components/ProductSearch';
import { useCan } from '@/components/staff';
import { Button, Card, ErrorBox, Input, Loading, PageHeader, Select, StatusBadge, Textarea, useToast } from '@/components/ui';
import { api, message, storefront, useApi } from '@/lib/api';

interface Collection {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  intro: string | null;
  heroKey: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  sort: number;
  seoTitle: string | null;
  seoDescription: string | null;
  story: { title: string; body: string; imageKey?: string | null }[];
  products: { id: string; name: string; status: string }[];
}

export default function CollectionEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const can = useCan();
  const toast = useToast();
  const { data, error } = useApi<Collection>(`/collections/${id}`);
  const [c, setC] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setC(structuredClone(data));
  }, [data]);

  if (error) return <ErrorBox message={error} />;
  if (!c) return <Loading rows={10} />;
  const set = (patch: Partial<Collection>) => setC({ ...c, ...patch });
  const move = (i: number, d: number) => {
    const s = [...c.story];
    [s[i], s[i + d]] = [s[i + d], s[i]];
    set({ story: s });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api(`/collections/${c.id}`, {
        method: 'PATCH',
        json: { name: c.name, slug: c.slug, tagline: c.tagline || null, intro: c.intro || null, heroKey: c.heroKey || null, status: c.status, sort: c.sort, seoTitle: c.seoTitle || null, seoDescription: c.seoDescription || null, story: c.story.map((s) => ({ title: s.title, body: s.body, imageKey: s.imageKey || null })), productIds: c.products.map((p) => p.id) },
      });
      toast('Collection saved');
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        back={{ href: '/collections', label: 'Collections' }}
        title={<span className="flex items-center gap-3">{c.name} <StatusBadge status={c.status} label={c.status === 'ACTIVE' ? 'Live' : undefined} /></span>}
        actions={
          <>
            {c.status === 'ACTIVE' && <a href={`${storefront}/collections/${c.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 px-3 text-[0.86rem] text-muted hover:text-ink"><ExternalLink className="h-4 w-4" /> View</a>}
            {can('catalog.write') && <Button variant="primary" onClick={save} loading={busy}>Save</Button>}
          </>
        }
      />
      <fieldset disabled={!can('catalog.write')} className="grid gap-6 xl:grid-cols-3">
        <div className="grid content-start gap-6 xl:col-span-2">
          <Card title="Details">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Name" value={c.name} onChange={(e) => set({ name: e.target.value })} />
              <Input label="URL slug" value={c.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} />
              <Input label="Tagline" value={c.tagline ?? ''} onChange={(e) => set({ tagline: e.target.value })} className="md:col-span-2" />
              <Textarea label="Introduction" value={c.intro ?? ''} onChange={(e) => set({ intro: e.target.value })} className="md:col-span-2" />
              <ImageKeyField label="Hero image" value={c.heroKey} onChange={(k) => set({ heroKey: k })} />
              <Select label="Status" value={c.status} onChange={(e) => set({ status: e.target.value as Collection['status'] })} options={[{ value: 'DRAFT', label: 'Draft (hidden)' }, { value: 'ACTIVE', label: 'Live' }, { value: 'ARCHIVED', label: 'Archived' }]} />
            </div>
          </Card>
          <Card title="Scroll story" actions={<Button size="sm" type="button" onClick={() => set({ story: [...c.story, { title: '', body: '', imageKey: null }] })} disabled={c.story.length >= 8}><Plus className="h-4 w-4" /> Add chapter</Button>}>
            <p className="mb-4 text-[0.8rem] text-muted">Chapters scroll past on the collection page, alternating image left and right. Two to four chapters work best.</p>
            <ol className="grid gap-4">
              {c.story.map((s, i) => (
                <li key={i} className="grid gap-3 rounded-lg border border-line p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-muted">Chapter {i + 1}</span>
                    <div className="flex">
                      <button type="button" className="grid h-8 w-8 place-items-center text-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" className="grid h-8 w-8 place-items-center text-muted disabled:opacity-30" disabled={i === c.story.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" className="grid h-8 w-8 place-items-center text-muted hover:text-danger" onClick={() => set({ story: c.story.filter((_, j) => j !== i) })} aria-label="Remove chapter"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <Input label="Heading" value={s.title} onChange={(e) => set({ story: c.story.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <Textarea label="Text" value={s.body} onChange={(e) => set({ story: c.story.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) })} />
                  <ImageKeyField label="Image" value={s.imageKey} onChange={(k) => set({ story: c.story.map((x, j) => (j === i ? { ...x, imageKey: k } : x)) })} />
                </li>
              ))}
            </ol>
          </Card>
        </div>
        <div className="grid content-start gap-6">
          <Card title={`Products (${c.products.length})`}>
            <div className="grid gap-3">
              <ProductSearch exclude={c.products.map((p) => p.id)} onPick={(p) => set({ products: [...c.products, { id: p.id, name: p.name, status: p.status }] })} />
              <ul className="grid gap-1">
                {c.products.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[0.84rem] hover:bg-canvas">
                    <span>{p.name}</span>
                    <button type="button" className="text-muted hover:text-danger" onClick={() => set({ products: c.products.filter((x) => x.id !== p.id) })} aria-label={`Remove ${p.name}`}><X className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          <Card title="Search engines">
            <div className="grid gap-4">
              <Input label="Page title" value={c.seoTitle ?? ''} maxLength={70} onChange={(e) => set({ seoTitle: e.target.value })} />
              <Textarea label="Description" value={c.seoDescription ?? ''} maxLength={170} onChange={(e) => set({ seoDescription: e.target.value })} />
            </div>
          </Card>
          {can('catalog.write') && (
            <Button
              variant="danger"
              type="button"
              onClick={async () => {
                try {
                  await api(`/collections/${c.id}`, { method: 'DELETE' });
                  toast('Collection deleted');
                  router.push('/collections');
                } catch (err) {
                  toast(message(err), 'error');
                }
              }}
            >
              Delete collection
            </Button>
          )}
        </div>
      </fieldset>
    </>
  );
}
