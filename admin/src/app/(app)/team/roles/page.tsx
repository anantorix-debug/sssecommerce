'use client';

import { Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  staffCount: number;
}

export default function RolesPage() {
  const toast = useToast();
  const { data, error, reload } = useApi<{ roles: Role[]; permissions: { key: string; label: string }[] }>('/roles');
  const [draft, setDraft] = useState<Partial<Role> & { permissions: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  const readOnly = draft?.isSystem;
  const groups = data.permissions.reduce<Record<string, { key: string; label: string }[]>>((acc, p) => {
    const g = p.key.split('.')[0];
    (acc[g] ??= []).push(p);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="Roles" description="What each role can see and do. Built-in roles are fixed; create a custom role for anything different." actions={<Button variant="primary" onClick={() => setDraft({ name: '', description: '', permissions: ['dashboard.view'] })}><Plus className="h-4 w-4" /> New role</Button>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.roles.map((r) => (
          <button key={r.id} type="button" onClick={() => setDraft({ ...r })} className="card grid content-start gap-2 p-5 text-left transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{r.name}</p>
              {r.isSystem && <Lock className="h-3.5 w-3.5 text-muted" aria-label="Built-in" />}
            </div>
            <p className="text-[0.82rem] text-muted">{r.description}</p>
            <p className="text-[0.76rem] text-muted">{r.permissions.includes('*') ? 'Full access' : `${r.permissions.length} permissions`} · {r.staffCount} staff</p>
          </button>
        ))}
      </div>
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? draft.name ?? '' : 'New role'}
        wide
        footer={
          !readOnly && (
            <>
              {draft?.id && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    try {
                      await api(`/roles/${draft.id}`, { method: 'DELETE' });
                      toast('Role deleted');
                      setDraft(null);
                      void reload();
                    } catch (err) {
                      toast(message(err), 'error');
                    }
                  }}
                >
                  Delete
                </Button>
              )}
              <Button
                variant="primary"
                loading={busy}
                disabled={!draft?.name || draft.name.length < 2}
                onClick={async () => {
                  if (!draft) return;
                  setBusy(true);
                  try {
                    await api(draft.id ? `/roles/${draft.id}` : '/roles', { method: draft.id ? 'PATCH' : 'POST', json: { name: draft.name, description: draft.description || undefined, permissions: draft.permissions } });
                    toast('Role saved');
                    setDraft(null);
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
            </>
          )
        }
      >
        {draft && (
          <div className="grid gap-5">
            {readOnly && <p className="rounded-lg bg-canvas px-4 py-3 text-[0.84rem] text-muted">Built-in roles can’t be edited. Create a custom role to choose different permissions.</p>}
            <fieldset disabled={readOnly} className="grid gap-4">
              <Input label="Name" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <Input label="Description" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              {draft.permissions.includes('*') ? (
                <Badge tone="accent">Full access to everything</Badge>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {Object.entries(groups).map(([g, perms]) => (
                    <div key={g} className="grid content-start gap-1.5">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted">{g}</p>
                      {perms.map((p) => (
                        <label key={p.key} className="flex items-start gap-2 text-[0.84rem]">
                          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" checked={draft.permissions.includes(p.key)} onChange={(e) => setDraft({ ...draft, permissions: e.target.checked ? [...draft.permissions, p.key] : draft.permissions.filter((x) => x !== p.key) })} />
                          {p.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
        )}
      </Modal>
    </>
  );
}
