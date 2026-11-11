'use client';

import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/components/providers';
import { Button } from '@/components/ui/Button';
import { FormError, Input, Textarea } from '@/components/ui/Field';
import { ApiError, call, errorMessage } from '@/lib/client';

export function ContactForm() {
  const { user } = useSession();
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', phone: '', orderNumber: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="grid justify-items-start gap-4 rounded-xl border border-line bg-surface p-8">
        <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={1.4} />
        <h2 className="display-sm">Message received</h2>
        <p className="text-ink-soft">Thank you. We’ll reply to {form.email} within one working day.</p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5 rounded-xl border border-line bg-surface p-6 sm:p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setErrors({});
        try {
          await call('/store/contact', { method: 'POST', json: { ...form, phone: form.phone || null, orderNumber: form.orderNumber || null } });
          setSent(true);
        } catch (err) {
          if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') setErrors(err.fieldErrors());
          else setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <FormError message={error} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="Name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
        <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
        <Input label="Phone" optional type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input label="Order number" optional value={form.orderNumber} onChange={(e) => setForm({ ...form, orderNumber: e.target.value.toUpperCase() })} placeholder="SSS-2610-001234" />
      </div>
      <Textarea label="How can we help?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} error={errors.message} maxLength={3000} />
      <Button type="submit" size="lg" loading={busy} className="justify-self-start">
        Send message
      </Button>
    </form>
  );
}
