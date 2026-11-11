import type { Metadata } from 'next';
import { Mail, MessageSquare, Phone } from 'lucide-react';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { PublicSettings } from '@/lib/types';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Contact us',
  description: 'Questions about an order, delivery or a piece of furniture? Write to us or call, and we’ll reply within one working day.',
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const s = await api<PublicSettings>('/store/settings', { tags: ['settings'] });
  return (
    <div className="container-x grid gap-14 pb-10 pt-8 lg:grid-cols-12">
      <header className="grid content-start gap-6 lg:col-span-5">
        <Breadcrumbs items={[{ label: 'Contact' }]} />
        <h1 className="display-xl">Talk to us</h1>
        <p className="text-[1.05rem] text-ink-soft">Questions about a piece, a delivery or an order? We’re real people in Bengaluru and we reply within one working day.</p>
        <ul className="grid gap-4 text-[0.95rem]">
          <li className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-accent" strokeWidth={1.5} /> <span className="select-all">{s.store.email}</span>
          </li>
          <li className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-accent" strokeWidth={1.5} /> <span className="select-all">{s.store.phone}</span> <span className="text-muted">· {s.store.supportHours}</span>
          </li>
          <li className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-accent" strokeWidth={1.5} />
            <span>
              Track an order without signing in on the{' '}
              <Link href="/track" className="underline underline-offset-2">
                tracking page
              </Link>
              .
            </span>
          </li>
        </ul>
        <address className="text-[0.88rem] not-italic leading-relaxed text-muted">
          {s.store.legalName}
          <br />
          {s.store.address}
        </address>
      </header>
      <div className="lg:col-span-6 lg:col-start-7">
        <ContactForm />
      </div>
    </div>
  );
}
