'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MediaPicker } from '@/components/MediaPicker';
import { useCan } from '@/components/staff';
import { Button, ErrorBox, Input, Loading, Modal, PageHeader, StatusBadge, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

interface Row {
  id: string;
  name: string;
  slug: string;
  image: string;
  status: string;
  hotspotCount: number;
  room: { name: string } | null;
}

export default function LooksPage() {
  const can = useCan();
  const toast = useToast();
  const router = useRouter();
  const { data, error } = useApi<Row[]>('/looks');
  const [draft, setDraft] = useState<{ name: string; imageKey: string | null; url: string | null } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader title="Looks" description="Styled room scenes with numbered pins customers tap to shop each piece. They appear on room pages and the homepage." actions={can('catalog.write') && <Button variant="primary" onClick={() => setDraft({ name: '', imageKey: null, url: null })}><Plus className="h-4 w-4" /> New look</Button>} />
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((l) => (
            <Link key={l.id} href={`/looks/${l.id}`} className="card overflow-hidden transition-shadow hover:shadow-md">
              <div className="aspect-[4/3] bg-canvas"><img src={l.image} alt="" className="h-full w-full object-cover" /></div>
              <div className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-[0.78rem] text-muted">{l.room?.name ?? 'No room'} · {l.hotspotCount} pins</p>
                </div>
                <StatusBadge status={l.status} label={l.status === 'ACTIVE' ? 'Live' : undefined} />
              </div>
            </Link>
          ))}
        </div>
      )}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title="New look"
        footer={
          <Button
            variant="primary"
            loading={busy}
            disabled={!draft?.name || draft.name.length < 2 || !draft.imageKey}
            onClick={async () => {
              setBusy(true);
              try {
                const l = await api<{ id: string }>('/looks', { method: 'POST', json: { name: draft!.name, imageKey: draft!.imageKey, status: 'DRAFT' } });
                router.push(`/looks/${l.id}`);
              } catch (err) {
                toast(message(err), 'error');
                setBusy(false);
              }
            }}
          >
            Create and place pins
          </Button>
        }
      >
        {draft && (
          <div className="grid gap-4">
            <Input label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. A calm reading corner" />
            <div className="grid gap-2">
              <span className="text-[0.78rem] font-medium text-ink-soft">Scene photo</span>
              {draft.url && <img src={draft.url} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />}
              <Button type="button" onClick={() => setPicking(true)} className="justify-self-start">{draft.url ? 'Change photo' : 'Choose photo'}</Button>
            </div>
          </div>
        )}
      </Modal>
      <MediaPicker open={picking} onClose={() => setPicking(false)} onSelect={(a) => setDraft((d) => (d ? { ...d, imageKey: a.storageKey, url: a.url } : d))} />
    </>
  );
}
