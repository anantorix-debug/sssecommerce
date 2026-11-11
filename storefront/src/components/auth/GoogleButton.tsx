'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useSession } from '../providers';
import { Spinner } from '../ui/Button';

/** Google's four-colour "G" (brand guidelines: keep it on a white or light surface). */
function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/**
 * "Continue with Google", as on Flipkart and Amazon: a normal link to Google's account chooser
 * (via our API, which holds the client secret), then straight back to `next`, signed in.
 * Hidden when Google sign-in isn't configured on the server.
 */
export function GoogleButton({ next = '/account', divider = true, label = 'Continue with Google', className }: { next?: string; divider?: boolean; label?: string; className?: string }) {
  const { googleClientId } = useSession();
  const [busy, setBusy] = useState(false);

  // Coming back with the browser's Back button restores this page from cache; reset the spinner.
  useEffect(() => {
    const onShow = () => setBusy(false);
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  if (!googleClientId) return null;
  return (
    <div className={clsx('grid gap-2', className)}>
      <a
        href={`/api/store/auth/google/start?next=${encodeURIComponent(next)}`}
        onClick={() => setBusy(true)}
        aria-busy={busy || undefined}
        className="group relative flex h-12 w-full items-center justify-center gap-3 rounded-full border border-line-strong bg-white text-[0.95rem] font-medium text-[#1f1f1f] shadow-[0_1px_2px_rgb(0_0_0/0.05)] transition-[border-color,box-shadow,transform] duration-300 hover:border-ink/40 hover:shadow-[0_6px_18px_-8px_rgb(0_0_0/0.25)] active:scale-[0.99]"
      >
        {busy ? <Spinner className="h-5 w-5 text-muted" /> : <GoogleG className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />}
        {busy ? 'Opening Google…' : label}
      </a>
      {divider && (
        <div className="my-2 flex items-center gap-4 text-[0.78rem] uppercase tracking-[0.14em] text-muted">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>
      )}
    </div>
  );
}

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled. You can try again, or use your email instead.',
  google_expired: 'That sign-in took too long. Please try “Continue with Google” again.',
  google_unverified: 'Your Google account’s email isn’t verified, so we can’t use it to sign in.',
  google_disabled: 'Google sign-in isn’t available right now. Please use your email.',
  google_failed: 'We couldn’t sign you in with Google. Please try again, or use your email.',
};

/** Friendly message for the ?error= code the server adds when Google sign-in doesn't complete. */
export const googleError = (code: string | null) => (code ? (GOOGLE_ERRORS[code] ?? null) : null);
