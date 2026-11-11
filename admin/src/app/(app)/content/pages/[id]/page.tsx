'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ImageKeyField } from '@/components/MediaPicker';
import { Badge, Button, Card, ErrorBox, Input, Loading, PageHeader, Select, StatusBadge, Textarea, useToast } from '@/components/ui';
import { api, message, storefront, useApi } from '@/lib/api';

type Data = Record<string, any>;
interface Block { id: string; type: string; data: Data }
interface Page {
  id: string;
  type: 'HOME' | 'STATIC' | 'POLICY' | 'GUIDE' | 'FAQ';
  slug: string;
  title: string;
  excerpt: string | null;
  coverKey: string | null;
  authorName: string | null;
  blocks: Block[];
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  seoTitle: string | null;
  seoDescription: string | null;
}

// ── Field definitions for each block type ──
type Field =
  | { key: string; label: string; kind: 'text' | 'textarea' | 'image' | 'video' | 'number'; hint?: string }
  | { key: string; label: string; kind: 'select'; options: { value: string; label: string }[] | 'collections' | 'looks' }
  | { key: string; label: string; kind: 'link' }
  | { key: string; label: string; kind: 'list'; item: Field[]; max: number; add: Data };

const BLOCKS: Record<string, { label: string; home?: boolean; page?: boolean; fields: Field[]; defaults: Data }> = {
  HERO: {
    label: 'Hero', home: true,
    fields: [
      { key: 'eyebrow', label: 'Small heading', kind: 'text' },
      { key: 'title', label: 'Headline', kind: 'text' },
      { key: 'subtitle', label: 'Sub-heading', kind: 'textarea' },
      { key: 'imageKey', label: 'Image (also the video poster)', kind: 'image' },
      { key: 'videoKey', label: 'Background video (optional)', kind: 'video', hint: 'Loads after the page is ready; never for visitors who prefer reduced motion or save data. Keep it under 1.5 MB.' },
      { key: 'ctaPrimary', label: 'Main button', kind: 'link' },
      { key: 'ctaSecondary', label: 'Second button', kind: 'link' },
    ],
    defaults: { title: '', ctaPrimary: { label: 'Shop by room', href: '/rooms' } },
  },
  ROOMS: { label: 'Shop by room', home: true, fields: [{ key: 'eyebrow', label: 'Small heading', kind: 'text' }, { key: 'title', label: 'Heading', kind: 'text' }, { key: 'subtitle', label: 'Sub-heading', kind: 'textarea' }], defaults: { title: 'Start with the room' } },
  COLLECTION_STORY: {
    label: 'Collection story', home: true,
    fields: [
      { key: 'collectionSlug', label: 'Collection', kind: 'select', options: 'collections' },
      { key: 'eyebrow', label: 'Small heading', kind: 'text' },
      { key: 'title', label: 'Heading', kind: 'text' },
      { key: 'body', label: 'Text', kind: 'textarea' },
      { key: 'imageKey', label: 'Main image', kind: 'image' },
      { key: 'secondaryImageKey', label: 'Detail image', kind: 'image' },
    ],
    defaults: { title: '' },
  },
  LOOK: { label: 'Shop the look', home: true, fields: [{ key: 'lookSlug', label: 'Look', kind: 'select', options: 'looks' }, { key: 'eyebrow', label: 'Small heading', kind: 'text' }, { key: 'title', label: 'Heading', kind: 'text' }, { key: 'subtitle', label: 'Sub-heading', kind: 'text' }], defaults: { eyebrow: 'Shop the room', title: '' } },
  PRODUCT_RAIL: {
    label: 'Product rail', home: true,
    fields: [
      { key: 'eyebrow', label: 'Small heading', kind: 'text' },
      { key: 'title', label: 'Heading', kind: 'text' },
      { key: 'source', label: 'Products', kind: 'select', options: [{ value: 'featured', label: 'Featured' }, { value: 'bestsellers', label: 'Best selling' }, { value: 'new', label: 'Newest' }, { value: 'collection', label: 'From a collection' }] },
      { key: 'collectionSlug', label: 'Collection (when “From a collection”)', kind: 'select', options: 'collections' },
      { key: 'limit', label: 'How many', kind: 'number' },
      { key: 'href', label: '“Shop all” link', kind: 'text' },
    ],
    defaults: { title: '', source: 'featured', limit: 8, href: '/shop' },
  },
  MATERIALS: {
    label: 'Materials (three cards)', home: true,
    fields: [
      { key: 'eyebrow', label: 'Small heading', kind: 'text' },
      { key: 'title', label: 'Heading', kind: 'text' },
      { key: 'items', label: 'Cards', kind: 'list', max: 3, add: { title: '', body: '' }, item: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Text', kind: 'textarea' }, { key: 'imageKey', label: 'Image', kind: 'image' }] },
    ],
    defaults: { title: '', items: [] },
  },
  PROMISE: {
    label: 'Promise strip', home: true,
    fields: [{ key: 'items', label: 'Promises', kind: 'list', max: 4, add: { title: '', body: '', icon: 'shield' }, item: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Text', kind: 'text' }, { key: 'icon', label: 'Icon', kind: 'select', options: [{ value: 'calendar', label: 'Calendar' }, { value: 'wrench', label: 'Wrench' }, { value: 'rotate', label: 'Return arrow' }, { value: 'shield', label: 'Shield' }] }] }],
    defaults: { items: [] },
  },
  REVIEWS: { label: 'Customer reviews', home: true, fields: [{ key: 'eyebrow', label: 'Small heading', kind: 'text' }, { key: 'title', label: 'Heading', kind: 'text' }], defaults: { title: 'What customers say' } },
  GUIDES: { label: 'Buying guides', home: true, fields: [{ key: 'eyebrow', label: 'Small heading', kind: 'text' }, { key: 'title', label: 'Heading', kind: 'text' }, { key: 'limit', label: 'How many', kind: 'number' }], defaults: { title: 'Choose with confidence', limit: 3 } },
  NEWSLETTER: { label: 'Newsletter sign-up', home: true, fields: [{ key: 'title', label: 'Heading', kind: 'text' }, { key: 'body', label: 'Text', kind: 'textarea' }], defaults: { title: 'New pieces, first', body: '' } },
  RICH_TEXT: { label: 'Text', page: true, fields: [{ key: 'body', label: 'Text', kind: 'textarea', hint: 'Use ## for a heading, - for a bullet, 1. for a numbered list, **bold**, and [link text](/path).' }], defaults: { body: '' } },
  FAQ: {
    label: 'Questions and answers', page: true,
    fields: [{ key: 'title', label: 'Group heading', kind: 'text' }, { key: 'items', label: 'Questions', kind: 'list', max: 30, add: { q: '', a: '' }, item: [{ key: 'q', label: 'Question', kind: 'text' }, { key: 'a', label: 'Answer', kind: 'textarea' }] }],
    defaults: { title: '', items: [] },
  },
};

export default function PageEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data, error } = useApi<Page>(`/pages/${id}`);
  const { data: collections } = useApi<{ slug: string; name: string }[]>('/collections');
  const { data: looks } = useApi<{ slug: string; name: string }[]>('/looks');
  const [p, setP] = useState<Page | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setP(structuredClone(data));
      setDirty(false);
    }
  }, [data]);

  if (error) return <ErrorBox message={error} />;
  if (!p) return <Loading rows={10} />;

  const isHome = p.type === 'HOME';
  const set = (patch: Partial<Page>) => {
    setP({ ...p, ...patch });
    setDirty(true);
  };
  const setBlock = (i: number, data: Data) => set({ blocks: p.blocks.map((b, j) => (j === i ? { ...b, data } : b)) });
  const move = (i: number, d: number) => {
    const b = [...p.blocks];
    [b[i], b[i + d]] = [b[i + d], b[i]];
    set({ blocks: b });
  };
  const available = Object.entries(BLOCKS).filter(([, def]) => (isHome ? def.home : def.page));
  const path = isHome ? '/' : p.type === 'GUIDE' ? `/guides/${p.slug}` : p.type === 'POLICY' ? `/policies/${p.slug}` : `/${p.slug}`;

  const save = async (status?: Page['status']) => {
    setBusy(true);
    try {
      const saved = await api<Page>(`/pages/${p.id}`, { method: 'PUT', json: { ...p, status: status ?? p.status, excerpt: p.excerpt || null, coverKey: p.coverKey || null, authorName: p.authorName || null, seoTitle: p.seoTitle || null, seoDescription: p.seoDescription || null } });
      setP(saved);
      setDirty(false);
      toast(status === 'ACTIVE' ? 'Published' : 'Saved. The store refreshes within a minute.');
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const optionsFor = (o: Extract<Field, { kind: 'select' }>['options']) =>
    o === 'collections' ? [{ value: '', label: 'Choose…' }, ...(collections ?? []).map((c) => ({ value: c.slug, label: c.name }))] : o === 'looks' ? [{ value: '', label: 'Choose…' }, ...(looks ?? []).map((l) => ({ value: l.slug, label: l.name }))] : o;

  const renderField = (f: Field, value: Data, onChange: (v: Data) => void): React.ReactNode => {
    const v = value[f.key];
    switch (f.kind) {
      case 'text':
        return <Input key={f.key} label={f.label} value={v ?? ''} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} hint={f.hint} />;
      case 'number':
        return <Input key={f.key} label={f.label} type="number" min={1} max={24} value={v ?? ''} onChange={(e) => onChange({ ...value, [f.key]: Number(e.target.value) })} />;
      case 'textarea':
        return <Textarea key={f.key} label={f.label} value={v ?? ''} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} rows={f.key === 'body' && !isHome ? 16 : 3} hint={f.hint} className={f.key === 'body' && !isHome ? 'font-mono' : undefined} />;
      case 'image':
        return <ImageKeyField key={f.key} label={f.label} value={v} onChange={(k) => onChange({ ...value, [f.key]: k })} />;
      case 'video':
        return (
          <div key={f.key} className="grid gap-1">
            <ImageKeyField label={f.label} kind="VIDEO" value={v} onChange={(k) => onChange({ ...value, [f.key]: k })} />
            {f.hint && <p className="text-[0.76rem] text-muted">{f.hint}</p>}
          </div>
        );
      case 'select':
        return <Select key={f.key} label={f.label} value={v ?? ''} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} options={optionsFor(f.options)} />;
      case 'link':
        return (
          <div key={f.key} className="grid grid-cols-2 gap-2">
            <Input label={`${f.label}: text`} value={v?.label ?? ''} onChange={(e) => onChange({ ...value, [f.key]: e.target.value ? { label: e.target.value, href: v?.href ?? '/' } : null })} />
            <Input label="Links to" value={v?.href ?? ''} onChange={(e) => onChange({ ...value, [f.key]: { label: v?.label ?? '', href: e.target.value } })} placeholder="/rooms" />
          </div>
        );
      case 'list': {
        const items: Data[] = v ?? [];
        return (
          <div key={f.key} className="grid gap-3">
            <p className="text-[0.78rem] font-medium text-ink-soft">{f.label}</p>
            {items.map((item, i) => (
              <div key={i} className="grid gap-3 rounded-lg border border-line bg-canvas/50 p-3">
                <div className="flex justify-between text-[0.74rem] text-muted">
                  <span>{i + 1}</span>
                  <button type="button" onClick={() => onChange({ ...value, [f.key]: items.filter((_, j) => j !== i) })} aria-label="Remove item" className="hover:text-danger"><X className="h-4 w-4" /></button>
                </div>
                {f.item.map((sub) => renderField(sub, item, (next) => onChange({ ...value, [f.key]: items.map((x, j) => (j === i ? next : x)) })))}
              </div>
            ))}
            {items.length < f.max && <Button size="sm" type="button" className="justify-self-start" onClick={() => onChange({ ...value, [f.key]: [...items, { ...f.add }] })}><Plus className="h-4 w-4" /> Add</Button>}
          </div>
        );
      }
    }
  };

  return (
    <>
      <PageHeader
        back={{ href: '/content/pages', label: 'Pages' }}
        title={<span className="flex items-center gap-3">{isHome ? 'Homepage' : p.title} <StatusBadge status={p.status} label={p.status === 'ACTIVE' ? 'Live' : undefined} /></span>}
        description={dirty ? 'Unsaved changes' : 'All changes saved'}
        actions={
          <>
            <a href={`${storefront}${path}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 px-3 text-[0.86rem] text-muted hover:text-ink"><ExternalLink className="h-4 w-4" /> View</a>
            {!isHome && p.status !== 'ACTIVE' && <Button variant="accent" onClick={() => save('ACTIVE')} loading={busy}>Publish</Button>}
            {!isHome && p.status === 'ACTIVE' && <Button onClick={() => save('DRAFT')} loading={busy}>Unpublish</Button>}
            <Button variant="primary" onClick={() => save()} loading={busy} disabled={!dirty}>Save</Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid content-start gap-3 xl:col-span-2">
          {p.blocks.map((b, i) => {
            const def = BLOCKS[b.type];
            const hidden = Boolean(b.data.hidden);
            const summary: string = b.data.title || (b.data.body ? `${String(b.data.body).slice(0, 80)}…` : Array.isArray(b.data.items) ? `${b.data.items.length} items` : '');
            return (
              <div key={b.id} className={clsx('card overflow-hidden', hidden && 'opacity-60')}>
                <div className="flex items-center gap-2 px-4 py-3">
                  <button type="button" onClick={() => setOpen(open === b.id ? null : b.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <ChevronDown className={clsx('h-4 w-4 shrink-0 transition-transform', open === b.id && 'rotate-180')} />
                    <Badge tone="accent">{def?.label ?? b.type}</Badge>
                    <span className="truncate text-[0.86rem] text-ink-soft">{summary}</span>
                  </button>
                  {isHome && (
                    <button type="button" onClick={() => setBlock(i, { ...b.data, hidden: !hidden })} className="grid h-8 w-8 place-items-center text-muted hover:text-ink" aria-label={hidden ? 'Show section' : 'Hide section'} title={hidden ? 'Hidden on the store' : 'Visible'}>
                      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center text-muted disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" disabled={i === p.blocks.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center text-muted disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" onClick={() => set({ blocks: p.blocks.filter((_, j) => j !== i) })} className="grid h-8 w-8 place-items-center text-muted hover:text-danger" aria-label="Delete section"><Trash2 className="h-4 w-4" /></button>
                </div>
                {open === b.id && def && <div className="grid gap-4 border-t border-line p-4">{def.fields.map((f) => renderField(f, b.data, (d) => setBlock(i, d)))}</div>}
              </div>
            );
          })}
          <div className="card flex flex-wrap items-center gap-2 border-dashed p-4">
            <span className="text-[0.84rem] text-muted">Add a section:</span>
            {available.map(([type, def]) => (
              <Button
                key={type}
                size="sm"
                type="button"
                onClick={() => {
                  const id = `${type.toLowerCase()}-${Date.now().toString(36)}`;
                  set({ blocks: [...p.blocks, { id, type, data: structuredClone(def.defaults) }] });
                  setOpen(id);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> {def.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid content-start gap-6">
          {!isHome && (
            <Card title="Page details">
              <div className="grid gap-4">
                <Input label="Title" value={p.title} onChange={(e) => set({ title: e.target.value })} />
                <Input label="URL slug" value={p.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} hint={path} />
                <Textarea label="Summary" value={p.excerpt ?? ''} onChange={(e) => set({ excerpt: e.target.value })} hint="Shown on guide cards and under the title." />
                {p.type === 'GUIDE' && (
                  <>
                    <ImageKeyField label="Cover image" value={p.coverKey} onChange={(k) => set({ coverKey: k })} />
                    <Input label="Author" value={p.authorName ?? ''} onChange={(e) => set({ authorName: e.target.value })} />
                  </>
                )}
              </div>
            </Card>
          )}
          <Card title="Search engines">
            <div className="grid gap-4">
              <Input label="Page title" value={p.seoTitle ?? ''} maxLength={70} onChange={(e) => set({ seoTitle: e.target.value })} hint={`${(p.seoTitle ?? '').length}/70`} />
              <Textarea label="Description" value={p.seoDescription ?? ''} maxLength={170} onChange={(e) => set({ seoDescription: e.target.value })} hint={`${(p.seoDescription ?? '').length}/170`} />
            </div>
          </Card>
          {!isHome && (
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api(`/pages/${p.id}`, { method: 'DELETE' });
                  toast('Page deleted');
                  router.push('/content/pages');
                } catch (err) {
                  toast(message(err), 'error');
                }
              }}
            >
              Delete page
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
