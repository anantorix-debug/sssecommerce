import Link from 'next/link';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <section className="container-x grid min-h-[70vh] place-items-center py-24 text-center">
      <div className="grid max-w-xl justify-items-center gap-6">
        <p className="eyebrow">Page not found</p>
        <h1 className="display-xl">This room is empty.</h1>
        <p className="text-[1.05rem] text-ink-soft">
          The page you’re looking for has moved or no longer exists. Try searching, or start from one of our rooms.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href="/rooms">Shop by room</ButtonLink>
          <ButtonLink href="/shop" variant="secondary">
            Shop all furniture
          </ButtonLink>
        </div>
        <Link href="/contact" className="link-underline text-[0.9rem] text-muted">
          Need help? Contact us
        </Link>
      </div>
    </section>
  );
}
