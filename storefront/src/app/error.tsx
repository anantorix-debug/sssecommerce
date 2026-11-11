'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="container-x grid min-h-[70vh] place-items-center py-24 text-center">
      <div className="grid max-w-xl justify-items-center gap-6">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="display-lg">We couldn’t load this page.</h1>
        <p className="text-ink-soft">It’s on our side, not yours. Please try again in a moment. Your cart and wishlist are safe.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/" variant="secondary">
            Go to the homepage
          </ButtonLink>
        </div>
        {error.digest && <p className="text-[0.75rem] text-muted">Reference: {error.digest}</p>}
      </div>
    </section>
  );
}
