import type { Metadata } from 'next';
import { LookScene } from '@/components/product/LookScene';
import { Breadcrumbs } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { Look } from '@/lib/types';

type Params = Promise<{ slug: string }>;

// Pre-rendered on first visit, then served statically and refreshed when the admin publishes a change.
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const look = await api<Look>(`/store/looks/${encodeURIComponent(slug)}`, { tags: ['looks', `look:${slug}`] });
  return {
    title: look.name,
    description: look.description ?? `Shop the ${look.name.toLowerCase()} look piece by piece.`,
    alternates: { canonical: `/looks/${look.slug}` },
    openGraph: { images: [look.image.url] },
  };
}

export default async function LookPage({ params }: { params: Params }) {
  const { slug } = await params;
  const look = await api<Look>(`/store/looks/${encodeURIComponent(slug)}`, { tags: ['looks', `look:${slug}`] });
  return (
    <div className="container-x pb-10 pt-8">
      <Breadcrumbs items={[{ label: 'Rooms', href: '/rooms' }, ...(look.room ? [{ label: look.room.name, href: `/rooms/${look.room.slug}` }] : []), { label: look.name }]} />
      <header className="mb-10 mt-6 grid gap-3">
        <p className="eyebrow">Shop the room</p>
        <h1 className="display-xl">{look.name}</h1>
      </header>
      <LookScene look={look} hideHeading />
    </div>
  );
}
