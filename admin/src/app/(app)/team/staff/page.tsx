'use client';

import { Copy, Plus } from 'lucide-react';
import { useState } from 'react';
import { useStaff } from '@/components/staff';
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, Select, StatusBadge, Table, Toggle, useToast } from '@/components/ui';
import { api, dateTime, message, useApi } from '@/lib/api';

interface Member {
  id: string;
  email: string;
  name: string;
  active: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  role: { id: string; name: string };
}

export default function StaffPage() {
  const me = useStaff();
  const toast = useToast();
  const { data, error, reload } = useApi<Member[]>('/staff');
  const { data: roles } = useApi<{ roles: { id: string; name: string }[] }>('/roles');
  const [invite, setInvite] = useState<{ email: string; name: string; roleId: string } | null>(null);
  const [temp, setTemp] = useState<string | null>(null);
  const [edit, setEdit] = useState<(Member & { resetTwoFactor?: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);

  const roleOptions = (roles?.roles ?? []).map((r) => ({ value: r.id, label: r.name }));

  return (
    <>
      <PageHeader title="Staff" description="Everyone with admin access. Each person sets up two-factor sign-in the first time they log in." actions={<Button variant="primary" onClick={() => setInvite({ email: '', name: '', roleId: roleOptions.find((r) => r.label === 'Order operations')?.value ?? roleOptions[0]?.value ?? '' })}><Plus className="h-4 w-4" /> Invite staff</Button>} />
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <Table
            rows={data}
            onRowClick={(m) => setEdit({ ...m })}
            columns={[
              { key: 'n', label: 'Name', render: (m) => <div><p className="font-medium">{m.name}{m.id === me.id && <span className="text-muted"> (you)</span>}</p><p className="text-[0.76rem] text-muted">{m.email}</p></div> },
              { key: 'r', label: 'Role', render: (m) => <Badge tone="accent">{m.role.name}</Badge> },
              { key: 't', label: 'Two-factor', render: (m) => (m.totpEnabled ? <Badge tone="success">On</Badge> : <Badge tone="warning">Not set up</Badge>) },
              { key: 'l', label: 'Last sign-in', render: (m) => <span className="text-muted">{m.lastLoginAt ? dateTime(m.lastLoginAt) : 'Never'}</span> },
              { key: 's', label: 'Status', render: (m) => <StatusBadge status={m.active ? 'ACTIVE' : 'ARCHIVED'} label={m.active ? 'Active' : 'Deactivated'} /> },
            ]}
          />
        )}
      </Card>

      <Modal
        open={invite !== null}
        onClose={() => setInvite(null)}
        title="Invite staff"
        footer={
          <Button
            variant="primary"
            loading={busy}
            disabled={!invite?.email || !invite.name || !invite.roleId}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ temporaryPassword: string }>('/staff', { method: 'POST', json: invite });
                setInvite(null);
                setTemp(r.temporaryPassword);
                void reload();
              } catch (err) {
                toast(message(err), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Send invitation
          </Button>
        }
      >
        {invite && (
          <div className="grid gap-4">
            <Input label="Name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
            <Input label="Work email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            <Select label="Role" value={invite.roleId} onChange={(e) => setInvite({ ...invite, roleId: e.target.value })} options={roleOptions} hint="Give people only the access they need. See Roles for what each can do." />
          </div>
        )}
      </Modal>

      <Modal open={temp !== null} onClose={() => setTemp(null)} title="Invitation sent">
        <div className="grid gap-4 text-[0.86rem]">
          <p>We’ve emailed the sign-in details. In case the email doesn’t arrive, here is the temporary password. It’s shown only once.</p>
          <div className="flex items-center gap-2 rounded-lg bg-canvas p-3">
            <span className="flex-1 select-all font-mono">{temp}</span>
            <button onClick={() => navigator.clipboard?.writeText(temp ?? '').then(() => toast('Copied'))} className="text-muted hover:text-ink" aria-label="Copy password"><Copy className="h-4 w-4" /></button>
          </div>
          <p className="text-muted">They’ll set up two-factor sign-in on first login and should change this password from their account page.</p>
        </div>
      </Modal>

      <Modal
        open={edit !== null}
        onClose={() => setEdit(null)}
        title={edit ? `Edit ${edit.name}` : ''}
        footer={
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!edit) return;
              setBusy(true);
              try {
                await api(`/staff/${edit.id}`, { method: 'PATCH', json: { name: edit.name, roleId: edit.id === me.id ? undefined : edit.role.id, active: edit.id === me.id ? undefined : edit.active, resetTwoFactor: edit.resetTwoFactor || undefined } });
                toast('Staff member updated. Role and access changes sign them out.');
                setEdit(null);
                void reload();
              } catch (err) {
                toast(message(err), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        }
      >
        {edit && (
          <div className="grid gap-4">
            <Input label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Select label="Role" value={edit.role.id} disabled={edit.id === me.id} onChange={(e) => setEdit({ ...edit, role: { id: e.target.value, name: '' } })} options={roleOptions} hint={edit.id === me.id ? 'You can’t change your own role.' : undefined} />
            {edit.id !== me.id && <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Active" hint="Deactivating signs them out immediately." />}
            {edit.totpEnabled && <Toggle checked={Boolean(edit.resetTwoFactor)} onChange={(v) => setEdit({ ...edit, resetTwoFactor: v })} label="Reset two-factor" hint="Use if they lost their phone. They’ll set it up again at next sign-in." />}
          </div>
        )}
      </Modal>
    </>
  );
}
