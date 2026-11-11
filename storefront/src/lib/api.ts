// Server-only: reads INTERNAL_SECRET, which is never exposed to the browser bundle.
import { notFound } from 'next/navigation';

const API = `${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000'}/v1`;

export class ApiFetchError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface Options {
  tags?: string[];
  revalidate?: number | false;
  /** Return null instead of rendering the 404 page. */
  allowMissing?: boolean;
}

/**
 * Server-side reads from the backend. Responses are cached and refreshed either after
 * `revalidate` seconds or immediately when the admin publishes a change (tag revalidation).
 */
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'x-internal-secret': process.env.INTERNAL_SECRET ?? '', Accept: 'application/json' },
    next: { revalidate: opts.revalidate ?? 300, tags: opts.tags ?? [] },
  });
  if (res.status === 404) {
    if (opts.allowMissing) return null as T;
    notFound();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; detail?: string };
    throw new ApiFetchError(res.status, body.code ?? 'ERROR', body.detail ?? `API ${res.status} for ${path}`);
  }
  return res.json() as Promise<T>;
}

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
export const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'SSS Furniture';
