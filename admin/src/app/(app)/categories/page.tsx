'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ImageKeyField } from '@/components/MediaPicker';
import { useCan } from '@/components/staff';
import { Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, Select, Textarea, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  imageKey: string | null;
  image: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  sort: number;
  productCount: number;
  childCount: number;
}

type Draft = Partial<Category> & { name: string };

export default function CategoriesPage() {
  const can = useCan();
  const toast = useToast();
  const { data, error, reload } = useApi<Category[]>('/categories');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const top = (data ?? []).filter((c) => !c.parentId);
  const children = (id: string) => (data ?? []).filter((c) => c.parentId === id);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const body = { name: draft.name, slug: draft.slug || undefined, parentId: draft.parentId || null, description: draft.description || null, imageKey: draft.imageKey || null, seoTitle: draft.seoTitle || null, seoDescription: draft.seoDescription || null, sort: draft.sort ?? 0 };
    try {
      await api(draft.id ? `/categories/${draft.id}` : '/categories', { method: draft.id ? 'PATCH' : 'POST', json: body });
      toast('Category saved');
      setDraft(null);
      void reload();
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    setBusy(true);
    try {
      await api(`/categories/${draft.id}`, { method: 'DELETE' });
      toast('Category deleted');
      setDraft(null);
      void reload();
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const row = (c: Category, depth: number) => (
    <li key={c.id}>
      <button type="button" onClick={() => setDraft({ ...c })} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-canvas/70" style={{ paddingLeft: 20 + depth * 28 }}>
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-canvas">{c.image && <img src={c.image} alt="" className="h-full w-full object-cover" />}</span>
        <span className="flex-1">
          <span className="font-medium">{c.name}</span> <span className="text-[0.76rem] text-muted">/{c.slug}</span>
        </span>
        <span className="text-[0.8rem] text-muted tabular">{c.productCount} products</span>
      </button>
      {children(c.id).length > 0 && <ul className="divide-y divide-line border-t border-line">{children(c.id).map((ch) => row(ch, depth + 1))}</ul>}
    </li>
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description="The “Shop” menu. Up to three levels. A category with products or sub-categories can’t be deleted."
        actions={can('catalog.write') && <Button variant="primary" onClick={() => setDraft({ name: '', sort: 0 })}><Plus className="h-4 w-4" /> New category</Button>}
      />
      <ErrorBox message={error} />
      <Card padded={false}>{!data ? <Loading /> : <ul className="divide-y divide-line">{top.map((c) => row(c, 0))}</ul>}</Card>
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit ${draft.name}` : 'New category'}
        footer={
          can('catalog.write') && (
            <>
              {draft?.id && <Button variant="danger" onClick={remove} loading={busy} disabled={(draft.productCount ?? 0) > 0 || (draft.childCount ?? 0) > 0}>Delete</Button>}
              <Button variant="primary" onClick={save} loading={busy} disabled={!draft || draft.name.trim().length < 2}>Save</Button>
            </>
          )
        }
      >
        {draft && (
          <div className="grid gap-4">
            <Input label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input label="URL slug" value={draft.slug ?? ''} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} hint="Leave empty to create one from the name." />
            <Select label="Parent" value={draft.parentId ?? ''} onChange={(e) => setDraft({ ...draft, parentId: e.target.value || null })} options={[{ value: '', label: 'None (top level)' }, ...(data ?? []).filter((c) => c.id !== draft.id && !c.parentId).map((c) => ({ value: c.id, label: c.name }))]} />
            <Textarea label="Introduction" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} hint="Shown at the top of the category page and read by search engines." />
            <ImageKeyField label="Image" value={draft.imageKey} onChange={(k) => setDraft({ ...draft, imageKey: k })} />
            <Input label="Sort order" type="number" value={draft.sort ?? 0} onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) })} />
            <Input label="Search page title" value={draft.seoTitle ?? ''} maxLength={70} onChange={(e) => setDraft({ ...draft, seoTitle: e.target.value })} />
            <Textarea label="Search description" value={draft.seoDescription ?? ''} maxLength={170} onChange={(e) => setDraft({ ...draft, seoDescription: e.target.value })} />
          </div>
        )}
      </Modal>
    </>
  );
}
