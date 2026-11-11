'use client';

import clsx from 'clsx';
import { ArrowDown, ArrowUp, Box, ExternalLink, ImagePlus, Plus, Trash2, Wand2, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MediaPicker, MediaThumb, type MediaAsset } from '@/components/MediaPicker';
import { useCan } from '@/components/staff';
import { Badge, Button, Card, ErrorBox, Input, Loading, MoneyInput, PageHeader, Select, StatusBadge, Textarea, Toggle, useToast } from '@/components/ui';
import { api, ApiError, message, storefront, useApi } from '@/lib/api';

type Role = 'GALLERY' | 'LIFESTYLE' | 'DIMENSION' | 'DETAIL' | 'MODEL_3D' | 'MODEL_POSTER';
interface OptionValue { id?: string; ref: string; value: string; swatchHex: string | null; modelVariant: string | null }
interface Option { id?: string; ref: string; name: string; values: OptionValue[] }
interface Variant {
  id?: string;
  sku: string;
  title: string;
  price: number;
  mrp: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number | null;
  leadTimeDays: number;
  maxPerOrder: number;
  isDefault: boolean;
  active: boolean;
  optionRefs: string[];
  onHand?: number;
  reserved?: number;
  hasOrders?: boolean;
}
interface Media { mediaId: string; role: Role; optionRef: string | null; kind: string; url: string; altText: string | null }
interface Product {
  id: string;
  name: string;
  slug: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  categoryId: string;
  brand: string;
  tagline: string | null;
  description: string;
  materials: string | null;
  careInfo: string | null;
  warrantyMonths: number;
  returnable: boolean;
  returnWindowDays: number;
  installationIncluded: boolean;
  assemblyRequired: boolean;
  hsnCode: string;
  gstRate: 0 | 5 | 12 | 18 | 28;
  codAllowed: boolean;
  featured: boolean;
  badge: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  options: Option[];
  variants: Variant[];
  media: Media[];
  attributes: { key: string; label: string; value: string; filterable: boolean }[];
  roomIds: string[];
  collectionIds: string[];
}

