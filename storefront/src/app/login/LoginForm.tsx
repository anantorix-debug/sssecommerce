'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton, googleError } from '@/components/auth/GoogleButton';
import { useSession } from '@/components/providers';
import { Button } from '@/components/ui/Button';
import { FormError, Input } from '@/components/ui/Field';
import { ApiError, call, errorMessage } from '@/lib/client';
import type { User } from '@/lib/types';

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/account');

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const googleErr = googleError(params.get('error'));
  const { user, ready, setUser } = useSession();
  const [mode, setMode] = useState<'code' | 'password'>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, next, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const done = useCallback(
    (u: User) => {
      setUser(u);
      router.replace(next);
    },
    [setUser, router, next],
  );

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      await call('/store/auth/otp/request', { method: 'POST', json: { email } });
      setSent(true);
      setCooldown(30);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'code' && !sent) return sendCode();
    setBusy(true);
    try {
      const r =
        mode === 'code'
          ? await call<{ user: User }>('/store/auth/otp/verify', { method: 'POST', json: { email, code } })
          : await call<{ user: User }>('/store/auth/login', { method: 'POST', json: { email, password } });
      done(r.user);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'VALIDATION_FAILED' ? 'Check your email address and try again.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="New here? Signing in with Google or an email code creates your account automatically.">
      <FormError message={googleErr} />
      <GoogleButton next={next} />
      <div className="grid grid-cols-2 rounded-full bg-paper-2 p-1 text-[0.88rem]" role="tablist" aria-label="Sign-in method">
        {(['code', 'password'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={clsx('rounded-full py-2.5 font-medium transition-colors', mode === m ? 'bg-surface shadow-sm' : 'text-ink-soft')}
          >
            {m === 'code' ? 'Email me a code' : 'Use a password'}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="grid gap-5" noValidate>
        <FormError message={error} />
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={mode === 'code' && sent} required />
        {mode === 'code' && sent && (
          <>
            <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} hint={`We sent a code to ${email}. It expires in 10 minutes.`} autoFocus />
            <div className="flex justify-between text-[0.85rem]">
              <button type="button" onClick={() => { setSent(false); setCode(''); }} className="text-ink-soft hover:text-ink">
                Use a different email
              </button>
              <button type="button" disabled={cooldown > 0 || busy} onClick={sendCode} className="font-medium text-accent disabled:text-muted">
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}
        {mode === 'password' && (
          <>
            <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Link href="/forgot-password" className="-mt-2 justify-self-end text-[0.85rem] text-ink-soft hover:text-ink">
              Forgot your password?
            </Link>
          </>
        )}
        <Button type="submit" size="lg" loading={busy}>
          {mode === 'code' && !sent ? 'Send code' : 'Sign in'}
        </Button>
      </form>
      <p className="text-[0.9rem] text-ink-soft">
        Prefer a password?{' '}
        <Link href={`/register${next !== '/account' ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
