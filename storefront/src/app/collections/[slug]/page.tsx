import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { Listing } from '@/components/listing/Listing';
import { JsonLd } from '@/components/ui/JsonLd';
import { Breadcrumbs, SectionHeader } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { breadcrumbLd, fetchListing, listingMeta, type SearchParams } from '@/lib/listing';

interface CollectionDetail {
  name: string;
  slug: string;
  tagline: string | null;
  intro: string | null;
  image: string | null;
  story: { title: string; body: string; image: string | null }[];
  seo: { title: string; description: string };
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { slug } = await params;
  const c = await api<CollectionDetail>(`/store/collections/${encodeURIComponent(slug)}`, { tags: ['collections', `collection:${slug}`] });
  return listingMeta(`/collections/${c.slug}`, await searchParams, { title: c.seo.title, description: c.seo.description, openGraph: c.image ? { images: [c.image] } : undefined });
}

export default async function CollectionPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const c = await api<CollectionDetail>(`/store/collections/${encodeURIComponent(slug)}`, { tags: ['collections', `collection:${slug}`] });
  const data = await fetchListing({ collection: c.slug }, await searchParams);

  return (
    <>
      <section className="container-x grid gap-10 pb-16 pt-8 lg:grid-cols-12 lg:items-end lg:pb-24">
        <div className="grid gap-6 lg:col-span-5">
          <Breadcrumbs items={[{ label: 'Collections', href: '/collections' }, { label: c.name }]} />
          <p className="eyebrow">The collection</p>
          <h1 className="display-xl">{c.name}</h1>
          {c.tagline && <p className="display-sm text-ink-soft">{c.tagline}</p>}
          {c.intro && <p className="max-w-md text-[1.05rem] text-ink-soft">{c.intro}</p>}
        </div>
        <div className="relative aspect-[4/3] overflow-hidden bg-paper-2 lg:col-span-7">
          {c.image && <Image src={c.image} alt="" fill priority sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />}
        </div>
      </section>

      {/* Scroll story: the image column stays pinned while each chapter scrolls past (CSS only). */}
      {c.story.length > 0 && (
        <section className="bg-paper-2 py-20 lg:py-28" aria-label={`The story of ${c.name}`}>
          <div className="container-x grid gap-16 lg:gap-24">
            {c.story.map((s, i) => (
              <article key={s.title} className={`story-step grid items-center gap-8 lg:grid-cols-12 ${i % 2 ? '' : ''}`}>
                <div className={`relative aspect-[4/3] overflow-hidden bg-paper lg:col-span-7 ${i % 2 ? 'lg:order-2 lg:col-start-6' : ''}`}>
                  {s.image && <Image src={s.image} alt="" fill sizes="(min-width: 1024px) 58vw, 100vw" className="parallax-img object-cover" />}
                </div>
                <div className={`grid gap-4 lg:col-span-4 ${i % 2 ? 'lg:order-1 lg:col-start-1' : 'lg:col-start-9'}`}>
                  <p className="font-[family-name:var(--font-display)] text-[3.5rem] leading-none text-line-strong">{String(i + 1).padStart(2, '0')}</p>
                  <h2 className="display-md">{s.title}</h2>
                  <p className="text-[1.05rem] leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="container-x pt-16">
        <SectionHeader title={`Shop ${c.name}`} className="mb-8" />
        <Suspense>
          <Listing data={data} base={{ collection: c.slug }} />
        </Suspense>
      </section>
      <JsonLd data={breadcrumbLd([{ name: 'Collections', path: '/collections' }, { name: c.name, path: `/collections/${c.slug}` }])} />
    </>
  );
}
