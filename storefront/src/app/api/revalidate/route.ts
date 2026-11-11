import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

/** Called by the backend after admin changes, so cached pages refresh immediately. */
export async function POST(req: Request) {
  const given = req.headers.get('x-internal-secret') ?? '';
  const secret = process.env.INTERNAL_SECRET ?? '';
  const ok = secret.length > 0 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { tags?: string[] };
  const tags = (body.tags ?? []).filter((t) => typeof t === 'string' && t.length < 120).slice(0, 50);
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: tags });
}
