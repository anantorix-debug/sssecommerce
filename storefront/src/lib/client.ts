'use client';

export interface FieldError {
  path: string;
  message: string;
}

/** An API error with the backend's stable code and a message safe to show customers. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors?: FieldError[] | unknown,
    public retryAfter?: number,
  ) {
    super(message);
  }

  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.errors)) return {};
    return Object.fromEntries((this.errors as FieldError[]).filter((e) => e?.path).map((e) => [e.path, e.message]));
  }
}

/** Browser calls go through the storefront origin (/api), so cookies stay first-party. */
export async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
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
  const isJson = res.headers.get('content-type')?.includes('json');
  const body = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const retry = Number(res.headers.get('retry-after')) || undefined;
    throw new ApiError(
      res.status,
      body?.code ?? 'ERROR',
      body?.detail ?? (res.status >= 500 ? 'Something went wrong on our side. Please try again.' : 'That didn’t work. Please try again.'),
      body?.errors,
      retry,
    );
  }
  return body as T;
}

export const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : 'We couldn’t reach the store. Check your connection and try again.';

export function idempotencyKey() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}
