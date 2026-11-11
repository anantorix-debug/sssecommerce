import { Fragment, type ReactNode } from 'react';

/**
 * Renders the small Markdown subset used by the CMS (## headings, - and 1. lists, **bold**,
 * [links](/path), paragraphs). Text is rendered as React text nodes, so HTML is never injected.
 */
export function RichText({ body, className = 'prose-body' }: { body: string; className?: string }) {
  const blocks = body.trim().split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (block.startsWith('## ')) return <h2 key={i}>{inline(block.slice(3))}</h2>;
        if (lines.every((l) => /^- /.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ''))}</li>)}</ol>;
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>;
      })}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[(.+?)\]\(((?:\/|https:\/\/)[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++}>{m[1]}</strong>);
    else out.push(<a key={k++} href={m[3]} className="underline underline-offset-2">{m[2]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
