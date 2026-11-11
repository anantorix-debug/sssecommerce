import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Breadcrumbs } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { Room } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Shop by room',
  description: 'Living rooms, bedrooms, dining rooms and studies, each furnished with pieces chosen to work together.',
  alternates: { canonical: '/rooms' },
};

export default async function RoomsPage() {
  const rooms = await api<Room[]>('/store/rooms', { tags: ['rooms'] });
  return (
    <div className="container-x pb-10 pt-8">
      <Breadcrumbs items={[{ label: 'Rooms' }]} />
      <header className="mt-6 grid gap-4 lg:grid-cols-12 lg:items-end">
        <h1 className="display-xl lg:col-span-7">Shop by room</h1>
        <p className="max-w-lg text-[1.02rem] text-ink-soft lg:col-span-5 lg:justify-self-end">
          See how the pieces live together. Each room has styled scenes you can shop piece by piece, or all at once.
        </p>
      </header>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {rooms.map((r, i) => (
          <Link key={r.slug} href={`/rooms/${r.slug}`} className="reveal group relative block overflow-hidden" style={{ '--reveal-delay': `${(i % 2) * 120}ms` } as React.CSSProperties}>
            <div className="relative aspect-[4/3] bg-paper-2 md:aspect-[5/4]">
              {r.image && <Image src={r.image} alt={`${r.name} styled with our furniture`} fill sizes="(min-width: 768px) 48vw, 100vw" priority={i < 2} className="object-cover transition-transform duration-[1.2s] ease-[var(--ease-out-soft)] group-hover:scale-[1.04]" />}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_50%,rgb(10_9_8/0.6))]" />
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 text-white md:p-8">
              <div>
                <h2 className="display-md">{r.name}</h2>
                {r.tagline && <p className="mt-1 text-white/80">{r.tagline}</p>}
              </div>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/40 transition-colors group-hover:bg-white group-hover:text-ink">
                <ArrowUpRight className="h-5 w-5" strokeWidth={1.5} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