const ROLE_LABEL: Record<Role, string> = { GALLERY: 'Gallery', LIFESTYLE: 'Room photo', DIMENSION: 'Dimensions', DETAIL: 'Detail', MODEL_3D: '3D model', MODEL_POSTER: '3D poster' };
const SECTIONS = ['Details', 'Media', 'Finishes and variants', 'Specifications', 'Delivery and policies', 'Merchandising', 'Search engines'];
const newRef = () => `new-${Math.random().toString(36).slice(2, 10)}`;
const slugify = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export default function ProductEditor() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();
  const toast = useToast();
  const editable = can('catalog.write');
  const { data, error, setData } = useApi<Product>(`/products/${id}`);
  const { data: categories } = useApi<{ id: string; name: string; parentId: string | null }[]>('/categories');
  const { data: rooms } = useApi<{ id: string; name: string }[]>('/rooms');
  const { data: collections } = useApi<{ id: string; name: string }[]>('/collections');
  const { data: library } = useApi<{ finishLibrary: { name: string; hex: string }[]; attributeKeys: { key: string; label: string; filterable: boolean }[] }>('/catalog/library');

  const [p, setP] = useState<Product | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [picker, setPicker] = useState<null | 'IMAGE' | 'MODEL_3D' | 'POSTER'>(null);
  const [modelVariants, setModelVariants] = useState<string[]>([]);

  useEffect(() => {
    if (data) {
      setP(structuredClone(data));
      setDirty(false);
    }
  }, [data]);

  const model = p?.media.find((m) => m.role === 'MODEL_3D');
  useEffect(() => {
    if (!model) return setModelVariants([]);
    api<{ variants: string[] }>(`/media/${model.mediaId}/model-variants`).then((r) => setModelVariants(r.variants)).catch(() => setModelVariants([]));
  }, [model?.mediaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const allValues = useMemo(() => p?.options.flatMap((o) => o.values) ?? [], [p]);

  if (error) return <ErrorBox message={error} />;
  if (!p) return <Loading rows={14} />;

  const update = (patch: Partial<Product>) => {
    setP({ ...p, ...patch });
    setDirty(true);
  };

  const save = async (status?: Product['status']) => {
    setSaving(true);
    setProblems([]);
    try {
      const body = { ...p, status: status ?? p.status, variants: p.variants.map(({ onHand, reserved, hasOrders, ...v }) => v) };
      const saved = await api<Product>(`/products/${p.id}`, { method: 'PUT', json: body });
      setData(saved);
      toast(status === 'ACTIVE' ? 'Published. It’s live on the store now.' : status === 'DRAFT' ? 'Unpublished. Hidden from the store.' : status === 'ARCHIVED' ? 'Archived.' : 'Saved. The store updates within a minute.');
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.errors)) setProblems((err.errors as { path: string; message: string }[]).map((e) => (e.path && e.path !== 'status' ? `${e.path}: ${e.message}` : e.message)));
      toast(err instanceof ApiError ? err.message : message(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── Variants ──
  const combos = () => {
    const lists = p.options.filter((o) => o.values.length).map((o) => o.values);
    return lists.reduce<OptionValue[][]>((acc, vals) => acc.flatMap((a) => vals.map((v) => [...a, v])), [[]]);
  };
  const generate = () => {
    const base = p.variants[0];
    const code = slugify(p.name).split('-').map((w) => w[0]).join('').toUpperCase() || 'P';
    const next: Variant[] = combos().map((combo, i) => {
      const refs = combo.map((v) => v.ref);
      const existing = p.variants.find((v) => v.optionRefs.length === refs.length && refs.every((r) => v.optionRefs.includes(r)));
      if (existing) return existing;
      return {
        sku: `SSS-${code}-${Date.now().toString(36).slice(-4).toUpperCase()}${i}`,
        title: combo.map((v) => v.value).join(' / ') || 'Standard',
        price: base?.price ?? 100000,
        mrp: base?.mrp ?? null,
        lengthCm: base?.lengthCm ?? null,
        widthCm: base?.widthCm ?? null,
        heightCm: base?.heightCm ?? null,
        weightKg: base?.weightKg ?? null,
        leadTimeDays: base?.leadTimeDays ?? 0,
        maxPerOrder: base?.maxPerOrder ?? 5,
        isDefault: false,
        active: true,
        optionRefs: refs,
      };
    });
    if (!next.some((v) => v.isDefault) && next[0]) next[0].isDefault = true;
    const removed = p.variants.filter((v) => !next.includes(v));
    update({ variants: next });
    toast(`${next.length} variants${removed.length ? `; ${removed.length} old combination${removed.length > 1 ? 's' : ''} removed (variants with orders are kept but deactivated on save)` : ''}`);
  };
  const setVariant = (i: number, patch: Partial<Variant>) => update({ variants: p.variants.map((v, j) => (j === i ? { ...v, ...patch } : patch.isDefault ? { ...v, isDefault: false } : v)) });

  // ── Media ──
  const addMedia = (a: MediaAsset, role: Role) => {
    const rest = role === 'MODEL_3D' || role === 'MODEL_POSTER' ? p.media.filter((m) => m.role !== role) : p.media;
    update({ media: [...rest, { mediaId: a.id, role, optionRef: null, kind: a.kind, url: a.url, altText: a.altText }] });
  };
  const images = p.media.filter((m) => m.role !== 'MODEL_3D' && m.role !== 'MODEL_POSTER');
  const poster = p.media.find((m) => m.role === 'MODEL_POSTER');
  const moveImage = (from: number, to: number) => {
    const list = [...images];
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x);
    update({ media: [...list, ...p.media.filter((m) => m.role === 'MODEL_3D' || m.role === 'MODEL_POSTER')] });
  };
  const setImage = (i: number, patch: Partial<Media>) => update({ media: [...images.map((m, j) => (j === i ? { ...m, ...patch } : m)), ...p.media.filter((m) => m.role === 'MODEL_3D' || m.role === 'MODEL_POSTER')] });

  const catOptions = (categories ?? []).flatMap((c) => (c.parentId ? [] : [c, ...(categories ?? []).filter((x) => x.parentId === c.id)])).map((c) => ({ value: c.id, label: c.parentId ? `— ${c.name}` : c.name }));
  const finishOption = p.options.find((o) => o.values.some((v) => v.swatchHex));

  return (
    <>
      <PageHeader
        back={{ href: '/products', label: 'Products' }}
        title={<span className="flex flex-wrap items-center gap-3">{p.name} <StatusBadge status={p.status} label={p.status === 'ACTIVE' ? 'Live' : undefined} /></span>}
        description={dirty ? 'You have unsaved changes.' : 'All changes saved.'}
        actions={
          <>
            {p.status === 'ACTIVE' && (
              <a href={`${storefront}/products/${p.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[0.86rem] text-muted hover:text-ink">
                <ExternalLink className="h-4 w-4" /> View on store
              </a>
            )}
            {editable && (
              <>
                {p.status === 'ACTIVE' ? (
                  <Button onClick={() => save('DRAFT')} loading={saving}>Unpublish</Button>
                ) : (
                  <Button variant="accent" onClick={() => save('ACTIVE')} loading={saving}>Publish</Button>
                )}
                <Button variant="primary" onClick={() => save()} loading={saving} disabled={!dirty}>
                  Save
                </Button>
              </>
            )}
          </>
        }
      />

      {problems.length > 0 && (
        <div className="mb-6 rounded-lg border border-danger/25 bg-danger/[0.05] px-4 py-3 text-[0.86rem] text-danger" role="alert">
          <p className="font-semibold">Fix these before saving:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[200px_1fr]">
        <nav className="hidden xl:block" aria-label="Sections">
          <ul className="sticky top-6 grid gap-1 text-[0.84rem]">
            {SECTIONS.map((s) => (
              <li key={s}>
                <a href={`#${slugify(s)}`} className="block rounded-md px-3 py-1.5 text-muted hover:bg-ink/[0.05] hover:text-ink">{s}</a>
              </li>
            ))}
          </ul>
        </nav>

        <fieldset disabled={!editable} className="grid min-w-0 gap-6">
          {/* Details */}
          <Card title="Details" className="scroll-mt-6" >
            <div id="details" className="grid gap-4 md:grid-cols-2">
              <Input label="Name" value={p.name} onChange={(e) => update({ name: e.target.value })} className="md:col-span-2" />
              <Input label="URL" value={p.slug} onChange={(e) => update({ slug: slugify(e.target.value) })} hint={`${storefront.replace(/^https?:\/\//, '')}/products/${p.slug}. Changing it adds a redirect from the old address.`} />
              <Select label="Category" value={p.categoryId} onChange={(e) => update({ categoryId: e.target.value })} options={catOptions} />
              <Input label="Tagline" value={p.tagline ?? ''} onChange={(e) => update({ tagline: e.target.value || null })} placeholder="One line under the name" className="md:col-span-2" />
              <Textarea label="Description" value={p.description} onChange={(e) => update({ description: e.target.value })} rows={6} hint={`${p.description.length} characters. Publishing needs at least 40.`} className="md:col-span-2" />
              <Input label="Badge" value={p.badge ?? ''} onChange={(e) => update({ badge: e.target.value || null })} placeholder="e.g. New, Bestseller, Made to order" />
              <Input label="Brand" value={p.brand} onChange={(e) => update({ brand: e.target.value })} />
              <Toggle checked={p.featured} onChange={(v) => update({ featured: v })} label="Featured" hint="Shown first in listings and in the homepage’s “most loved” rail." />
            </div>
          </Card>

          {/* Media */}
          <Card title="Media" actions={<Button size="sm" type="button" onClick={() => setPicker('IMAGE')}><ImagePlus className="h-4 w-4" /> Add images</Button>}>
            <div id="media" className="grid gap-5">
              {images.length === 0 && <p className="text-[0.86rem] text-muted">No images yet. The first image is the main product image.</p>}
              <ul className="grid gap-3">
                {images.map((m, i) => (
                  <li key={`${m.mediaId}-${i}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-2">
                    <div className="h-16 w-14 shrink-0 overflow-hidden rounded-md bg-canvas"><MediaThumb asset={{ kind: m.kind as 'IMAGE', url: m.url, altText: m.altText }} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.82rem]">{m.altText || <span className="text-danger">No alt text (required to publish; edit it in the media library)</span>}</p>
                      {i === 0 && <Badge tone="accent">Main image</Badge>}
                    </div>
                    <select value={m.role} onChange={(e) => setImage(i, { role: e.target.value as Role })} className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-[0.8rem]" aria-label="Image type">
                      {(['GALLERY', 'LIFESTYLE', 'DETAIL', 'DIMENSION'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    {finishOption && (
                      <select value={m.optionRef ?? ''} onChange={(e) => setImage(i, { optionRef: e.target.value || null })} className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-[0.8rem]" aria-label="Show for finish">
                        <option value="">All finishes</option>
                        {finishOption.values.map((v) => <option key={v.ref} value={v.ref}>{v.value} only</option>)}
                      </select>
                    )}
                    <div className="flex">
                      <button type="button" className="grid h-9 w-8 place-items-center text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => moveImage(i, i - 1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" className="grid h-9 w-8 place-items-center text-muted hover:text-ink disabled:opacity-30" disabled={i === images.length - 1} onClick={() => moveImage(i, i + 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" className="grid h-9 w-8 place-items-center text-muted hover:text-danger" onClick={() => update({ media: p.media.filter((x) => x !== m) })} aria-label="Remove image"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="grid gap-3 rounded-lg border border-dashed border-line-strong p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-medium"><Box className="h-4 w-4 text-accent" /> 3D model</div>
                  <div className="flex gap-2">
                    <Button size="sm" type="button" onClick={() => setPicker('MODEL_3D')}>{model ? 'Change model' : 'Add GLB model'}</Button>
                    <Button size="sm" type="button" onClick={() => setPicker('POSTER')} disabled={!model}>{poster ? 'Change poster' : 'Add poster image'}</Button>
                    {model && <Button size="sm" variant="ghost" type="button" onClick={() => update({ media: p.media.filter((m) => m.role !== 'MODEL_3D' && m.role !== 'MODEL_POSTER') })}>Remove</Button>}
                  </div>
                </div>
                {model ? (
                  <div className="grid gap-2 text-[0.82rem] text-ink-soft">
                    <p>Model: {model.url.split('/').pop()} · poster: {poster ? 'set' : <span className="text-danger">missing (required)</span>}</p>
                    {modelVariants.length > 0 ? (
                      <p>The model contains {modelVariants.length} material variants: {modelVariants.join(', ')}. Map them to finish swatches under “Finishes and variants”.</p>
                    ) : (
                      <p>The model has no material variants, so finish swatches won’t change its colour.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-[0.82rem] text-muted">Optional. Customers tap “View in 3D” to load it; the page stays fast for everyone else.</p>
                )}
              </div>
            </div>
          </Card>

          {/* Options and variants */}
          <Card title="Finishes and variants" actions={<Button size="sm" type="button" onClick={generate}><Wand2 className="h-4 w-4" /> Generate variants</Button>}>
            <div id="finishes-and-variants" className="grid gap-5">
              {p.options.map((o, oi) => (
                <div key={o.ref} className="grid gap-3 rounded-lg border border-line p-4">
                  <div className="flex items-end gap-3">
                    <Input label="Option name" value={o.name} onChange={(e) => update({ options: p.options.map((x, j) => (j === oi ? { ...x, name: e.target.value } : x)) })} className="max-w-xs flex-1" />
                    <Button size="sm" type="button" variant="ghost" onClick={() => update({ options: p.options.filter((_, j) => j !== oi) })}>Remove option</Button>
                  </div>
                  <ul className="grid gap-2">
                    {o.values.map((v, vi) => {
                      const setVal = (patch: Partial<OptionValue>) => update({ options: p.options.map((x, j) => (j === oi ? { ...x, values: x.values.map((y, k) => (k === vi ? { ...y, ...patch } : y)) } : x)) });
                      return (
                        <li key={v.ref} className="flex flex-wrap items-center gap-2">
                          <input type="color" value={v.swatchHex ?? '#dddddd'} onChange={(e) => setVal({ swatchHex: e.target.value })} className="h-9 w-10 rounded border border-line-strong" aria-label={`Swatch colour for ${v.value}`} />
                          <input value={v.value} onChange={(e) => setVal({ value: e.target.value })} className="h-9 w-48 rounded-lg border border-line-strong px-3 text-[0.84rem]" aria-label="Value" list={`lib-${o.ref}`} />
                          {library && (
                            <datalist id={`lib-${o.ref}`}>
                              {library.finishLibrary.map((f) => <option key={f.name} value={f.name} />)}
                            </datalist>
                          )}
                          {!v.swatchHex && <button type="button" className="text-[0.74rem] text-muted underline" onClick={() => setVal({ swatchHex: library?.finishLibrary.find((f) => f.name === v.value)?.hex ?? '#cccccc' })}>Add swatch</button>}
                          {v.swatchHex && <button type="button" className="text-[0.74rem] text-muted underline" onClick={() => setVal({ swatchHex: null })}>No swatch</button>}
                          {modelVariants.length > 0 && (
                            <select value={v.modelVariant ?? ''} onChange={(e) => setVal({ modelVariant: e.target.value || null })} className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-[0.8rem]" aria-label="3D material variant">
                              <option value="">No 3D material</option>
                              {modelVariants.map((m) => <option key={m} value={m}>3D: {m}</option>)}
                            </select>
                          )}
                          <button type="button" className="grid h-9 w-8 place-items-center text-muted hover:text-danger" onClick={() => update({ options: p.options.map((x, j) => (j === oi ? { ...x, values: x.values.filter((_, k) => k !== vi) } : x)) })} aria-label={`Remove ${v.value}`}><X className="h-4 w-4" /></button>
                        </li>
                      );
                    })}
                  </ul>
                  <Button size="sm" type="button" className="justify-self-start" onClick={() => update({ options: p.options.map((x, j) => (j === oi ? { ...x, values: [...x.values, { ref: newRef(), value: '', swatchHex: o.values.some((y) => y.swatchHex) ? '#cccccc' : null, modelVariant: null }] } : x)) })}>
                    <Plus className="h-4 w-4" /> Add value
                  </Button>
                </div>
              ))}
              {p.options.length < 3 && (
                <Button size="sm" type="button" className="justify-self-start" onClick={() => update({ options: [...p.options, { ref: newRef(), name: p.options.length ? 'Size' : 'Finish', values: [] }] })}>
                  <Plus className="h-4 w-4" /> Add option (e.g. Finish, Size, Fabric)
                </Button>
              )}
              {modelVariants.length > 0 && finishOption && (
                <p className="text-[0.8rem] text-muted">Tip: map each finish to its 3D material so the model changes colour when a customer picks a swatch.</p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-[0.82rem]">
                  <thead>
                    <tr className="border-b border-line text-[0.7rem] uppercase tracking-[0.06em] text-muted">
                      <th className="py-2 pr-2 font-semibold">Variant</th>
                      <th className="py-2 pr-2 font-semibold">SKU</th>
                      <th className="py-2 pr-2 font-semibold">Price ₹</th>
                      <th className="py-2 pr-2 font-semibold">MRP ₹</th>
                      <th className="py-2 pr-2 font-semibold">W × D × H cm</th>
                      <th className="py-2 pr-2 font-semibold">kg</th>
                      <th className="py-2 pr-2 font-semibold">Lead days</th>
                      <th className="py-2 pr-2 font-semibold">Stock</th>
                      <th className="py-2 pr-2 font-semibold">Default</th>
                      <th className="py-2 font-semibold">On sale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.variants.map((v, i) => {
                      const num = (val: number | null) => (val === null ? '' : String(val));
                      const toNum = (s: string) => (s === '' ? null : Number(s));
                      const cell = 'h-9 rounded-md border border-line-strong px-2';
                      return (
                        <tr key={v.id ?? v.sku} className="border-b border-line">
                          <td className="py-2 pr-2">
                            <input value={v.title} onChange={(e) => setVariant(i, { title: e.target.value })} className={`${cell} w-40`} aria-label="Variant title" />
                            {v.optionRefs.length > 0 && <p className="mt-0.5 text-[0.7rem] text-muted">{v.optionRefs.map((r) => allValues.find((x) => x.ref === r)?.value ?? '?').join(' · ')}</p>}
                          </td>
                          <td className="py-2 pr-2"><input value={v.sku} onChange={(e) => setVariant(i, { sku: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} className={`${cell} w-36 font-mono text-[0.76rem]`} aria-label="SKU" /></td>
                          <td className="py-2 pr-2"><MoneyCell value={v.price} onChange={(x) => setVariant(i, { price: x ?? 0 })} label="Price" /></td>
                          <td className="py-2 pr-2"><MoneyCell value={v.mrp} onChange={(x) => setVariant(i, { mrp: x })} label="MRP" /></td>
                          <td className="py-2 pr-2">
                            <div className="flex gap-1">
                              {(['lengthCm', 'widthCm', 'heightCm'] as const).map((k) => (
                                <input key={k} inputMode="numeric" value={num(v[k])} onChange={(e) => setVariant(i, { [k]: toNum(e.target.value.replace(/\D/g, '')) })} className={`${cell} w-14`} aria-label={k} />
                              ))}
                            </div>
                          </td>
                          <td className="py-2 pr-2"><input inputMode="decimal" value={num(v.weightKg)} onChange={(e) => setVariant(i, { weightKg: toNum(e.target.value.replace(/[^\d.]/g, '')) })} className={`${cell} w-16`} aria-label="Weight" /></td>
                          <td className="py-2 pr-2"><input inputMode="numeric" value={v.leadTimeDays} onChange={(e) => setVariant(i, { leadTimeDays: Number(e.target.value.replace(/\D/g, '') || 0) })} className={`${cell} w-14`} aria-label="Lead time" /></td>
                          <td className="py-2 pr-2 tabular">{v.onHand !== undefined ? <span>{(v.onHand ?? 0) - (v.reserved ?? 0)} <span className="text-muted">free</span></span> : <span className="text-muted">new</span>}</td>
                          <td className="py-2 pr-2"><input type="radio" name="default-variant" checked={v.isDefault} onChange={() => setVariant(i, { isDefault: true })} aria-label="Default variant" className="h-4 w-4 accent-[var(--color-accent)]" /></td>
                          <td className="py-2"><input type="checkbox" checked={v.active} onChange={(e) => setVariant(i, { active: e.target.checked })} aria-label="On sale" className="h-4 w-4 accent-[var(--color-accent)]" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[0.78rem] text-muted">Prices include GST. MRP is optional; show it only for a genuine reduction. Add stock under Inventory after saving new variants.</p>
              {p.variants.some((v) => v.mrp !== null && v.price > v.mrp) && <p className="text-[0.8rem] text-danger">A price is above its MRP.</p>}
            </div>
          </Card>

          {/* Specifications */}
          <Card title="Specifications">
            <div id="specifications" className="grid gap-4">
              <Textarea label="Materials" value={p.materials ?? ''} onChange={(e) => update({ materials: e.target.value || null })} />
              <Textarea label="Care" value={p.careInfo ?? ''} onChange={(e) => update({ careInfo: e.target.value || null })} />
              <div className="grid gap-2">
                <p className="text-[0.78rem] font-medium text-ink-soft">Specification table (filterable ones appear as shop filters)</p>
                {p.attributes.map((a, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      value={a.key}
                      onChange={(e) => {
                        const k = library?.attributeKeys.find((x) => x.key === e.target.value);
                        update({ attributes: p.attributes.map((x, j) => (j === i ? { ...x, key: e.target.value, label: k?.label ?? x.label, filterable: k?.filterable ?? x.filterable } : x)) });
                      }}
                      className="h-9 w-40 rounded-lg border border-line-strong bg-surface px-2 text-[0.82rem]"
                      aria-label="Specification"
                    >
                      {[...(library?.attributeKeys ?? []), ...(library?.attributeKeys.some((k) => k.key === a.key) ? [] : [{ key: a.key, label: a.label, filterable: a.filterable }])].map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                    </select>
                    <input value={a.value} onChange={(e) => update({ attributes: p.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} className="h-9 min-w-48 flex-1 rounded-lg border border-line-strong px-3 text-[0.84rem]" aria-label="Value" />
                    {a.filterable && <Badge tone="accent">Filter</Badge>}
                    <button type="button" className="grid h-9 w-8 place-items-center text-muted hover:text-danger" onClick={() => update({ attributes: p.attributes.filter((_, j) => j !== i) })} aria-label="Remove"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button size="sm" type="button" className="justify-self-start" onClick={() => { const k = library?.attributeKeys.find((x) => !p.attributes.some((a) => a.key === x.key)) ?? { key: 'note', label: 'Note', filterable: false }; update({ attributes: [...p.attributes, { key: k.key, label: k.label, filterable: k.filterable, value: '' }] }); }}>
                  <Plus className="h-4 w-4" /> Add specification
                </Button>
              </div>
            </div>
          </Card>

          {/* Policies */}
          <Card title="Delivery and policies">
            <div id="delivery-and-policies" className="grid gap-4 md:grid-cols-2">
              <Toggle checked={p.installationIncluded} onChange={(v) => update({ installationIncluded: v })} label="Installation included" hint="Creates an installation job when the customer books delivery." />
              <Toggle checked={p.assemblyRequired} onChange={(v) => update({ assemblyRequired: v })} label="Customer assembly" hint="Shown as “easy assembly, tools included”." />
              <Toggle checked={p.codAllowed} onChange={(v) => update({ codAllowed: v })} label="Cash on delivery allowed" />
              <Toggle checked={p.returnable} onChange={(v) => update({ returnable: v })} label="Returnable" />
              <Input label="Return window (days)" type="number" min={0} max={60} value={p.returnWindowDays} onChange={(e) => update({ returnWindowDays: Number(e.target.value) })} disabled={!p.returnable} />
              <Input label="Warranty (months)" type="number" min={0} max={120} value={p.warrantyMonths} onChange={(e) => update({ warrantyMonths: Number(e.target.value) })} />
              <Select label="GST rate" value={String(p.gstRate)} onChange={(e) => update({ gstRate: Number(e.target.value) as Product['gstRate'] })} options={[0, 5, 12, 18, 28].map((r) => ({ value: String(r), label: `${r}%` }))} />
              <Input label="HSN code" value={p.hsnCode} onChange={(e) => update({ hsnCode: e.target.value.replace(/\D/g, '') })} hint="9403 for furniture, 9405 for lamps." />
            </div>
          </Card>

          {/* Merchandising */}
          <Card title="Merchandising">
            <div id="merchandising" className="grid gap-5 md:grid-cols-2">
              <CheckList title="Rooms" items={rooms ?? []} selected={p.roomIds} onChange={(ids) => update({ roomIds: ids })} />
              <CheckList title="Collections" items={collections ?? []} selected={p.collectionIds} onChange={(ids) => update({ collectionIds: ids })} />
            </div>
          </Card>

          {/* SEO */}
          <Card title="Search engines">
            <div id="search-engines" className="grid gap-4">
              <Input label="Page title" value={p.seoTitle ?? ''} maxLength={70} onChange={(e) => update({ seoTitle: e.target.value || null })} hint={`${(p.seoTitle ?? '').length}/70. Leave empty to use “${p.name} | category”.`} />
              <Textarea label="Meta description" value={p.seoDescription ?? ''} maxLength={170} onChange={(e) => update({ seoDescription: e.target.value || null })} hint={`${(p.seoDescription ?? '').length}/170. Leave empty to use the tagline.`} />
              <div className="rounded-lg border border-line bg-canvas p-4">
                <p className="text-[0.74rem] text-muted">Google preview</p>
                <p className="mt-1 text-[1rem] text-[#1a0dab]">{p.seoTitle || `${p.name} | SSS Furniture`}</p>
                <p className="text-[0.76rem] text-success">{storefront.replace(/^https?:\/\//, '')}/products/{p.slug}</p>
                <p className="text-[0.82rem] text-ink-soft">{p.seoDescription || p.tagline || p.description.slice(0, 155)}</p>
              </div>
            </div>
          </Card>

          {editable && (
            <div className="flex flex-wrap justify-between gap-3">
              {p.status !== 'ARCHIVED' ? (
                <Button variant="danger" type="button" onClick={() => save('ARCHIVED')} loading={saving}>Archive product</Button>
              ) : (
                <Button type="button" onClick={() => save('DRAFT')} loading={saving}>Restore as draft</Button>
              )}
              <Button variant="primary" type="button" onClick={() => save()} loading={saving} disabled={!dirty}>Save changes</Button>
            </div>
          )}
        </fieldset>
      </div>

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        kind={picker === 'MODEL_3D' ? 'MODEL_3D' : 'IMAGE'}
        title={picker === 'MODEL_3D' ? 'Choose a 3D model' : picker === 'POSTER' ? 'Choose a poster image' : 'Add an image'}
        onSelect={(a) => addMedia(a, picker === 'MODEL_3D' ? 'MODEL_3D' : picker === 'POSTER' ? 'MODEL_POSTER' : 'GALLERY')}
      />
      {dirty && editable && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-[0.8rem] text-white shadow-lg">
          Unsaved changes
          <button onClick={() => save()} className="rounded-full bg-white px-3 py-1 font-semibold text-ink">Save</button>
        </div>
      )}
    </>
  );
}

function MoneyCell({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div className="w-24">
      <MoneyInput value={value} onChange={onChange} aria-label={label} />
    </div>
  );
}

function CheckList({ title, items, selected, onChange }: { title: string; items: { id: string; name: string }[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-[0.78rem] font-medium text-ink-soft">{title}</legend>
      {items.map((i) => (
        <label key={i.id} className={clsx('flex items-center gap-2 text-[0.86rem]')}>
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={selected.includes(i.id)} onChange={(e) => onChange(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))} />
          {i.name}
        </label>
      ))}
    </fieldset>
  );
}
