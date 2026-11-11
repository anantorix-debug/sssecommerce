import type { Metadata } from 'next';
import Image from 'next/image';
import { ContentBlocks } from '@/components/content/Blocks';
import { ButtonLink } from '@/components/ui/Button';
import { api } from '@/lib/api';
import type { Collection, ContentPage } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const p = await api<ContentPage>('/store/pages/about', { tags: ['pages', 'page:about'] });
  return { title: p.seo.title, description: p.excerpt ?? undefined, alternates: { canonical: '/about' } };
}

export default async function AboutPage() {
  const [p, collections] = await Promise.all([
    api<ContentPage>('/store/pages/about', { tags: ['pages', 'page:about'] }),
    api<Collection[]>('/store/collections', { tags: ['collections'] }),
  ]);
  const hero = collections[0]?.image;
  return (
    <>
      <section className="container-x grid gap-10 pb-16 pt-10 lg:grid-cols-12 lg:items-end">
        <div className="grid gap-5 lg:col-span-6">
          <p className="eyebrow">Our story</p>
          <h1 className="display-xl">{p.title}</h1>
          {p.excerpt && <p className="display-sm text-ink-soft">{p.excerpt}</p>}
        </div>
        {hero && (
          <div className="relative aspect-[4/3] overflow-hidden bg-paper-2 lg:col-span-6">
            <Image src={hero} alt="" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
        )}
      </section>
      <section className="container-x grid gap-10 pb-10 lg:grid-cols-12">
        <div className="lg:col-span-7 lg:col-start-4">
          <ContentBlocks blocks={p.blocks} />
          <div className="mt-12 flex flex-wrap gap-3">
            <ButtonLink href="/collections">See the collections</ButtonLink>
            <ButtonLink href="/contact" variant="secondary">
              Talk to us
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
