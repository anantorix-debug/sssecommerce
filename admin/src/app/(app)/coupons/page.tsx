'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, MoneyInput, PageHeader, Select, Table, Toggle, useToast } from '@/components/ui';
import { api, ApiError, date, inr, message, useApi } from '@/lib/api';

interface Coupon {
  id?: string;
  code: string;
  description: string | null;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perCustomerLimit: number;
  firstOrderOnly: boolean;
  active: boolean;
  usedCount?: number;
  discountGiven?: number;
}

const blank: Coupon = { code: '', description: '', type: 'PERCENT', value: 10, minSubtotal: 0, maxDiscount: null, startsAt: null, endsAt: null, usageLimit: null, perCustomerLimit: 1, firstOrderOnly: false, active: true };

const status = (c: Coupon) => {
  const now = Date.now();
  if (!c.active) return <Badge>Off</Badge>;
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return <Badge tone="danger">Expired</Badge>;
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return <Badge tone="info">Scheduled</Badge>;
  if (c.usageLimit !== null && (c.usedCount ?? 0) >= c.usageLimit) return <Badge tone="warning">Used up</Badge>;
  return <Badge tone="success">Active</Badge>;
};

export default function CouponsPage() {
  const toast = useToast();
  const { data, error, reload } = useApi<Coupon[]>('/coupons');
  const [draft, setDraft] = useState<Coupon | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setErrors({});
    const { id, usedCount, discountGiven, ...body } = draft;
    try {
      await api(id ? `/coupons/${id}` : '/coupons', { method: id ? 'PATCH' : 'POST', json: { ...body, description: body.description || null } });
      toast('Coupon saved');
      setDraft(null);
      void reload();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields());
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

  return (
    <>
      <PageHeader title="Coupons" description="One code per order. Coupons are counted only when an order is placed, and released if it’s cancelled." actions={<Button variant="primary" onClick={() => setDraft({ ...blank })}><Plus className="h-4 w-4" /> New coupon</Button>} />
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <Table
            rows={data}
            onRowClick={(c) => setDraft({ ...c })}
            columns={[
              { key: 'c', label: 'Code', render: (c) => <div><p className="font-mono font-semibold">{c.code}</p><p className="text-[0.76rem] text-muted">{c.description}</p></div> },
              { key: 'v', label: 'Discount', render: (c) => (c.type === 'PERCENT' ? `${c.value}%${c.maxDiscount ? ` up to ${inr(c.maxDiscount)}` : ''}` : inr(c.value)) },
              { key: 'm', label: 'Minimum', render: (c) => (c.minSubtotal ? inr(c.minSubtotal) : '—') },
              { key: 'u', label: 'Used', className: 'text-right', render: (c) => <span className="tabular">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</span> },
              { key: 'g', label: 'Given away', className: 'text-right', render: (c) => <span className="tabular">{inr(c.discountGiven ?? 0)}</span> },
              { key: 'e', label: 'Ends', render: (c) => (c.endsAt ? date(c.endsAt) : '—') },
              { key: 's', label: 'Status', render: (c) => status(c) },
            ]}
            empty={<p className="p-10 text-center text-muted">No coupons yet.</p>}
          />
        )}
      </Card>
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit ${draft.code}` : 'New coupon'}
        footer={
          <>
            {draft?.id && (
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await api(`/coupons/${draft.id}`, { method: 'DELETE' });
                    toast(draft.usedCount ? 'Coupon switched off (it has been used, so it’s kept for records)' : 'Coupon deleted');
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
            <Button variant="primary" onClick={save} loading={busy} disabled={!draft || draft.code.length < 3}>Save</Button>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '') })} error={errors.code} className="sm:col-span-2" disabled={Boolean(draft.id && draft.usedCount)} hint={draft.id && draft.usedCount ? 'Used codes can’t be renamed.' : undefined} />
            <Input label="Description (staff only)" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="sm:col-span-2" />
            <Select label="Type" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as Coupon['type'], value: e.target.value === 'PERCENT' ? 10 : 100000 })} options={[{ value: 'PERCENT', label: 'Percentage off' }, { value: 'FIXED', label: 'Fixed amount off' }]} />
            {draft.type === 'PERCENT' ? (
              <Input label="Percent" type="number" min={1} max={90} value={draft.value} onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })} error={errors.value} />
            ) : (
              <MoneyInput label="Amount (₹)" value={draft.value} onChange={(v) => setDraft({ ...draft, value: v ?? 0 })} error={errors.value} />
            )}
            <MoneyInput label="Minimum order (₹)" value={draft.minSubtotal} onChange={(v) => setDraft({ ...draft, minSubtotal: v ?? 0 })} />
            {draft.type === 'PERCENT' && <MoneyInput label="Maximum discount (₹)" value={draft.maxDiscount} onChange={(v) => setDraft({ ...draft, maxDiscount: v })} hint="Leave empty for no cap." />}
            <Input label="Starts" type="datetime-local" value={toLocal(draft.startsAt)} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            <Input label="Ends" type="datetime-local" value={toLocal(draft.endsAt)} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })} error={errors.endsAt} />
            <Input label="Total uses allowed" type="number" min={1} value={draft.usageLimit ?? ''} onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value ? Number(e.target.value) : null })} hint="Leave empty for unlimited." />
            <Input label="Uses per customer" type="number" min={1} value={draft.perCustomerLimit} onChange={(e) => setDraft({ ...draft, perCustomerLimit: Number(e.target.value) })} />
            <div className="grid gap-3 sm:col-span-2">
              <Toggle checked={draft.firstOrderOnly} onChange={(v) => setDraft({ ...draft, firstOrderOnly: v })} label="First order only" />
              <Toggle checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label="Active" />
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
