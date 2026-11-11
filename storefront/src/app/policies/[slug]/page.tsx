import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContentBlocks } from '@/components/content/Blocks';
import { Breadcrumbs } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { longDate } from '@/lib/format';
import type { ContentPage } from '@/lib/types';

type Params = Promise<{ slug: string }>;

// Pre-rendered on first visit, then served statically and refreshed when the admin publishes a change.
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const p = await api<ContentPage>(`/store/pages/${encodeURIComponent(slug)}`, { tags: ['pages', `page:${slug}`] });
  return { title: p.seo.title, description: p.seo.description || undefined, alternates: { canonical: `/policies/${p.slug}` } };
}

export default async function PolicyPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [p, all] = await Promise.all([
    api<ContentPage>(`/store/pages/${encodeURIComponent(slug)}`, { tags: ['pages', `page:${slug}`] }),
    api<{ slug: string; title: string }[]>('/store/pages?type=POLICY', { tags: ['pages'] }),
  ]);
  if (p.type !== 'POLICY') notFound();
  return (
    <div className="container-x grid gap-12 pb-10 pt-8 lg:grid-cols-12">
      <aside className="lg:col-span-3">
        <nav aria-label="Policies" className="grid gap-1 lg:sticky lg:top-28">
          <p className="eyebrow mb-3">Policies</p>
          {all.map((x) => (
            <Link key={x.slug} href={`/policies/${x.slug}`} aria-current={x.slug === p.slug ? 'page' : undefined} className={`rounded-md px-3 py-2 text-[0.9rem] ${x.slug === p.slug ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/[0.05]'}`}>
              {x.title}
            </Link>
          ))}
        </nav>
      </aside>
      <article className="lg:col-span-8 lg:col-start-5">
        <Breadcrumbs items={[{ label: 'Policies' }, { label: p.title }]} />
        <h1 className="display-lg mt-6">{p.title}</h1>
        <p className="mt-3 text-[0.85rem] text-muted">Last updated {longDate(p.updatedAt)}</p>
        <div className="mt-10">
          <ContentBlocks blocks={p.blocks} />
        </div>
      </article>
    </div>
  );
}
