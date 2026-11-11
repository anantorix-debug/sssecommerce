'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { useSession } from '@/components/providers';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Field';
import { call, errorMessage } from '@/lib/client';
import type { User } from '@/lib/types';

export function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useSession();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title="Set a new password" subtitle={email ? `If an account exists for ${email}, we’ve sent it a 6-digit code.` : 'Enter the code we emailed you.'}>
      <form
        className="grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (password.length < 10) return setError('Use at least 10 characters for your new password.');
          setBusy(true);
          try {
            const r = await call<{ user: User }>('/store/auth/password/reset', { method: 'POST', json: { email, code, password } });
            setUser(r.user);
            router.replace('/account');
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormError message={error} />
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
        <Input label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 10 characters." required />
        <Button type="submit" size="lg" loading={busy}>
          Save and sign in
        </Button>
      </form>
    </AuthShell>
  );
}
