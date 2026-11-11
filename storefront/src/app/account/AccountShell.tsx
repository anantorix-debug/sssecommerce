'use client';

import clsx from 'clsx';
import { LayoutGrid, LogOut, MapPin, Package, RotateCcw, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/components/providers';
import { Skeleton } from '@/components/ui/misc';

const NAV = [
  { href: '/account', label: 'Overview', icon: LayoutGrid, exact: true },
  { href: '/account/orders', label: 'Orders', icon: Package },
  { href: '/account/returns', label: 'Returns', icon: RotateCcw },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/account/profile', label: 'Profile and security', icon: UserRound },
];

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, pathname]);

  if (!ready || !user) {
    return (
      <div className="container-x grid gap-6 py-12">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="container-x grid gap-10 py-10 lg:grid-cols-12 lg:py-14">
      <aside className="lg:col-span-3">
        <p className="eyebrow">Your account</p>
        <p className="display-sm mt-2 truncate">{user.name ?? user.email}</p>
        <nav aria-label="Account" className="no-scrollbar -mx-[clamp(1rem,4vw,3rem)] mt-6 flex gap-2 overflow-x-auto px-[clamp(1rem,4vw,3rem)] lg:mx-0 lg:grid lg:gap-1 lg:px-0">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={clsx('flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 text-[0.9rem] transition-colors lg:rounded-md', active ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/[0.05] hover:text-ink')}
              >
                <n.icon className="h-4 w-4" strokeWidth={1.6} /> {n.label}
              </Link>
            );
          })}
          <button
            onClick={async () => {
              await logout();
              router.replace('/');
            }}
            className="flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 text-left text-[0.9rem] text-ink-soft hover:bg-ink/[0.05] hover:text-ink lg:rounded-md"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.6} /> Sign out
          </button>
        </nav>
      </aside>
      <div className="min-w-0 lg:col-span-9">{children}</div>
    </div>
  );
}
