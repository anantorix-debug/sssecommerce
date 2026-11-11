'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useCan } from '@/components/staff';
import { Button, Card, ErrorBox, Input, Loading, Modal, PageHeader, StatusBadge, Table, Toggle, useToast } from '@/components/ui';
import { api, message, useApi } from '@/lib/api';

interface Loc {
  id: string;
  name: string;
  city: string;
  isActive: boolean;
  _count: { pincodes: number; inventory: number };
}

export default function LocationsPage() {
  const can = useCan();
  const toast = useToast();
  const { data, error, reload } = useApi<Loc[]>('/locations');
  const [draft, setDraft] = useState<Partial<Loc> | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageHeader title="Locations" description="Warehouses that hold stock and serve pincodes. Orders take stock from the warehouse that serves the delivery pincode first." actions={can('inventory.write') && <Button variant="primary" onClick={() => setDraft({ name: '', city: '', isActive: true })}><Plus className="h-4 w-4" /> New location</Button>} />
      <Card padded={false}>
        <ErrorBox message={error} />
        {!data ? (
          <Loading />
        ) : (
          <Table
            rows={data}
            onRowClick={(l) => can('inventory.write') && setDraft({ ...l })}
            columns={[
              { key: 'n', label: 'Name', render: (l) => <span className="font-medium">{l.name}</span> },
              { key: 'c', label: 'City', render: (l) => l.city },
              { key: 'p', label: 'Pincodes served', className: 'text-right', render: (l) => <span className="tabular">{l._count.pincodes}</span> },
              { key: 'i', label: 'Variants stocked', className: 'text-right', render: (l) => <span className="tabular">{l._count.inventory}</span> },
              { key: 's', label: 'Status', render: (l) => <StatusBadge status={l.isActive ? 'ACTIVE' : 'ARCHIVED'} label={l.isActive ? 'Active' : 'Inactive'} /> },
            ]}
          />
        )}
      </Card>
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit ${draft.name}` : 'New location'}
        footer={
          <Button
            variant="primary"
            loading={busy}
            disabled={!draft?.name || !draft.city}
            onClick={async () => {
              if (!draft) return;
              setBusy(true);
              try {
                await api(draft.id ? `/locations/${draft.id}` : '/locations', { method: draft.id ? 'PATCH' : 'POST', json: { name: draft.name, city: draft.city, isActive: draft.isActive } });
                toast('Location saved');
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
        }
      >
        {draft && (
          <div className="grid gap-4">
            <Input label="Name" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Chennai warehouse" />
            <Input label="City" value={draft.city ?? ''} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
            <Toggle checked={draft.isActive ?? true} onChange={(v) => setDraft({ ...draft, isActive: v })} label="Active" hint="Inactive locations aren’t used for new orders, and their slots aren’t opened." />
          </div>
        )}
      </Modal>
    </>
  );
}
