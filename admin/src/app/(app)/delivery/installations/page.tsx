'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button, Card, ErrorBox, FilterTabs, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, Textarea, useToast } from '@/components/ui';
import { api, date, message, useApi } from '@/lib/api';

interface Job {
  id: string;
  scheduledOn: string;
  window: string;
  technician: string | null;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  order: { id: string; orderNumber: string; name: string; phone: string; status: string; shippingAddress: { city?: string; line1?: string; pincode?: string }; items: { productName: string; variantTitle: string; quantity: number }[] };
}

export default function InstallationsPage() {
  const toast = useToast();
  const [status, setStatus] = useState('SCHEDULED');
  const { data, error, reload } = useApi<Job[]>(`/installations${status ? `?status=${status}` : ''}`);
  const [edit, setEdit] = useState<Job | null>(null);
  const [form, setForm] = useState({ technician: '', status: 'SCHEDULED', notes: '' });
  const [busy, setBusy] = useState(false);

  return (
    <>
      <PageHeader title="Installations" description="Jobs are created when a customer books a delivery slot for pieces with installation included." />
      <div className="mb-4">
        <FilterTabs value={status} onChange={setStatus} options={[{ value: 'SCHEDULED', label: 'Scheduled' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }, { value: '', label: 'All' }]} />
      </div>
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <Table
            rows={data}
            onRowClick={(j) => {
              setEdit(j);
              setForm({ technician: j.technician ?? '', status: j.status, notes: j.notes ?? '' });
            }}
            columns={[
              { key: 'd', label: 'Date', render: (j) => <div><p className="font-medium">{date(j.scheduledOn)}</p><p className="text-[0.76rem] text-muted">{j.window}</p></div> },
              { key: 'o', label: 'Order', render: (j) => <Link href={`/orders/${j.order.id}`} className="font-semibold hover:text-accent">{j.order.orderNumber}</Link> },
              { key: 'c', label: 'Customer', render: (j) => <div><p>{j.order.name}</p><p className="text-[0.76rem] text-muted">{j.order.shippingAddress.city} {j.order.shippingAddress.pincode} · {j.order.phone}</p></div> },
              { key: 'i', label: 'Pieces', render: (j) => <span className="text-[0.8rem]">{j.order.items.map((i) => `${i.productName} × ${i.quantity}`).join(', ')}</span> },
              { key: 't', label: 'Technician', render: (j) => j.technician ?? <span className="text-muted">Not assigned</span> },
              { key: 's', label: 'Status', render: (j) => <StatusBadge status={j.status} /> },
            ]}
            empty={<p className="p-10 text-center text-muted">No installation jobs.</p>}
          />
        )}
      </Card>
      <Modal
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={`Installation for ${edit?.order.orderNumber ?? ''}`}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>Back</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                if (!edit) return;
                setBusy(true);
                try {
                  await api(`/installations/${edit.id}`, { method: 'PATCH', json: { technician: form.technician || undefined, status: form.status, notes: form.notes || undefined } });
                  toast('Installation updated');
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
          </>
        }
      >
        {edit && (
          <div className="grid gap-4">
            <p className="text-[0.86rem] text-ink-soft">
              {date(edit.scheduledOn)}, {edit.window} · {edit.order.shippingAddress.line1}, {edit.order.shippingAddress.city}
            </p>
            <Input label="Technician" value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })} placeholder="Name and phone" />
            <Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={[{ value: 'SCHEDULED', label: 'Scheduled' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'CANCELLED', label: 'Cancelled' }]} />
            <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Wall-mounted the mirror, customer happy" />
          </div>
        )}
      </Modal>
    </>
  );
}
