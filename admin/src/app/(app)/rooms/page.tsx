'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { ImageKeyField } from '@/components/MediaPicker';
import { useCan } from '@/components/staff';
import { Button, ErrorBox, Input, Loading, Modal, PageHeader, Textarea, useToast } from '@/components/ui';
import { api, message, storefront, useApi } from '@/lib/api';

interface Room {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  intro: string | null;
  heroKey: string | null;
  image: string | null;
  sort: number;
  productCount: number;
  lookCount: number;
}

export default function RoomsPage() {
  const can = useCan();
  const toast = useToast();
  const { data, error, reload } = useApi<Room[]>('/rooms');
  const [draft, setDraft] = useState<Partial<Room> | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft?.name) return;
    setBusy(true);
    try {
      await api(draft.id ? `/rooms/${draft.id}` : '/rooms', {
        method: draft.id ? 'PATCH' : 'POST',
        json: { name: draft.name, slug: draft.slug || undefined, tagline: draft.tagline || null, intro: draft.intro || null, heroKey: draft.heroKey || null, sort: draft.sort ?? 0 },
      });
      toast('Room saved');
      setDraft(null);
      void reload();
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Rooms" description="“Shop by room” pages. Assign products to rooms on each product, and add styled scenes under Looks." actions={can('catalog.write') && <Button variant="primary" onClick={() => setDraft({ name: '', sort: data?.length ?? 0 })}><Plus className="h-4 w-4" /> New room</Button>} />
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.map((r) => (
            <button key={r.id} type="button" onClick={() => setDraft({ ...r })} className="card overflow-hidden text-left transition-shadow hover:shadow-md">
              <div className="aspect-[4/3] bg-canvas">{r.image && <img src={r.image} alt="" className="h-full w-full object-cover" />}</div>
              <div className="p-4">
                <p className="font-semibold">{r.name}</p>
                <p className="text-[0.8rem] text-muted">{r.tagline}</p>
                <p className="mt-2 text-[0.76rem] text-muted">{r.productCount} products · {r.lookCount} looks</p>
              </div>
            </button>
          ))}
        </div>
      )}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit ${draft.name}` : 'New room'}
        footer={
          can('catalog.write') && (
            <>
              {draft?.id && (
                <Button
                  variant="danger"
                  loading={busy}
                  onClick={async () => {
                    try {
                      await api(`/rooms/${draft.id}`, { method: 'DELETE' });
                      toast('Room deleted');
                      setDraft(null);
                      void reload();
                    } catch (err) {
                      toast(message(err), 'error');
                    }
                  }}
                >
                  Delete
                </Button>
              )}
              <Button variant="primary" onClick={save} loading={busy} disabled={!draft?.name || draft.name.length < 2}>Save</Button>
            </>
          )
        }
      >
        {draft && (
          <div className="grid gap-4">
            <Input label="Name" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input label="URL slug" value={draft.slug ?? ''} onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} hint={draft.slug ? `${storefront}/rooms/${draft.slug}` : 'Leave empty to create one from the name.'} />
            <Input label="Tagline" value={draft.tagline ?? ''} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} placeholder="e.g. Gather, lounge, linger" />
            <Textarea label="Introduction" value={draft.intro ?? ''} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} rows={4} />
            <ImageKeyField label="Hero image" value={draft.heroKey} onChange={(k) => setDraft({ ...draft, heroKey: k })} />
            <Input label="Sort order" type="number" value={draft.sort ?? 0} onChange={(e) => setDraft({ ...draft, sort: Number(e.target.value) })} />
          </div>
        )}
      </Modal>
    </>
  );
}
