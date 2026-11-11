'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button, ErrorBox, Input } from '@/components/ui';
import { api, message } from '@/lib/api';

type Step = 'password' | 'setup' | 'verify';

function Login() {
  const router = useRouter();
  const nextParam = useSearchParams().get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Resume a half-finished sign-in (password accepted, two-factor pending)
  useEffect(() => {
    api<{ verified: boolean; totpEnabled: boolean }>('/auth/me')
      .then((s) => {
        if (s.verified) router.replace(next);
        else setStep(s.totpEnabled ? 'verify' : 'setup');
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 'setup' && !setup) api<{ secret: string; qr: string }>('/auth/2fa/setup').then(setSetup).catch((e) => setError(message(e)));
  }, [step, setup]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step === 'password') {
        const r = await api<{ next: 'done' | 'verify' | 'setup' }>('/auth/login', { method: 'POST', json: { email, password } });
        if (r.next === 'done') router.replace(next);
        else setStep(r.next);
      } else {
        await api(step === 'setup' ? '/auth/2fa/enable' : '/auth/2fa/verify', { method: 'POST', json: { code } });
        router.replace(next);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4 py-10">
      <form onSubmit={submit} className="grid w-full max-w-sm gap-5 rounded-2xl bg-surface p-8 shadow-2xl">
        <div className="grid gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/sss-furniture.png" alt="SSS Furniture" width={600} height={195} className="mb-2 h-12 w-auto" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl">{step === 'password' ? 'Sign in to the admin' : step === 'setup' ? 'Set up two-factor sign-in' : 'Enter your code'}</h1>
          <p className="text-[0.84rem] text-muted">
            {step === 'password' && 'Staff only. Every sign-in is recorded.'}
            {step === 'setup' && 'Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password), then enter the 6-digit code it shows.'}
            {step === 'verify' && 'Open your authenticator app and enter the current 6-digit code.'}
          </p>
        </div>
        <ErrorBox message={error} />
        {step === 'password' && (
          <>
            <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </>
        )}
        {step === 'setup' && setup && (
          <div className="grid justify-items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code for your authenticator app" className="h-44 w-44" />
            <p className="text-center text-[0.74rem] text-muted">
              Can’t scan? Enter this key: <span className="select-all font-mono text-ink">{setup.secret}</span>
            </p>
          </div>
        )}
        {step !== 'password' && <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />}
        <Button type="submit" variant="primary" loading={busy}>
          {step === 'password' ? 'Continue' : 'Verify and sign in'}
        </Button>
        <p className="flex items-center gap-2 text-[0.74rem] text-muted">
          <ShieldCheck className="h-4 w-4" /> Two-factor authentication is required for all staff.
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
