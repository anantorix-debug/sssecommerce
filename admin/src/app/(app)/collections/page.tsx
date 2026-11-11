'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCan } from '@/components/staff';
import { Button, ErrorBox, Input, Loading, Modal, PageHeader, StatusBadge, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

interface Row {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  image: string | null;
  status: string;
  productCount: number;
}

export default function CollectionsPage() {
  const can = useCan();
  const toast = useToast();
  const router = useRouter();
  const { data, error } = useApi<Row[]>('/collections');
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader title="Collections" description="Families of pieces with a story. Each has its own page with a scroll story and product grid." actions={can('catalog.write') && <Button variant="primary" onClick={() => setName('')}><Plus className="h-4 w-4" /> New collection</Button>} />
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`} className="card overflow-hidden transition-shadow hover:shadow-md">
              <div className="aspect-[16/10] bg-canvas">{c.image && <img src={c.image} alt="" className="h-full w-full object-cover" />}</div>
              <div className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-[0.8rem] text-muted">{c.tagline}</p>
                  <p className="mt-2 text-[0.76rem] text-muted">{c.productCount} products</p>
                </div>
                <StatusBadge status={c.status} label={c.status === 'ACTIVE' ? 'Live' : undefined} />
              </div>
            </Link>
          ))}
        </div>
      )}
      <Modal
        open={name !== null}
        onClose={() => setName(null)}
        title="New collection"
        footer={
          <Button
            variant="primary"
            loading={busy}
            disabled={!name || name.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                const c = await api<{ id: string }>('/collections', { method: 'POST', json: { name, status: 'DRAFT' } });
                router.push(`/collections/${c.id}`);
              } catch (err) {
                toast(message(err), 'error');
                setBusy(false);
              }
            }}
          >
            Create draft
          </Button>
        }
      >
        <Input label="Name" value={name ?? ''} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coastal Cane" autoFocus />
      </Modal>
    </>
  );
}
