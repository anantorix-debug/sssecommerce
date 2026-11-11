'use client';

import clsx from 'clsx';
import { Mail } from 'lucide-react';
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, useToast } from '@/components/ui';
import { api, dateTime, message, useApi } from '@/lib/api';

interface Msg {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  orderNumber: string | null;
  message: string;
  handled: boolean;
  createdAt: string;
}

export default function MessagesPage() {
  const toast = useToast();
  const { data, error, reload } = useApi<Msg[]>('/messages');
  return (
    <>
      <PageHeader title="Messages" description="From the contact form. Reply by email, then mark the message as handled." />
      <ErrorBox message={error} />
      {!data ? (
        <Loading />
      ) : data.length === 0 ? (
        <Card><p className="text-center text-muted">No messages yet.</p></Card>
      ) : (
        <div className="grid gap-3">
          {data.map((m) => (
            <Card key={m.id} className={clsx(m.handled && 'opacity-60')}>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="grid gap-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[0.84rem]">
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-muted">{m.email}{m.phone ? ` · ${m.phone}` : ''}</span>
                    {m.orderNumber && <Badge tone="info">{m.orderNumber}</Badge>}
                    {!m.handled && <Badge tone="warning">New</Badge>}
                  </div>
                  <p className="whitespace-pre-line text-[0.88rem] text-ink-soft">{m.message}</p>
                  <p className="text-[0.74rem] text-muted">{dateTime(m.createdAt)}</p>
                </div>
                <div className="flex items-start gap-2">
                  <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: your message to SSS Furniture')}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-3 text-[0.8rem] hover:border-ink"><Mail className="h-3.5 w-3.5" /> Reply</a>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await api(`/messages/${m.id}/handled`, { method: 'POST', json: { handled: !m.handled } }).catch((e) => toast(message(e), 'error'));
                      void reload();
                    }}
                  >
                    {m.handled ? 'Mark as new' : 'Mark handled'}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
