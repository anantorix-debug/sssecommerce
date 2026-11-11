'use client';

import { GitCompareArrows, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSaved } from '../providers';

/** Floating bar that appears once something is added to compare. */
export function CompareBar() {
  const { compare, clearCompare } = useSaved();
  const pathname = usePathname();
  if (compare.length === 0 || pathname === '/compare' || pathname.startsWith('/checkout')) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-[toast-in_.35s_var(--ease-out-soft)]">
      <div className="flex items-center gap-2 rounded-full bg-ink py-1.5 pl-5 pr-1.5 text-paper shadow-[0_16px_40px_rgb(0_0_0/0.25)]">
        <GitCompareArrows className="h-4 w-4" strokeWidth={1.6} />
        <span className="text-[0.88rem]">
          {compare.length} of 3 to compare
        </span>
        <Link
          href="/compare"
          aria-disabled={compare.length < 2}
          className={`ml-2 rounded-full px-4 py-2 text-[0.84rem] font-semibold ${compare.length < 2 ? 'pointer-events-none bg-paper/20 text-paper/60' : 'bg-paper text-ink hover:bg-white'}`}
        >
          Compare
        </Link>
        <button onClick={clearCompare} className="grid h-9 w-9 place-items-center rounded-full hover:bg-paper/10" aria-label="Clear compare">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
