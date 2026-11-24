'use client';

import { Download, ImagePlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useCan } from '@/components/staff';
import { Badge, Button, Card, Empty, ErrorBox, FilterTabs, Input, Loading, Modal, PageHeader, Pager, Select, Table, Textarea, useToast } from '@/components/ui';
import { api, ApiError, dateTime, message, useApi } from '@/lib/api';
import { countAll, JOB_LABEL, JOB_TONE, type Job } from './shared';

const ROLES = ['GALLERY', 'LIFESTYLE', 'DIMENSION', 'DETAIL', 'MODEL_POSTER'].map((r) => ({ value: r, label: r.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }));

/** A one-row example so staff see the exact column order. */
function downloadTemplate() {
  const csv = 'sku,image_url,role,position,alt_text\r\nSOFA-001,https://images.example.com/sofa-001-front.jpg,GALLERY,1,Three-seater sofa in grey fabric\r\n';
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'image-import-template.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

export default function ImageImportsPage() {
  const can = useCan();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, error, reload } = useApi<{ items: Job[]; page: number; pageCount: number; total: number }>(`/media-imports?page=${page}`);

  // Keep the list fresh while any import on this page is still downloading.
  const busy = data?.items.some((j) => j.status === 'PROCESSING');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void reload(), 5000);
    return () => clearInterval(t);
  }, [busy, reload]);

  return (
    <>
      <PageHeader
        title="Image imports"
        back={{ href: '/media', label: 'Media library' }}
        description="Bring in product images in bulk from a CSV of links, a ZIP of files, or a manual upload. Only import images you own or have a licence for. Nothing goes live until you approve it."
        actions={
          <>
            <Button onClick={downloadTemplate}><Download className="h-4 w-4" /> CSV template</Button>
            {can('media.write') && <Button variant="primary" onClick={() => setOpen(true)}><ImagePlus className="h-4 w-4" /> New import</Button>}
          </>
        }
      />
      <ErrorBox message={error} />
      <Card padded={false}>
        {!data ? (
          <Loading />
        ) : (
          <Table
            rows={data.items}
            rowHref={(j) => `/media-imports/${j.id}`}
            empty={<Empty title="No imports yet" body="Start with the CSV template, or upload a ZIP of images named by SKU." />}
            columns={[
              { key: 'name', label: 'Import', render: (j) => <div className="grid"><span className="font-medium">{j.name}</span><span className="text-[0.76rem] text-muted">{j.source} · licence: {j.licenceSource}</span></div> },
              { key: 'status', label: 'Status', render: (j) => <Badge tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}</Badge> },
              { key: 'rows', label: 'Images', className: 'tabular', render: (j) => countAll(j.counts) },
              {
                key: 'counts',
                label: 'Progress',
                render: (j) => (
                  <div className="flex flex-wrap gap-1">
                    {(j.counts.PENDING ?? 0) + (j.counts.DOWNLOADING ?? 0) > 0 && <Badge tone="accent">{(j.counts.PENDING ?? 0) + (j.counts.DOWNLOADING ?? 0)} waiting</Badge>}
                    {(j.counts.READY ?? 0) + (j.counts.DUPLICATE ?? 0) > 0 && <Badge tone="warning">{(j.counts.READY ?? 0) + (j.counts.DUPLICATE ?? 0)} to review</Badge>}
                    {(j.counts.APPROVED ?? 0) > 0 && <Badge tone="success">{j.counts.APPROVED} approved</Badge>}
                    {(j.counts.FAILED ?? 0) > 0 && <Badge tone="danger">{j.counts.FAILED} failed</Badge>}
                    {(j.counts.REJECTED ?? 0) > 0 && <Badge>{j.counts.REJECTED} rejected</Badge>}
                  </div>
                ),
              },
              { key: 'by', label: 'Started', render: (j) => <div className="grid text-[0.8rem]"><span>{dateTime(j.createdAt)}</span><span className="text-muted">{j.createdByEmail ?? '—'}</span></div> },
            ]}
          />
        )}
        {data && <Pager page={data.page} pageCount={data.pageCount} total={data.total} onPage={setPage} />}
      </Card>
      <NewImport open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function NewImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<'csv' | 'zip' | 'manual'>('csv');
  const [name, setName] = useState('');
  const [licenceSource, setLicenceSource] = useState('');
  const [licenceNote, setLicenceNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [sku, setSku] = useState('');
  const [role, setRole] = useState('GALLERY');
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTab = (t: string) => {
    setTab(t as typeof tab);
    setFiles([]);
    setErrors({});
    setFormError(null);
  };

  const submit = async () => {
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = 'Give the import a name.';
    if (licenceSource.trim().length < 2) local.licenceSource = 'Say who owns the images or granted permission.';
    if (licenceNote.trim().length < 10) local.licenceNote = 'Describe the licence or permission (at least 10 characters).';
    if (!confirmed) local.licenceConfirmed = 'Tick this box to confirm you have permission.';
    if (!files.length) local.file = tab === 'manual' ? 'Choose at least one image.' : `Choose a ${tab.toUpperCase()} file.`;
    if (tab === 'manual' && !sku.trim()) local.sku = 'Enter the product SKU.';
    setErrors(local);
    setFormError(null);
    if (Object.keys(local).length) return;

    const body = new FormData();
    body.append('name', name);
    body.append('licenceSource', licenceSource);
    body.append('licenceNote', licenceNote);
    body.append('licenceConfirmed', 'true');
    if (tab === 'manual') {
      body.append('sku', sku);
      body.append('role', role);
      for (const f of files) body.append('files', f);
    } else body.append('file', files[0]);

    setBusy(true);
    try {
      const job = await api<{ id: string }>(`/media-imports/${tab}`, { method: 'POST', body });
      toast('Import started. Images are checked in the background.');
      onClose();
      // Not under /media/: there nginx (and the Next rewrite) serve image files, not pages.
      router.push(`/media-imports/${job.id}`);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields());
      setFormError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const accept = tab === 'csv' ? '.csv,text/csv' : tab === 'zip' ? '.zip,application/zip' : 'image/jpeg,image/png,image/webp,image/avif';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New image import"
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>Start import</Button>
        </>
      }
    >
      <div className="grid gap-5">
        <FilterTabs value={tab} onChange={switchTab} options={[{ value: 'csv', label: 'CSV of links' }, { value: 'zip', label: 'ZIP of images' }, { value: 'manual', label: 'Manual upload' }]} />

        {tab === 'csv' && (
          <p className="text-[0.84rem] text-muted">
            One row per image with columns <code className="font-mono text-[0.8rem]">sku,image_url,role,position,alt_text</code>. Links must be public web addresses; your server admin can limit which sites are allowed.{' '}
            <button type="button" className="text-accent hover:underline" onClick={downloadTemplate}>Download the template</button>.
          </p>
        )}
        {tab === 'zip' && (
          <p className="text-[0.84rem] text-muted">
            Name files by SKU, like <code className="font-mono text-[0.8rem]">SOFA-001__1.jpg</code> or <code className="font-mono text-[0.8rem]">SOFA-001__LIFESTYLE__2.jpg</code>, or include a <code className="font-mono text-[0.8rem]">manifest.csv</code> with columns sku,file,role,position. Up to 200 MB.
          </p>
        )}
        {tab === 'manual' && <p className="text-[0.84rem] text-muted">Upload up to 50 images for one product. They are added in the order you pick them.</p>}

        <Input label="Import name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="e.g. Supplier photos, November" maxLength={120} />

        {tab === 'manual' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Product SKU" value={sku} onChange={(e) => setSku(e.target.value)} error={errors.sku} />
            <Select label="Image type" value={role} onChange={(e) => setRole(e.target.value)} options={ROLES} />
          </div>
        )}

        <div className="grid gap-1.5">
          <label className="text-[0.78rem] font-medium text-ink-soft" htmlFor="import-file">{tab === 'manual' ? 'Images' : tab === 'zip' ? 'ZIP file' : 'CSV file'}</label>
          <input
            id="import-file"
            key={tab}
            type="file"
            accept={accept}
            multiple={tab === 'manual'}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="text-[0.84rem] file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-[0.82rem]"
          />
          {errors.file ? <p className="text-[0.76rem] text-danger">{errors.file}</p> : files.length > 1 && <p className="text-[0.76rem] text-muted">{files.length} files chosen</p>}
        </div>

        <fieldset className="grid gap-4 rounded-lg border border-line p-4">
          <legend className="px-1 text-[0.82rem] font-semibold">Licence (required)</legend>
          <Input label="Who owns the images or gave permission" value={licenceSource} onChange={(e) => setLicenceSource(e.target.value)} error={errors.licenceSource} placeholder="e.g. Our own photoshoot, or the supplier's name" maxLength={200} />
          <Textarea label="Licence or permission details" value={licenceNote} onChange={(e) => setLicenceNote(e.target.value)} error={errors.licenceNote} placeholder="e.g. Supplier agreement dated 1 Nov 2026, email reference, or 'Photographed in-house'" maxLength={2000} />
          <label className="flex items-start gap-2.5 text-[0.85rem]">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-accent" />
            <span>I confirm we own these images or have permission or a licence to use them on our store.</span>
          </label>
          {errors.licenceConfirmed && <p className="-mt-2 text-[0.76rem] text-danger">{errors.licenceConfirmed}</p>}
        </fieldset>

        <ErrorBox message={formError} />
      </div>
    </Modal>
  );
}
