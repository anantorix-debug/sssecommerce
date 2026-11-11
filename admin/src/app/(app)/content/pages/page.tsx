'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, useToast } from '@/components/ui';
import { api, date, message, useApi } from '@/lib/api';

interface Row {
  id: string;
  type: 'HOME' | 'STATIC' | 'POLICY' | 'GUIDE' | 'FAQ';
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
}

const TYPE_LABEL = { HOME: 'Homepage', STATIC: 'Page', POLICY: 'Policy', GUIDE: 'Buying guide', FAQ: 'FAQ' };

export default function PagesList() {
  const router = useRouter();
  const toast = useToast();
  const { data, error } = useApi<Row[]>('/pages');
  const [draft, setDraft] = useState<{ title: string; type: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const home = data?.find((p) => p.type === 'HOME');

  return (
    <>
      <PageHeader title="Pages and homepage" description="The homepage, buying guides, policies and other pages. Publishing refreshes the store within a minute." actions={<Button variant="primary" onClick={() => setDraft({ title: '', type: 'GUIDE' })}><Plus className="h-4 w-4" /> New page</Button>} />
      <ErrorBox message={error} />
      {home && (
        <Link href={`/content/pages/${home.id}`} className="card mb-6 flex items-center justify-between gap-4 p-5 transition-shadow hover:shadow-md">
          <div>
            <p className="font-semibold">Homepage</p>
            <p className="text-[0.84rem] text-muted">Hero, rooms, collection story, shop the look, product rails and more. Last edited {date(home.updatedAt)}.</p>
          </div>
          <span className="text-[0.86rem] font-medium text-accent">Edit homepage →</span>
        </Link>
      )}
      <Card padded={false}>
        {!data ? (
          <Loading />
        ) : (
          <Table
            rows={data.filter((p) => p.type !== 'HOME')}
            rowHref={(p) => `/content/pages/${p.id}`}
            columns={[
              { key: 't', label: 'Title', render: (p) => <Link href={`/content/pages/${p.id}`} className="font-medium hover:text-accent">{p.title}</Link> },
              { key: 'y', label: 'Type', render: (p) => <Badge>{TYPE_LABEL[p.type]}</Badge> },
              { key: 'u', label: 'Address', render: (p) => <span className="font-mono text-[0.76rem] text-muted">{p.type === 'GUIDE' ? '/guides/' : p.type === 'POLICY' ? '/policies/' : '/'}{p.slug}</span> },
              { key: 's', label: 'Status', render: (p) => <StatusBadge status={p.status} label={p.status === 'ACTIVE' ? 'Live' : undefined} /> },
              { key: 'd', label: 'Updated', render: (p) => <span className="text-muted">{date(p.updatedAt)}</span> },
            ]}
          />
        )}
      </Card>
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title="New page"
        footer={
          <Button
            variant="primary"
            loading={busy}
            disabled={!draft || draft.title.length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                const p = await api<{ id: string }>('/pages', { method: 'POST', json: { title: draft!.title, type: draft!.type, blocks: [{ id: 'body', type: 'RICH_TEXT', data: { body: '' } }] } });
                router.push(`/content/pages/${p.id}`);
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
        {draft && (
          <div className="grid gap-4">
            <Input label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
            <Select label="Type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} options={[{ value: 'GUIDE', label: 'Buying guide' }, { value: 'POLICY', label: 'Policy' }, { value: 'STATIC', label: 'Page' }, { value: 'FAQ', label: 'FAQ' }]} />
          </div>
        )}
      </Modal>
    </>
  );
}
