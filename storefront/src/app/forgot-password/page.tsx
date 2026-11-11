'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Field';
import { call, errorMessage } from '@/lib/client';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we’ll send you a 6-digit code to set a new password.">
      <form
        className="grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            await call('/store/auth/password/forgot', { method: 'POST', json: { email } });
            router.push(`/reset-password?email=${encodeURIComponent(email)}`);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormError message={error} />
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Button type="submit" size="lg" loading={busy}>
          Send code
        </Button>
      </form>
      <Link href="/login" className="text-[0.9rem] text-ink-soft hover:text-ink">
        Back to sign in
      </Link>
    </AuthShell>
  );
}
