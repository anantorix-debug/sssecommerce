'use client';

import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useCan } from '@/components/staff';
import { Button, Card, ErrorBox, Loading, PageHeader, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

interface Library {
  finishLibrary: { name: string; hex: string }[];
  attributeKeys: { key: string; label: string; filterable: boolean }[];
}

/** Shared finish swatches and specification keys used across products. */
export default function LibraryPage() {
  const can = useCan();
  const toast = useToast();
  const { data, error } = useApi<Library>('/catalog/library');
  const [lib, setLib] = useState<Library | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setLib(structuredClone(data));
  }, [data]);
  if (error) return <ErrorBox message={error} />;
  if (!lib) return <Loading />;

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<Library>('/catalog/library', { method: 'PUT', json: lib });
      setLib(r);
      toast('Saved. Filters on the store update within a minute.');
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Finishes and specifications" description="Reusable swatches and the specification fields offered on every product. Filterable specifications become shop filters." actions={can('catalog.write') && <Button variant="primary" onClick={save} loading={busy}>Save</Button>} />
      <fieldset disabled={!can('catalog.write')} className="grid gap-6 xl:grid-cols-2">
        <Card title="Finish swatches" actions={<Button size="sm" type="button" onClick={() => setLib({ ...lib, finishLibrary: [...lib.finishLibrary, { name: '', hex: '#cccccc' }] })}><Plus className="h-4 w-4" /> Add</Button>}>
          <ul className="grid gap-2">
            {lib.finishLibrary.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <input type="color" value={f.hex} onChange={(e) => setLib({ ...lib, finishLibrary: lib.finishLibrary.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)) })} className="h-9 w-10 rounded border border-line-strong" aria-label={`Colour for ${f.name}`} />
                <input value={f.name} onChange={(e) => setLib({ ...lib, finishLibrary: lib.finishLibrary.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="h-9 flex-1 rounded-lg border border-line-strong px-3 text-[0.86rem]" aria-label="Finish name" placeholder="e.g. Natural Teak" />
                <span className="w-20 font-mono text-[0.74rem] text-muted">{f.hex}</span>
                <button type="button" onClick={() => setLib({ ...lib, finishLibrary: lib.finishLibrary.filter((_, j) => j !== i) })} className="text-muted hover:text-danger" aria-label="Remove"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Specification fields" actions={<Button size="sm" type="button" onClick={() => setLib({ ...lib, attributeKeys: [...lib.attributeKeys, { key: '', label: '', filterable: false }] })}><Plus className="h-4 w-4" /> Add</Button>}>
          <ul className="grid gap-2">
            {lib.attributeKeys.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <input value={a.label} onChange={(e) => setLib({ ...lib, attributeKeys: lib.attributeKeys.map((x, j) => (j === i ? { ...x, label: e.target.value, key: x.key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') } : x)) })} className="h-9 flex-1 rounded-lg border border-line-strong px-3 text-[0.86rem]" aria-label="Label" placeholder="e.g. Seating" />
                <span className="w-28 truncate font-mono text-[0.74rem] text-muted">{a.key}</span>
                <label className="flex items-center gap-1.5 text-[0.8rem]"><input type="checkbox" checked={a.filterable} onChange={(e) => setLib({ ...lib, attributeKeys: lib.attributeKeys.map((x, j) => (j === i ? { ...x, filterable: e.target.checked } : x)) })} className="h-4 w-4 accent-[var(--color-accent)]" /> Shop filter</label>
                <button type="button" onClick={() => setLib({ ...lib, attributeKeys: lib.attributeKeys.filter((_, j) => j !== i) })} className="text-muted hover:text-danger" aria-label="Remove"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </Card>
      </fieldset>
    </>
  );
}
