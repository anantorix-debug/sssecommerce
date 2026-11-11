import type { Metadata } from 'next';
import { GuideCard } from '@/components/home/Sections';
import { Breadcrumbs } from '@/components/ui/misc';
import { api } from '@/lib/api';
import type { Guide } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Buying guides',
  description: 'How to choose a sofa that lasts, which wood to pick, and how to plan a small room.',
  alternates: { canonical: '/guides' },
};

export default async function GuidesPage() {
  const guides = await api<Guide[]>('/store/guides', { tags: ['guides', 'pages'] });
  return (
    <div className="container-x pb-10 pt-8">
      <Breadcrumbs items={[{ label: 'Guides' }]} />
      <header className="mt-6 grid gap-4 lg:grid-cols-12 lg:items-end">
        <h1 className="display-xl lg:col-span-7">Buying guides</h1>
        <p className="max-w-lg text-[1.02rem] text-ink-soft lg:col-span-5 lg:justify-self-end">Plain advice from our studio on choosing furniture that fits your room, your life and your budget.</p>
      </header>
      <div className="mt-12 grid gap-x-8 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
        {guides.map((g, i) => (
          <GuideCard key={g.slug} guide={g} delay={(i % 3) * 100} />
        ))}
      </div>
    </div>
  );
}
