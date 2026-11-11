'use client';

import { useEffect, useState } from 'react';
import { useSession, useSettings, useToast } from '@/components/providers';
import { Button } from '@/components/ui/Button';
import { Checkbox, FormError, Input } from '@/components/ui/Field';
import { ApiError, call, errorMessage } from '@/lib/client';
import type { User } from '@/lib/types';

export default function ProfilePage() {
  const { user, setUser } = useSession();
  const settings = useSettings();
  const { notify } = useToast();
  const [profile, setProfile] = useState({ name: '', phone: '', marketingOptIn: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ current: '', password: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (user) setProfile({ name: user.name ?? '', phone: user.phone ?? '', marketingOptIn: user.marketingOptIn });
  }, [user]);

  if (!user) return null;

  return (
    <div className="grid max-w-2xl gap-12">
      <section className="grid gap-6">
        <h1 className="display-lg">Profile and security</h1>
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErrors({});
            try {
              const r = await call<{ user: User }>('/me/profile', { method: 'PATCH', json: { name: profile.name, phone: profile.phone || null, marketingOptIn: profile.marketingOptIn } });
              setUser(r.user);
              notify('Profile saved');
            } catch (err) {
              if (err instanceof ApiError && err.code === 'VALIDATION_FAILED') setErrors(err.fieldErrors());
              else notify(errorMessage(err), { tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input label="Email" value={user.email} disabled hint={user.googleLinked ? 'Linked to your Google account.' : 'Your sign-in email cannot be changed here. Contact us if you need to change it.'} />
          <Input label="Full name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} error={errors.name} />
          <Input label="Mobile number" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} error={errors.phone} />
          <Checkbox label="Email me once a month about new collections." checked={profile.marketingOptIn} onChange={(e) => setProfile({ ...profile, marketingOptIn: e.target.checked })} />
          <Button type="submit" loading={busy} className="justify-self-start">
            Save profile
          </Button>
        </form>
      </section>

      <section className="grid gap-6 border-t border-line pt-10">
        <h2 className="display-sm">{user.hasPassword ? 'Change password' : 'Set a password'}</h2>
        {!user.hasPassword && <p className="text-ink-soft">You sign in with email codes{user.googleLinked ? ' or Google' : ''}. Add a password if you’d like another way in.</p>}
        <form
          className="grid gap-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setPwError(null);
            if (pw.password.length < 10) return setPwError('Use at least 10 characters.');
            setPwBusy(true);
            try {
              await call('/me/password', { method: 'POST', json: { current: pw.current || undefined, password: pw.password } });
              setPw({ current: '', password: '' });
              notify('Password saved');
              setUser({ ...user, hasPassword: true });
            } catch (err) {
              setPwError(errorMessage(err));
            } finally {
              setPwBusy(false);
            }
          }}
        >
          <FormError message={pwError} />
          {user.hasPassword && <Input label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}
          <Input label="New password" type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} hint="At least 10 characters." />
          <Button type="submit" variant="secondary" loading={pwBusy} className="justify-self-start">
            Save password
          </Button>
        </form>
      </section>

      <section className="grid gap-3 border-t border-line pt-10 text-[0.9rem] text-ink-soft">
        <h2 className="display-sm text-ink">Your data</h2>
        <p>To get a copy of your data or delete your account, email {settings.store.email} from your account email. We respond within 30 days, as required by the Digital Personal Data Protection Act, 2023.</p>
      </section>
    </div>
  );
}
