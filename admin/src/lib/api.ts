'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public errors?: unknown) {
    super(message);
  }
  fields(): Record<string, string> {
    if (!Array.isArray(this.errors)) return {};
    return Object.fromEntries((this.errors as { path: string; message: string }[]).map((e) => [e.path, e.message]));
  }
  /** Validation details as one readable line (e.g. publish blockers). */
  details(): string {
    if (!Array.isArray(this.errors)) return '';
    return (this.errors as { message?: string }[]).map((e) => e.message).filter(Boolean).join(' ');
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'fetch',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (res.status === 204) return undefined as T;
  const body = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new ApiError(res.status, body?.code ?? 'ERROR', body?.detail ?? 'Something went wrong. Please try again.', body?.errors);
  }
  return body as T;
}

export const message = (err: unknown) => (err instanceof ApiError ? [err.message, err.details()].filter(Boolean).join(' ') : 'Could not reach the server. Check your connection.');

/** Minimal data hook: loads on mount and whenever the key changes; `reload` refetches. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (err) {
      if (n === seq.current) setError(message(err));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
export const inr = (paise: number) => (paise % 100 === 0 ? inr0 : inr2).format(paise / 100);
export const date = (d: string | Date) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateTime = (d: string | Date) => new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const storefront = process.env.NEXT_PUBLIC_STOREFRONT_URL ?? 'http://localhost:3000';
