'use client';

import { Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { useCan } from '@/components/staff';
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, MoneyInput, PageHeader, Pager, Select, Table, Textarea, Toggle, useToast } from '@/components/ui';
import { api, inr, message, useApi } from '@/lib/api';

interface Pin {
  id: string;
  pincode: string;
  city: string;
  state: string;
  leadDays: number;
  deliveryFee: number;
  codAvailable: boolean;
  installationAvailable: boolean;
  active: boolean;
  location: { name: string };
}

export default function PincodesPage() {
  const can = useCan();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, reload } = useApi<{ items: Pin[]; page: number; pageCount: number; total: number }>(`/pincodes?page=${page}${search ? `&q=${encodeURIComponent(search)}` : ''}`);
  const { data: locations } = useApi<{ id: string; name: string }[]>('/locations');
  const [edit, setEdit] = useState<Pin | null>(null);
  const [importing, setImporting] = useState(false);
  const [csv, setCsv] = useState('');
  const [locationId, setLocationId] = useState('');
  const [result, setResult] = useState<{ dryRun: boolean; valid: number; errors: { line: number; message: string }[]; saved: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const runImport = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await api<typeof result>('/pincodes/import', { method: 'POST', json: { csv, locationId, dryRun } });
      setResult(r);
      if (!dryRun && r?.saved) {
        toast(`${r.saved} pincodes saved`);
        setImporting(false);
        setCsv('');
        setResult(null);
        void reload();
      }
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Pincodes" description="Where you deliver. Checkout blocks any pincode not listed here." actions={can('inventory.write') && <Button variant="primary" onClick={() => { setImporting(true); setLocationId(locations?.[0]?.id ?? ''); }}><Upload className="h-4 w-4" /> Upload CSV</Button>} />
      <Card padded={false}>
        <form className="relative border-b border-line p-4" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }}>
          <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pincode or city" aria-label="Search pincodes" className="h-10 w-full max-w-md rounded-lg border border-line-strong pl-9 pr-3 text-[0.86rem]" />
        </form>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <>
            <Table
              rows={data.items}
              onRowClick={(p) => can('inventory.write') && setEdit({ ...p })}
              columns={[
                { key: 'p', label: 'Pincode', render: (p) => <span className="font-mono font-medium">{p.pincode}</span> },
                { key: 'c', label: 'City', render: (p) => `${p.city}, ${p.state}` },
                { key: 'l', label: 'Served from', render: (p) => <span className="text-muted">{p.location.name}</span> },
                { key: 'd', label: 'Lead days', className: 'text-right', render: (p) => <span className="tabular">{p.leadDays}</span> },
                { key: 'f', label: 'Delivery fee', className: 'text-right', render: (p) => <span className="tabular">{p.deliveryFee ? inr(p.deliveryFee) : 'Free'}</span> },
                { key: 'o', label: 'Options', render: (p) => <div className="flex gap-1">{p.codAvailable && <Badge tone="warning">COD</Badge>}{p.installationAvailable && <Badge tone="accent">Installation</Badge>}{!p.active && <Badge tone="danger">Off</Badge>}</div> },
              ]}
            />
            <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={`Pincode ${edit?.pincode ?? ''}`}
        footer={
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!edit) return;
              setBusy(true);
              try {
                await api(`/pincodes/${edit.id}`, { method: 'PATCH', json: { leadDays: edit.leadDays, deliveryFee: edit.deliveryFee, codAvailable: edit.codAvailable, installationAvailable: edit.installationAvailable, active: edit.active } });
                toast('Pincode saved');
                setEdit(null);
                void reload();
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
      >
        {edit && (
          <div className="grid gap-4">
            <p className="text-[0.86rem] text-muted">{edit.city}, {edit.state} · served from {edit.location.name}</p>
            <Input label="Lead days (working days to deliver in-stock items)" type="number" min={0} max={60} value={edit.leadDays} onChange={(e) => setEdit({ ...edit, leadDays: Number(e.target.value) })} />
            <MoneyInput label="Delivery fee (₹)" value={edit.deliveryFee} onChange={(v) => setEdit({ ...edit, deliveryFee: v ?? 0 })} hint="Waived above the free-delivery threshold in Settings." />
            <Toggle checked={edit.codAvailable} onChange={(v) => setEdit({ ...edit, codAvailable: v })} label="Cash on delivery" />
            <Toggle checked={edit.installationAvailable} onChange={(v) => setEdit({ ...edit, installationAvailable: v })} label="Installation available" />
            <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Deliver to this pincode" />
          </div>
        )}
      </Modal>

      <Modal
        open={importing}
        onClose={() => { setImporting(false); setResult(null); }}
        title="Upload pincodes"
        wide
        footer={
          <>
            <Button onClick={() => runImport(true)} loading={busy} disabled={!csv.trim() || !locationId}>Check file</Button>
            <Button variant="primary" onClick={() => runImport(false)} loading={busy} disabled={!result || result.errors.length > 0 || result.valid === 0}>Save {result?.valid ?? ''} pincodes</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <p className="text-[0.84rem] text-ink-soft">One pincode per line: <span className="font-mono text-[0.78rem]">pincode,city,state,leadDays,deliveryFeeRupees,cod(yes/no),installation(yes/no)</span>. Existing pincodes are updated. Check the file first; nothing is saved until you confirm.</p>
          <Select label="Served from" value={locationId} onChange={(e) => setLocationId(e.target.value)} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} />
          <label className="grid gap-1.5">
            <span className="text-[0.78rem] font-medium text-ink-soft">CSV file</span>
            <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setResult(null); } }} className="text-[0.84rem]" />
          </label>
          <Textarea label="Or paste rows" value={csv} onChange={(e) => { setCsv(e.target.value); setResult(null); }} rows={6} className="font-mono" placeholder="600001,Chennai,Tamil Nadu,4,599,yes,yes" />
          {result && (
            <div className={`rounded-lg p-4 text-[0.84rem] ${result.errors.length ? 'bg-danger/[0.05] text-danger' : 'bg-success/[0.07] text-success'}`}>
              {result.errors.length ? (
                <>
                  <p className="font-semibold">{result.errors.length} rows need fixing ({result.valid} are fine):</p>
                  <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                    {result.errors.slice(0, 50).map((e) => <li key={e.line}>Line {e.line}: {e.message}</li>)}
                  </ul>
                </>
              ) : (
                <p className="font-semibold">All {result.valid} rows look good. Save to apply them.</p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
