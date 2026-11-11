'use client';

import { useState } from 'react';
import { useStaff } from '@/components/staff';
import { Badge, Button, Card, Input, PageHeader, useToast } from '@/components/ui';
import { api, message } from '@/lib/api';

export default function AccountPage() {
  const staff = useStaff();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = confirm.length > 0 && confirm !== next;

  return (
    <>
      <PageHeader title="My account" />
      <div className="grid max-w-3xl gap-6">
        <Card title="Profile">
          <dl className="grid gap-2 text-[0.86rem]">
            <div className="flex justify-between"><dt className="text-muted">Name</dt><dd>{staff.name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Email</dt><dd>{staff.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Role</dt><dd><Badge tone="accent">{staff.role}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-muted">Two-factor sign-in</dt><dd>{staff.totpEnabled ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>}</dd></div>
          </dl>
          <p className="mt-3 text-[0.78rem] text-muted">Lost your authenticator? Ask an owner to reset two-factor from Staff.</p>
        </Card>
        <Card title="Change password">
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api('/auth/password', { method: 'POST', json: { current, password: next } });
                toast('Password changed. Your other sessions have been signed out.');
                setCurrent('');
                setNext('');
                setConfirm('');
              } catch (err) {
                toast(message(err), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            <Input label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint="At least 10 characters." />
            <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? 'Passwords don’t match.' : undefined} />
            <Button type="submit" variant="primary" loading={busy} disabled={!current || next.length < 10 || mismatch || confirm !== next} className="justify-self-start">Change password</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
