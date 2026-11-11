'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, ErrorBox, Input, Loading, MoneyInput, PageHeader, Textarea, Toggle, useToast } from '@/components/ui';
import { api, ApiError, inr, message, useApi } from '@/lib/api';

interface Settings {
  store: { name: string; legalName: string; gstin: string; state: string; stateCode: string; address: string; email: string; phone: string; supportHours: string };
  cod: { enabled: boolean; maxOrderValue: number; maxOpenOrders: number };
  checkout: { reservationMinutes: number; freeDeliveryAbove: number };
  payments: { online: boolean };
  announcement: { text: string; href: string; enabled: boolean };
  delivery: { windows: string[]; defaultCapacity: number; daysAhead: number; allIndia: boolean; defaultLeadDays: number; defaultFee: number; defaultCod: boolean; defaultInstallation: boolean };
}
interface Env {
  paymentsMode: string;
  onlinePayments: boolean;
  emi: boolean;
  shippingProvider: string;
  email: string;
  googleSignIn: boolean;
  twoFactorRequired: boolean;
}

export default function SettingsPage() {
  const toast = useToast();
  const { data, error } = useApi<{ settings: Settings; environment: Env }>('/settings');
  const [s, setS] = useState<Settings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    if (data) setS(structuredClone(data.settings));
  }, [data]);
  if (error) return <ErrorBox message={error} />;
  if (!s || !data) return <Loading rows={10} />;
  const env = data.environment;

  const save = async <K extends keyof Settings>(key: K) => {
    setSaving(key);
    setErrors({});
    try {
      await api(`/settings/${key}`, { method: 'PUT', json: s[key] });
      toast('Saved');
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields());
      toast(message(err), 'error');
    } finally {
      setSaving(null);
    }
  };
  const savePaymentMethods = async () => {
    setSaving('payment-methods');
    try {
      await api('/payment-methods', { method: 'PUT', json: { online: s.payments.online, cod: s.cod.enabled } });
      toast('Payment methods saved. The storefront updates within a minute.');
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setSaving(null);
    }
  };
  const set = <K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) => setS({ ...s, [key]: { ...s[key], ...patch } });
  const SaveBtn = ({ k }: { k: keyof Settings }) => <Button size="sm" variant="primary" onClick={() => save(k)} loading={saving === k}>Save</Button>;

  return (
    <>
      <PageHeader title="Settings" description="Store details used on invoices and emails, and the rules for checkout, cash on delivery and delivery slots." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Payment methods"
          actions={
            <Button size="sm" variant="primary" onClick={savePaymentMethods} loading={saving === 'payment-methods'}>
              Save
            </Button>
          }
          className="xl:col-span-2"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid content-start gap-2 rounded-xl border border-line p-4">
              <Toggle
                checked={s.payments.online && env.onlinePayments}
                onChange={(v) => set('payments', { online: v })}
                disabled={!env.onlinePayments}
                label="Online payment (Razorpay)"
                hint="UPI, cards, net banking and wallets. The order is confirmed as soon as payment succeeds."
              />
              <p className="pl-12 text-[0.78rem]">
                {env.onlinePayments ? (
                  <Badge tone={env.paymentsMode === 'live' ? 'success' : 'warning'}>{env.paymentsMode === 'live' ? 'Live: real money' : 'Test mode: no real money'}</Badge>
                ) : (
                  <span className="text-danger">Razorpay keys are not set on the server, so this can’t be turned on.</span>
                )}
              </p>
            </div>
            <div className="grid content-start gap-2 rounded-xl border border-line p-4">
              <Toggle checked={s.cod.enabled} onChange={(v) => set('cod', { enabled: v })} label="Cash on delivery" hint="Customers pay when it arrives. Every COD order is confirmed by phone before it’s prepared." />
              <p className="pl-12 text-[0.78rem] text-muted">Limits are under “Cash on delivery rules” below.</p>
            </div>
          </div>
          <p className="mt-4 text-[0.8rem] text-muted">A method that is off is hidden from the storefront. At least one must stay on.</p>
        </Card>
        <Card title="Store and invoices" actions={<SaveBtn k="store" />} className="xl:row-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Store name" value={s.store.name} onChange={(e) => set('store', { name: e.target.value })} error={errors.name} />
            <Input label="Legal name" value={s.store.legalName} onChange={(e) => set('store', { legalName: e.target.value })} error={errors.legalName} />
            <Input label="GSTIN" value={s.store.gstin} onChange={(e) => set('store', { gstin: e.target.value.toUpperCase() })} error={errors.gstin} />
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Input label="State" value={s.store.state} onChange={(e) => set('store', { state: e.target.value })} hint="Decides CGST + SGST or IGST." />
              <Input label="Code" value={s.store.stateCode} onChange={(e) => set('store', { stateCode: e.target.value })} error={errors.stateCode} />
            </div>
            <Textarea label="Registered address" value={s.store.address} onChange={(e) => set('store', { address: e.target.value })} className="sm:col-span-2" />
            <Input label="Customer care email" value={s.store.email} onChange={(e) => set('store', { email: e.target.value })} error={errors.email} />
            <Input label="Customer care phone" value={s.store.phone} onChange={(e) => set('store', { phone: e.target.value })} />
            <Input label="Support hours" value={s.store.supportHours} onChange={(e) => set('store', { supportHours: e.target.value })} className="sm:col-span-2" />
          </div>
        </Card>
        <Card title="Cash on delivery rules" actions={<SaveBtn k="cod" />}>
          <div className="grid gap-4">
            <MoneyInput label="Maximum order value (₹)" value={s.cod.maxOrderValue} onChange={(v) => set('cod', { maxOrderValue: v ?? 0 })} hint={`Currently ${inr(s.cod.maxOrderValue)}. Orders above this must pay online.`} />
            <Input label="Open COD orders allowed per customer" type="number" min={1} max={20} value={s.cod.maxOpenOrders} onChange={(e) => set('cod', { maxOpenOrders: Number(e.target.value) })} />
          </div>
        </Card>
        <Card title="Checkout" actions={<SaveBtn k="checkout" />}>
          <div className="grid gap-4">
            <MoneyInput label="Free delivery above (₹)" value={s.checkout.freeDeliveryAbove} onChange={(v) => set('checkout', { freeDeliveryAbove: v ?? 0 })} />
            <Input label="Hold stock while paying (minutes)" type="number" min={5} max={60} value={s.checkout.reservationMinutes} onChange={(e) => set('checkout', { reservationMinutes: Number(e.target.value) })} />          </div>
        </Card>
        <Card title="Announcement bar" actions={<SaveBtn k="announcement" />}>
          <div className="grid gap-4">
            <Toggle checked={s.announcement.enabled} onChange={(v) => set('announcement', { enabled: v })} label="Show the bar at the top of every page" />
            <Input label="Message" value={s.announcement.text} maxLength={160} onChange={(e) => set('announcement', { text: e.target.value })} />
            <Input label="Links to" value={s.announcement.href} onChange={(e) => set('announcement', { href: e.target.value })} />
          </div>
        </Card>
        <Card title="Delivery" actions={<SaveBtn k="delivery" />}>
          <div className="grid gap-4">
            <Toggle
              checked={s.delivery.allIndia}
              onChange={(v) => set('delivery', { allIndia: v })}
              label="Deliver anywhere in India"
              hint="Any valid pincode can order. Pincodes listed under Inventory → Pincodes keep their own fee and delivery time; mark one inactive to block it. Off: only listed pincodes can order."
            />
            {s.delivery.allIndia && (
              <div className="grid gap-4 rounded-xl border border-line bg-canvas/50 p-4">
                <p className="text-[0.78rem] font-medium text-ink-soft">For pincodes that are not listed</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Delivery time (working days)" type="number" min={1} max={60} value={s.delivery.defaultLeadDays} onChange={(e) => set('delivery', { defaultLeadDays: Number(e.target.value) })} />
                  <MoneyInput label="Delivery fee (₹)" value={s.delivery.defaultFee} onChange={(v) => set('delivery', { defaultFee: v ?? 0 })} hint="Waived above the free-delivery amount under Checkout." />
                </div>
                <Toggle checked={s.delivery.defaultCod} onChange={(v) => set('delivery', { defaultCod: v })} label="Allow cash on delivery" hint="Only applies while cash on delivery is on under Payment methods." />
                <Toggle checked={s.delivery.defaultInstallation} onChange={(v) => set('delivery', { defaultInstallation: v })} label="Include installation" hint="Turn on only if your team or partner can install there." />
              </div>
            )}
            <p className="pt-1 text-[0.78rem] font-medium text-ink-soft">Delivery slots</p>
            <Input label="Time windows (comma separated)" value={s.delivery.windows.join(', ')} onChange={(e) => set('delivery', { windows: e.target.value.split(',').map((w) => w.trim()).filter(Boolean) })} hint="Applies to slots opened from now on." />
            <Input label="Deliveries per window" type="number" min={1} value={s.delivery.defaultCapacity} onChange={(e) => set('delivery', { defaultCapacity: Number(e.target.value) })} />
            <Input label="Open slots this many days ahead" type="number" min={7} max={60} value={s.delivery.daysAhead} onChange={(e) => set('delivery', { daysAhead: Number(e.target.value) })} />
          </div>
        </Card>
        <Card title="Set on the server">
          <p className="mb-3 text-[0.8rem] text-muted">These come from the server’s environment file and can only be changed there, so a mistake in the admin can never switch on live payments.</p>
          <dl className="grid gap-2 text-[0.84rem]">
            <Row k="Online payments" v={env.onlinePayments ? <Badge tone={env.paymentsMode === 'live' ? 'success' : 'warning'}>{env.paymentsMode === 'live' ? 'Live' : 'Test mode'}</Badge> : <Badge>No Razorpay keys</Badge>} />
            <Row k="EMI" v={<Badge>{env.emi ? 'On' : 'Off'}</Badge>} />
            <Row k="Shipping" v={env.shippingProvider === 'manual' ? 'Own delivery team (manual)' : env.shippingProvider} />
            <Row k="Email" v={env.email} />
            <Row k="Google sign-in" v={<Badge>{env.googleSignIn ? 'On' : 'Off'}</Badge>} />
            <Row k="Staff two-factor" v={<Badge tone={env.twoFactorRequired ? 'success' : 'danger'}>{env.twoFactorRequired ? 'Required' : 'Optional'}</Badge>} />
          </dl>
        </Card>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
