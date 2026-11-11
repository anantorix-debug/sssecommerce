'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { useSession } from '@/components/providers';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormError, Input } from '@/components/ui/Field';
import { ApiError, call, errorMessage } from '@/lib/client';
import type { User } from '@/lib/types';

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/account';
  const { setUser } = useSession();
  const [form, setForm] = useState({ name: '', email: params.get('email') ?? '', password: '', marketingOptIn: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = useCallback(
    (u: User) => {
      setUser(u);
      router.replace(next);
    },
    [setUser, router, next],
  );

  return (
    <AuthShell title="Create an account" subtitle="Save addresses, book delivery slots and track every order.">
      <GoogleButton next={next} />
      <form
        className="grid gap-5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setErrors({});
          if (form.password.length < 10) return setErrors({ password: 'Use at least 10 characters.' });
          setBusy(true);
          try {
            const r = await call<{ user: User }>('/store/auth/register', { method: 'POST', json: form });
            done(r.user);
          } catch (err) {
            if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') setErrors(err.fieldErrors());
            else setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormError message={error} />
        <Input label="Full name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
        <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
        <Input label="Password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} hint="At least 10 characters. A short phrase is easy to remember." />
        <Checkbox label="Send me one email a month about new collections." checked={form.marketingOptIn} onChange={(e) => setForm({ ...form, marketingOptIn: e.target.checked })} />
        <Button type="submit" size="lg" loading={busy}>
          Create account
        </Button>
        <p className="text-[0.8rem] text-muted">
          By creating an account you agree to our{' '}
          <Link href="/policies/terms" className="underline">terms</Link> and <Link href="/policies/privacy" className="underline">privacy policy</Link>.
        </p>
      </form>
      <p className="text-[0.9rem] text-ink-soft">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
