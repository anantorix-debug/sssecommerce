import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';
import { Listing } from '@/components/listing/Listing';
import { LookScene } from '@/components/product/LookScene';
import { JsonLd } from '@/components/ui/JsonLd';
import { Breadcrumbs, SectionHeader } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { breadcrumbLd, fetchListing, listingMeta, type SearchParams } from '@/lib/listing';
import type { Look } from '@/lib/types';

interface RoomDetail {
  name: string;
  slug: string;
  tagline: string | null;
  intro: string | null;
  image: string | null;
  looks: Look[];
  categories: { name: string; slug: string; href: string; image: string | null }[];
}

type Params = Promise<{ room: string }>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { room } = await params;
  const r = await api<RoomDetail>(`/store/rooms/${encodeURIComponent(room)}`, { tags: ['rooms', `room:${room}`] });
  return listingMeta(`/rooms/${r.slug}`, await searchParams, {
    title: `${r.name} furniture`,
    description: r.intro?.slice(0, 160) ?? `Furniture for your ${r.name.toLowerCase()}.`,
    openGraph: r.image ? { images: [r.image] } : undefined,
  });
}

export default async function RoomPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { room } = await params;
  const r = await api<RoomDetail>(`/store/rooms/${encodeURIComponent(room)}`, { tags: ['rooms', `room:${room}`, 'looks'] });
  const data = await fetchListing({ room: r.slug }, await searchParams);

  return (
    <>
      <section className="relative isolate -mt-px overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 -z-10">
          {r.image && <Image src={r.image} alt="" fill priority sizes="100vw" className="parallax-img object-cover" />}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(10_9_8/0.2)_0%,rgb(10_9_8/0.45)_40%,rgb(10_9_8/0.78)_100%)] lg:bg-[linear-gradient(90deg,rgb(10_9_8/0.62),rgb(10_9_8/0.12)_70%)]" />
        </div>
        <div className="container-x grid min-h-[58svh] content-end gap-5 pb-12 pt-24 lg:min-h-[64svh]">
          <Breadcrumbs items={[{ label: 'Rooms', href: '/rooms' }, { label: r.name }]} className="text-white/70 [&_a:hover]:text-white [&_span]:text-white/90" />
          <h1 className="display-xl">{r.name}</h1>
          {r.tagline && <p className="text-[1.15rem] text-white/85">{r.tagline}</p>}
          {r.intro && <p className="max-w-xl text-white/80">{r.intro}</p>}
        </div>
      </section>

      {r.categories.length > 0 && (
        <nav aria-label={`${r.name} categories`} className="container-x no-scrollbar flex gap-3 overflow-x-auto py-6">
          {r.categories.map((c) => (
            <Link key={c.slug} href={c.href} className="flex shrink-0 items-center gap-3 rounded-full border border-line-strong py-1.5 pl-1.5 pr-4 text-[0.88rem] hover:border-ink">
              <span className="relative h-8 w-8 overflow-hidden rounded-full bg-paper-2">{c.image && <Image src={c.image} alt="" fill sizes="32px" className="object-cover" />}</span>
              {c.name}
            </Link>
          ))}
        </nav>
      )}

      {r.looks.map((look) => (
        <section key={look.slug} className="container-x py-12 lg:py-16">
          <SectionHeader eyebrow="Shop the room" title={look.name} className="reveal mb-8" action={<Link href={`/looks/${look.slug}`} className="link-underline text-[0.9rem] font-medium">Open this look</Link>} />
          <div className="reveal">
            <LookScene look={look} hideHeading />
          </div>
        </section>
      ))}

      <section className="container-x pb-10 pt-12">
        <SectionHeader title={`Everything for the ${r.name.toLowerCase()}`} className="mb-8" />
        <Suspense>
          <Listing data={data} base={{ room: r.slug }} />
        </Suspense>
      </section>
      <JsonLd data={breadcrumbLd([{ name: 'Rooms', path: '/rooms' }, { name: r.name, path: `/rooms/${r.slug}` }])} />
    </>
  );
}
