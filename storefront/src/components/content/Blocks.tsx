import type { Block } from '@/lib/types';
import { RichText } from './RichText';

/** Content page blocks: rich text and FAQ groups. FAQs use native <details> for keyboard access. */
export function ContentBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="grid gap-12">
      {blocks.map((b) => {
        if (b.type === 'RICH_TEXT') return <RichText key={b.id} body={String(b.data.body ?? '')} />;
        if (b.type === 'FAQ') {
          const items = (b.data.items as { q: string; a: string }[]) ?? [];
          return (
            <section key={b.id} className="grid gap-4">
              {b.data.title && <h2 className="display-sm">{String(b.data.title)}</h2>}
              <div className="divide-y divide-line border-y border-line">
                {items.map((it) => (
                  <details key={it.q} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-medium [&::-webkit-details-marker]:hidden">
                      {it.q}
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line-strong text-lg leading-none transition-transform group-open:rotate-45" aria-hidden>
                        +
                      </span>
                    </summary>
                    <p className="max-w-2xl pb-6 text-ink-soft">{it.a}</p>
                  </details>
                ))}
              </div>
            </section>
          );
        }
        return null;
      })}
    </div>
  );
}

export function faqLd(blocks: Block[]) {
  const qa = blocks.filter((b) => b.type === 'FAQ').flatMap((b) => (b.data.items as { q: string; a: string }[]) ?? []);
  if (!qa.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qa.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) };
}
