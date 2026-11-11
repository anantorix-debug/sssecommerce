import { MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import type { PublicSettings } from '@/lib/types';
import { Logo } from '../ui/misc';
import { NewsletterForm } from './NewsletterForm';

export function Footer({ settings }: { settings: PublicSettings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-24 bg-ink text-paper">
      <div className="container-x grid gap-14 py-16 lg:grid-cols-12 lg:py-20">
        <div className="grid content-start gap-6 lg:col-span-5">
          <Link href="/" className="logo-link block w-fit" aria-label={`${settings.store.name} home`}>
            <Logo tone="white" alt="" className="h-16" />
          </Link>
          <p className="eyebrow text-brass-soft">Quality · Trust · Comfort</p>
          <p className="max-w-sm text-[0.95rem] leading-relaxed text-paper/70">
            Teak furniture, luxury and recliner sofas, home furnishing and office setups. Delivered on your date and installed by our own team.
          </p>
          <div className="grid gap-2 text-[0.92rem]">
            <a href={`tel:${settings.store.phone.replace(/[^\d+]/g, '')}`} className="flex w-fit items-center gap-2.5 text-paper hover:text-white">
              <Phone className="h-4 w-4 text-brass-soft" strokeWidth={1.6} />
              <span className="link-underline text-[1.05rem] font-medium tabular">{settings.store.phone}</span>
            </a>
            <p className="flex max-w-sm items-start gap-2.5 text-paper/70">
              <MapPin className="mt-1 h-4 w-4 shrink-0 text-brass-soft" strokeWidth={1.6} />
              {settings.store.address}
            </p>
          </div>
          <div className="max-w-md">
            <p className="mb-3 text-[0.9rem] font-medium">New pieces, first. One email a month.</p>
            <NewsletterForm dark />
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7">
          {settings.footer.map((col) => (
            <div key={col.title}>
              <p className="mb-4 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-paper/50">{col.title}</p>
              <ul className="grid gap-2.5 text-[0.92rem] text-paper/85">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="link-underline hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-paper/10">
        <div className="container-x grid gap-4 py-8 text-[0.78rem] leading-relaxed text-paper/55 md:grid-cols-2">
          <div>
            <p>© {year} {settings.store.legalName}. All rights reserved.</p>
            <p>
              GSTIN {settings.store.gstin}. Customer care: {settings.store.email}, {settings.store.phone} ({settings.store.supportHours}).
            </p>
          </div>
          <p className="md:text-right">
            Prices include GST.{' '}
            {settings.payments.online && settings.payments.cod
              ? 'Secure payments by Razorpay: UPI, cards and net banking, and cash on delivery.'
              : settings.payments.online
                ? 'Secure payments by Razorpay: UPI, cards, net banking and wallets.'
                : 'Pay by cash on delivery.'}
            {/* Credits for the demo catalogue (seed data) only; off on the live site. */}
            {process.env.NEXT_PUBLIC_SHOW_DEMO_CREDITS === 'true' && (
              <>
                <br />
                Demo photography from Unsplash. 3D models “GlamVelvetSofa” and “SheenChair” by Wayfair, CC BY 4.0, via the Khronos glTF sample assets.
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
