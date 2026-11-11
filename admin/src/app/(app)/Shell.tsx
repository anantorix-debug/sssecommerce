'use client';

import clsx from 'clsx';
import {
  BarChart3, Boxes, CalendarClock, ClipboardList, FileText, FolderTree, Gauge, Image as ImageIcon, KeyRound, LayoutTemplate, LogOut,
  MapPin, Menu, MessageSquare, Package, Palette, Receipt, RotateCcw, ScrollText, Settings, Shapes, ShieldCheck, Sofa, Star, Tag, Truck, Users, Wallet, Warehouse, X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StaffCtx, type Staff } from '@/components/staff';
import { api, storefront } from '@/lib/api';

type Item = { href: string; label: string; icon: typeof Gauge; perm: string };
const GROUPS: { title: string; items: Item[] }[] = [
  { title: '', items: [{ href: '/', label: 'Dashboard', icon: Gauge, perm: 'dashboard.view' }] },
  {
    title: 'Sales',
    items: [
      { href: '/orders', label: 'Orders', icon: ClipboardList, perm: 'orders.read' },
      { href: '/orders/cod', label: 'COD collections', icon: Wallet, perm: 'cod.manage' },
      { href: '/delivery/slots', label: 'Delivery slots', icon: CalendarClock, perm: 'delivery.manage' },
      { href: '/delivery/installations', label: 'Installations', icon: Truck, perm: 'delivery.manage' },
      { href: '/returns', label: 'Returns', icon: RotateCcw, perm: 'returns.manage' },
      { href: '/returns/refunds', label: 'Refunds', icon: Receipt, perm: 'refunds.approve' },
      { href: '/customers', label: 'Customers', icon: Users, perm: 'customers.read' },
    ],
  },
  {
    title: 'Catalogue',
    items: [
      { href: '/products', label: 'Products', icon: Sofa, perm: 'catalog.read' },
      { href: '/categories', label: 'Categories', icon: FolderTree, perm: 'catalog.read' },
      { href: '/rooms', label: 'Rooms', icon: Shapes, perm: 'catalog.read' },
      { href: '/collections', label: 'Collections', icon: Package, perm: 'catalog.read' },
      { href: '/looks', label: 'Looks', icon: MapPin, perm: 'catalog.read' },
      { href: '/catalog/library', label: 'Finishes and specs', icon: Palette, perm: 'catalog.read' },
      { href: '/media', label: 'Media library', icon: ImageIcon, perm: 'catalog.read' },
    ],
  },
  {
    title: 'Stock',
    items: [
      { href: '/inventory', label: 'Inventory', icon: Boxes, perm: 'inventory.read' },
      { href: '/inventory/movements', label: 'Stock history', icon: ScrollText, perm: 'inventory.read' },
      { href: '/inventory/locations', label: 'Locations', icon: Warehouse, perm: 'inventory.read' },
      { href: '/inventory/pincodes', label: 'Pincodes', icon: MapPin, perm: 'inventory.read' },
    ],
  },
  {
    title: 'Marketing and content',
    items: [
      { href: '/coupons', label: 'Coupons', icon: Tag, perm: 'coupons.manage' },
      { href: '/reviews', label: 'Reviews', icon: Star, perm: 'reviews.moderate' },
      { href: '/content/pages', label: 'Pages and homepage', icon: LayoutTemplate, perm: 'content.manage' },
      { href: '/content/navigation', label: 'Footer menu', icon: FileText, perm: 'content.manage' },
      { href: '/content/redirects', label: 'Redirects', icon: FileText, perm: 'content.manage' },
      { href: '/content/messages', label: 'Messages', icon: MessageSquare, perm: 'customers.read' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { href: '/reports', label: 'Sales report', icon: BarChart3, perm: 'reports.view' },
      { href: '/invoices', label: 'Invoices', icon: Receipt, perm: 'invoices.read' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/team/staff', label: 'Staff', icon: Users, perm: 'staff.manage' },
      { href: '/team/roles', label: 'Roles', icon: KeyRound, perm: 'staff.manage' },
      { href: '/audit', label: 'Audit log', icon: ShieldCheck, perm: 'audit.view' },
      { href: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
    ],
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<Staff>('/auth/me')
      .then((s) => {
        if (!s.verified) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        else setStaff(s);
      })
      .catch(() => router.replace(`/login?next=${encodeURIComponent(pathname)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  if (!staff) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="skeleton h-10 w-40" />
      </div>
    );
  }

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || (pathname.startsWith(`${href}/`) && !GROUPS.flatMap((g) => g.items).some((i) => i.href !== href && i.href.startsWith(href) && pathname.startsWith(i.href))));

  const nav = (
    <nav className="grid gap-5 px-3 py-4" aria-label="Admin">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => staff.permissions.includes(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.title || 'main'} className="grid gap-0.5">
            {g.title && <p className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-white/40">{g.title}</p>}
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={isActive(i.href) ? 'page' : undefined}
                className={clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-[0.84rem] transition-colors', isActive(i.href) ? 'bg-white/12 text-white' : 'text-white/70 hover:bg-white/[0.06] hover:text-white')}
              >
                <i.icon className="h-4 w-4" strokeWidth={1.6} /> {i.label}
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );

  return (
    <StaffCtx.Provider value={staff}>
      <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
        <aside className={clsx('fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-ink text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
          <div className="flex items-center justify-between px-6 py-5">
            <Link href="/" className="flex items-center" aria-label="SSS Furniture admin home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/sss-furniture-white.png" alt="SSS Furniture" width={600} height={195} className="h-10 w-auto" />
            </Link>
            <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
          <div className="border-t border-white/10 p-4">
            <Link href="/account" className="block truncate text-[0.84rem] font-medium">
              {staff.name}
            </Link>
            <p className="truncate text-[0.74rem] text-white/50">{staff.role}</p>
            <div className="mt-3 flex gap-2">
              <a href={storefront} target="_blank" rel="noreferrer" className="flex-1 rounded-md bg-white/[0.08] px-2 py-1.5 text-center text-[0.74rem] hover:bg-white/15">
                View store
              </a>
              <button
                onClick={async () => {
                  await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
                  router.replace('/login');
                }}
                className="flex items-center gap-1.5 rounded-md bg-white/[0.08] px-2 py-1.5 text-[0.74rem] hover:bg-white/15"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="min-w-0">
          <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur lg:hidden">
            <button onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="font-semibold">SSS Furniture Admin</span>
          </div>
          <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
        </div>
      </div>
    </StaffCtx.Provider>
  );
}
