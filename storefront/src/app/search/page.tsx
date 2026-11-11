import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Listing } from '@/components/listing/Listing';
import { Breadcrumbs } from '@/components/ui/misc';
import { fetchListing, type SearchParams } from '@/lib/listing';

export const metadata: Metadata = { title: 'Search', robots: { index: false, follow: true } };

const SUGGESTIONS = ['Sofa', 'Bed', 'Dining table', 'Teak', 'Accent chair', 'Storage'];

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q.trim().slice(0, 100) : '';
  const data = q ? await fetchListing({ q }, sp) : null;

  return (
    <div className="container-x pb-10 pt-8">
      <Breadcrumbs items={[{ label: 'Search' }]} />
      <header className="mt-6 grid gap-3">
        <p className="eyebrow">{data ? `${data.total} ${data.total === 1 ? 'result' : 'results'}` : 'Search'}</p>
        <h1 className="display-lg">{q ? <>“{q}”</> : 'What are you looking for?'}</h1>
        {data?.correctedQuery && data.total > 0 && (
          <p className="text-ink-soft">
            Showing results for <span className="font-medium text-ink">“{data.correctedQuery}”</span>.
          </p>
        )}
      </header>
      {!q && (
        <div className="mt-8 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Link key={s} href={`/search?q=${encodeURIComponent(s)}`} className="rounded-full border border-line-strong px-4 py-2 text-[0.9rem] hover:border-ink">
              {s}
            </Link>
          ))}
        </div>
      )}
      {data && (
        <div className="mt-10">
          <Suspense>
            <Listing data={data} base={{ q }} emptyHint={`We couldn’t find anything for “${q}”. Try a simpler word like “sofa” or “bed”, or browse by room.`} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
