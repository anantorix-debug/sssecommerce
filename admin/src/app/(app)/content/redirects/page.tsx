'use client';

import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, ErrorBox, Input, Loading, PageHeader, Select, Table, useToast } from '@/components/ui';
import { api, date, message, useApi } from '@/lib/api';

interface Redirect {
  id: string;
  fromPath: string;
  toPath: string;
  code: number;
  createdAt: string;
}

export default function RedirectsPage() {
  const toast = useToast();
  const { data, error, reload } = useApi<Redirect[]>('/redirects');
  const [form, setForm] = useState({ fromPath: '', toPath: '', code: '301' });
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader title="Redirects" description="Send old addresses to new ones so links and search rankings aren’t lost. Changing a product’s URL adds one automatically." />
      <Card title="Add a redirect" className="mb-6">
        <form
          className="grid gap-3 md:grid-cols-[1fr_1fr_140px_auto] md:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api('/redirects', { method: 'POST', json: { fromPath: form.fromPath, toPath: form.toPath, code: Number(form.code) } });
              toast('Redirect added');
              setForm({ fromPath: '', toPath: '', code: '301' });
              void reload();
            } catch (err) {
              toast(message(err), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input label="From" value={form.fromPath} onChange={(e) => setForm({ ...form, fromPath: e.target.value })} placeholder="/old-page" />
          <Input label="To" value={form.toPath} onChange={(e) => setForm({ ...form, toPath: e.target.value })} placeholder="/new-page" />
          <Select label="Type" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} options={[{ value: '301', label: 'Permanent' }, { value: '302', label: 'Temporary' }]} />
          <Button type="submit" variant="primary" loading={busy} disabled={!form.fromPath.startsWith('/') || !form.toPath}>Add</Button>
        </form>
      </Card>
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <Table
            rows={data}
            columns={[
              { key: 'f', label: 'From', render: (r) => <span className="font-mono text-[0.8rem]">{r.fromPath}</span> },
              { key: 't', label: 'To', render: (r) => <span className="font-mono text-[0.8rem]">{r.toPath}</span> },
              { key: 'c', label: 'Type', render: (r) => (r.code === 301 ? 'Permanent' : 'Temporary') },
              { key: 'd', label: 'Added', render: (r) => <span className="text-muted">{date(r.createdAt)}</span> },
              {
                key: 'x',
                label: '',
                className: 'text-right',
                render: (r) => (
                  <button
                    onClick={async () => {
                      await api(`/redirects/${r.id}`, { method: 'DELETE' }).catch((e) => toast(message(e), 'error'));
                      void reload();
                    }}
                    className="text-muted hover:text-danger"
                    aria-label={`Delete redirect from ${r.fromPath}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ),
              },
            ]}
            empty={<p className="p-10 text-center text-muted">No redirects.</p>}
          />
        )}
      </Card>
    </>
  );
}
