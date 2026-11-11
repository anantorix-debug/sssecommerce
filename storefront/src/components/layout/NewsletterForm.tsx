'use client';

import clsx from 'clsx';
import { ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { call, errorMessage } from '@/lib/client';

export function NewsletterForm({ dark }: { dark?: boolean }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'done') {
    return (
      <p className={clsx('flex items-center gap-2 text-[0.92rem]', dark ? 'text-paper' : 'text-accent')}>
        <Check className="h-4 w-4" /> You’re on the list. See you next month.
      </p>
    );
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setState('busy');
        try {
          await call('/store/newsletter', { method: 'POST', json: { email } });
          setState('done');
        } catch (err) {
          setError(errorMessage(err));
          setState('idle');
        }
      }}
    >
      <div className={clsx('flex items-center rounded-full border p-1 pl-5', dark ? 'border-paper/25 focus-within:border-paper/70' : 'border-line-strong bg-surface focus-within:border-ink')}>
        <label htmlFor={dark ? 'nl-footer' : 'nl-main'} className="sr-only">
          Email address
        </label>
        <input
          id={dark ? 'nl-footer' : 'nl-main'}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          autoComplete="email"
          className={clsx('min-w-0 flex-1 bg-transparent py-2 text-[0.92rem] focus:outline-none', dark ? 'placeholder:text-paper/45' : 'placeholder:text-muted')}
        />
        <button
          type="submit"
          disabled={state === 'busy'}
          aria-label="Subscribe"
          className={clsx('grid h-10 w-10 place-items-center rounded-full transition-colors', dark ? 'bg-paper text-ink hover:bg-white' : 'bg-ink text-paper hover:bg-accent')}
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      {error && <p className={clsx('text-[0.8rem]', dark ? 'text-[#ffb4a8]' : 'text-danger')}>{error}</p>}
    </form>
  );
}
