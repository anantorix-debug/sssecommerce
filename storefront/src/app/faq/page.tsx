import type { Metadata } from 'next';
import Link from 'next/link';
import { ContentBlocks, faqLd } from '@/components/content/Blocks';
import { JsonLd } from '@/components/ui/JsonLd';
import { Breadcrumbs } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { ContentPage } from '@/lib/types';

export async function generateMetadata(): Promise<Metadata> {
  const p = await api<ContentPage>('/store/pages/faq', { tags: ['pages', 'page:faq'] });
  return { title: p.title, description: 'Answers about payment, delivery, installation and returns.', alternates: { canonical: '/faq' } };
}

export default async function FaqPage() {
  const p = await api<ContentPage>('/store/pages/faq', { tags: ['pages', 'page:faq'] });
  const ld = faqLd(p.blocks);
  return (
    <div className="container-x grid gap-12 pb-10 pt-8 lg:grid-cols-12">
      <header className="grid content-start gap-5 lg:col-span-4">
        <Breadcrumbs items={[{ label: 'FAQ' }]} />
        <h1 className="display-lg">{p.title}</h1>
        <p className="text-ink-soft">
          Can’t find what you need?{' '}
          <Link href="/contact" className="font-medium text-accent hover:underline">
            Contact us
          </Link>{' '}
          and we’ll reply within one working day.
        </p>
      </header>
      <div className="lg:col-span-7 lg:col-start-6">
        <ContentBlocks blocks={p.blocks} />
      </div>
      {ld && <JsonLd data={ld} />}
    </div>
  );
}
