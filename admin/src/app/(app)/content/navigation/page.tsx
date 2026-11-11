'use client';

import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, ErrorBox, Input, Loading, PageHeader, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

type Column = { title: string; links: { label: string; href: string }[] };

export default function NavigationPage() {
  const toast = useToast();
  const { data, error } = useApi<{ items: Column[] }>('/navigation/footer');
  const [cols, setCols] = useState<Column[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setCols(structuredClone(data.items));
  }, [data]);
  if (error) return <ErrorBox message={error} />;
  if (!cols) return <Loading />;

  const setCol = (i: number, c: Column) => setCols(cols.map((x, j) => (j === i ? c : x)));

  return (
    <>
      <PageHeader
        title="Footer menu"
        description="Link columns in the store footer. The top menu is built automatically from rooms, categories and collections."
        actions={
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/navigation/footer', { method: 'PUT', json: { items: cols } });
                toast('Footer saved');
              } catch (err) {
                toast(message(err), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {cols.map((c, i) => (
          <Card key={i} title={<input value={c.title} onChange={(e) => setCol(i, { ...c, title: e.target.value })} className="w-full bg-transparent font-semibold focus:outline-none" aria-label="Column title" />} actions={<button type="button" onClick={() => setCols(cols.filter((_, j) => j !== i))} className="text-muted hover:text-danger" aria-label="Remove column"><X className="h-4 w-4" /></button>}>
            <ul className="grid gap-2">
              {c.links.map((l, k) => (
                <li key={k} className="flex gap-2">
                  <Input value={l.label} onChange={(e) => setCol(i, { ...c, links: c.links.map((x, m) => (m === k ? { ...x, label: e.target.value } : x)) })} aria-label="Link text" className="flex-1" />
                  <Input value={l.href} onChange={(e) => setCol(i, { ...c, links: c.links.map((x, m) => (m === k ? { ...x, href: e.target.value } : x)) })} aria-label="Link address" className="flex-1" />
                  <button type="button" onClick={() => setCol(i, { ...c, links: c.links.filter((_, m) => m !== k) })} className="text-muted hover:text-danger" aria-label="Remove link"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
            {c.links.length < 12 && <Button size="sm" className="mt-3" onClick={() => setCol(i, { ...c, links: [...c.links, { label: '', href: '/' }] })}><Plus className="h-4 w-4" /> Add link</Button>}
          </Card>
        ))}
        {cols.length < 6 && (
          <button type="button" onClick={() => setCols([...cols, { title: 'New column', links: [] }])} className="card grid min-h-40 place-items-center border-dashed text-[0.86rem] text-muted hover:text-ink">
            + Add column
          </button>
        )}
      </div>
    </>
  );
}
