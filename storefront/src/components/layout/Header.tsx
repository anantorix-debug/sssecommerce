'use client';

import clsx from 'clsx';
import { Hammer, Heart, MapPin, Menu, Phone, Search, ShoppingBag, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Navigation } from '@/lib/types';
import { useCart, useSaved, useSession, useSettings } from '../providers';
import { Logo } from '../ui/misc';
import { AnnouncementTicker, ShowroomStatus, TypingPlaceholder } from './HeaderBits';
import { MegaMenu, type MenuKey } from './MegaMenu';
import { MiniCart } from './MiniCart';
import { MobileMenu } from './MobileMenu';
import { PincodeDialog } from './PincodeDialog';
import { SearchOverlay } from './SearchOverlay';

/**
 * Three tiers, Urban Ladder style but our own:
 *  1. Brand strip: live "showroom open now" status, rotating announcements, help and phone (scrolls away).
 *  2. Main bar: logo, a wide search whose placeholder types real searches, deliver-to pincode, account, wishlist, cart.
 *  3. Category row with a sliding maroon indicator and rich mega menus (promo cards priced live from the catalogue).
 * Phones get a full-width search bar and, on the home page, round category pictures.
 */
export function Header({ nav }: { nav: Navigation }) {
  const pathname = usePathname();
  const settings = useSettings();
  const { cart, setOpen: setCartOpen } = useCart();
  const { wishlist, pincode } = useSaved();
  const { user } = useSession();

  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const lastY = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      // On small screens the header steps aside while scrolling down and returns on scroll up.
      if (window.innerWidth < 1024) setHidden((h) => (y > 240 && y > lastY.current + 4 ? true : y < lastY.current - 4 ? false : h));
      else setHidden(false);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenu(null);
    setSearchOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/input|textarea|select/i.test((e.target as HTMLElement).tagName))) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // A short intent delay stops menus flashing open as the pointer crosses the row.
  const openMenu = useCallback((key: MenuKey | null) => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setMenu(key), menuOpenDelay);
  }, []);
  const keepMenu = () => {
    clearTimeout(closeTimer.current);
  };
  const scheduleClose = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMenu(null), 180);
  };

  const count = cart?.itemCount ?? 0;
  const firstName = user?.name?.split(' ')[0];
  // Home page, desktop: the header floats over the hero photo until the visitor scrolls, opens a menu or points at it.
  const home = pathname === '/';
  const over = home && !scrolled && menu === null && !hovering;
  const tel = `tel:${settings.store.phone.replace(/[^\d+]/g, '')}`;

  return (
    <>
      <div className="scroll-progress" aria-hidden />

      {/* 1. Brand strip */}
      <div className="relative z-[61] bg-ink text-paper">
        <div className="container-x flex h-9 items-center gap-6 text-[0.76rem]">
          <ShowroomStatus className="hidden shrink-0 lg:flex" />
          <AnnouncementTicker className="min-w-0 flex-1" />
          <nav aria-label="Help" className="hidden shrink-0 items-center gap-5 text-paper/80 lg:flex">
            <Link href="/track" className="hover:text-white">
              Track order
            </Link>
            <Link href="/contact" className="hover:text-white">
              Help
            </Link>
            <a href={tel} className="flex items-center gap-1.5 font-medium text-paper hover:text-white">
              <Phone className="h-3.5 w-3.5 text-brass-soft" strokeWidth={1.8} />
              <span className="tabular">{settings.store.phone}</span>
            </a>
          </nav>
        </div>
      </div>

      <header
        data-home={home || undefined}
        data-over={over || undefined}
        className={clsx(
          'site-header sticky top-0 z-[60] border-b border-white/60 bg-surface/80 backdrop-blur-2xl backdrop-saturate-150',
          scrolled ? 'shadow-[0_10px_30px_-18px_rgb(20_10_8/0.35)]' : '',
          hidden && !menu && 'max-lg:-translate-y-full',
        )}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => {
          setHovering(false);
          scheduleClose();
        }}
      >
        {/* 2. Main bar */}
        <div className="hdr-main container-x flex h-16 items-center gap-3 lg:h-[4.75rem] lg:gap-8">
          <button className="-ml-2 grid h-10 w-10 place-items-center rounded-full lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="h-[22px] w-[22px]" strokeWidth={1.5} />
          </button>

          <Link href="/" className="logo-link relative shrink-0" aria-label={`${settings.store.name} home`}>
            <Logo alt="" priority className="hdr-logo-colour h-9 lg:h-11" />
            <Logo tone="white" alt="" priority className="hdr-logo-white absolute left-0 top-0 h-9 opacity-0 lg:h-11" />
          </Link>

          {/* Wide search (desktop) */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hdr-search group hidden h-12 max-w-2xl flex-1 items-center gap-3 rounded-full border border-line-strong bg-paper pl-5 pr-2 text-left text-[0.92rem] transition-[border-color,box-shadow,background-color] duration-300 hover:border-ink/40 hover:bg-surface hover:shadow-[0_8px_24px_-14px_rgb(0_0_0/0.35)] lg:flex"
            aria-label="Search the store"
          >
            <Search className="h-[19px] w-[19px] text-accent" strokeWidth={1.8} />
            <TypingPlaceholder className="flex-1 truncate text-muted" />
            <kbd className="rounded-md border border-line bg-surface px-2 py-1 font-sans text-[0.68rem] font-semibold tracking-[0.04em] text-muted">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-0.5 lg:gap-2">
            <button onClick={() => setSearchOpen(true)} className="grid h-10 w-10 place-items-center rounded-full lg:hidden" aria-label="Search">
              <Search className="h-[20px] w-[20px]" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => setPinOpen(true)}
              className="hidden items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-paper-2 xl:flex"
              aria-label={pincode ? `Delivering to ${pincode}. Change pincode` : 'Set delivery pincode'}
            >
              <MapPin className="h-[19px] w-[19px] text-accent" strokeWidth={1.6} />
              <span className="grid leading-tight">
                <span className="text-[0.7rem] text-muted">Deliver to</span>
                <span className="text-[0.86rem] font-semibold tabular">{pincode ?? 'Set pincode'}</span>
              </span>
            </button>
            <IconLink href={user ? '/account' : '/login'} label={firstName ? `Hi, ${firstName}` : 'Sign in'} ariaLabel={user ? 'Your account' : 'Sign in'}>
              <User className="h-[20px] w-[20px]" strokeWidth={1.5} />
            </IconLink>
            <IconLink href="/wishlist" label="Wishlist" ariaLabel={`Wishlist, ${wishlist.size} items`} badge={wishlist.size}>
              <Heart className="h-[20px] w-[20px]" strokeWidth={1.5} />
            </IconLink>
            <button onClick={() => setCartOpen(true)} className="group relative grid place-items-center gap-0.5 rounded-xl px-2 py-1 lg:min-w-14" aria-label={`Cart, ${count} items`}>
              <span className="relative grid h-7 w-7 place-items-center">
                <ShoppingBag className="h-[20px] w-[20px] transition-transform duration-300 group-hover:-translate-y-0.5" strokeWidth={1.5} />
                {count > 0 && <Count n={count} />}
              </span>
              <span className="hidden text-[0.7rem] font-medium text-ink-soft lg:block">Cart</span>
            </button>
          </div>
        </div>

        {/* Phone: full-width search */}
        <div className="container-x pb-3 lg:hidden">
          <button onClick={() => setSearchOpen(true)} className="flex h-11 w-full items-center gap-3 rounded-full border border-line-strong bg-paper px-4 text-left text-[0.9rem]" aria-label="Search the store">
            <Search className="h-[18px] w-[18px] shrink-0 text-accent" strokeWidth={1.8} />
            <TypingPlaceholder className="min-w-0 flex-1 truncate text-muted" />
          </button>
        </div>

        {/* 3. Category row (desktop) */}
        <CategoryRow nav={nav} pathname={pathname} menu={menu} onHover={openMenu} onLeaveItem={keepMenu} />

        <MegaMenu open={menu} nav={nav} onClose={() => setMenu(null)} onEnter={keepMenu} />
      </header>

      {/* Phone, home page: round category pictures */}
      {pathname === '/' && <CategoryCircles nav={nav} />}

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} nav={nav} />
      <MiniCart />
      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} nav={nav} onPincode={() => setPinOpen(true)} />
      <PincodeDialog open={pinOpen} onClose={() => setPinOpen(false)} />
    </>
  );
}

const menuOpenDelay = 90;

function IconLink({ href, label, ariaLabel, badge, children }: { href: string; label: string; ariaLabel: string; badge?: number; children: React.ReactNode }) {
  return (
    <Link href={href} className="group relative grid place-items-center gap-0.5 rounded-xl px-2 py-1 lg:min-w-14" aria-label={ariaLabel}>
      <span className="relative grid h-7 w-7 place-items-center transition-transform duration-300 group-hover:-translate-y-0.5">
        {children}
        {badge ? <Count n={badge} /> : null}
      </span>
      <span className="hidden max-w-20 truncate text-[0.7rem] font-medium text-ink-soft lg:block">{label}</span>
    </Link>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span
      key={n} // remounts on change, so the pop replays each time something is added
      className="badge-pop absolute -right-1.5 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[0.64rem] font-semibold text-white tabular ring-2 ring-surface"
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

/** Category links with a maroon indicator that glides to whichever item is hovered (or the current section). */
function CategoryRow({ nav, pathname, menu, onHover, onLeaveItem }: { nav: Navigation; pathname: string; menu: MenuKey | null; onHover: (k: MenuKey | null) => void; onLeaveItem: () => void }) {
  const items: { key: MenuKey | null; id: string; label: string; href: string; isNew?: boolean }[] = [
    { key: null, id: 'new', label: 'New arrivals', href: '/shop?sort=new', isNew: true },
    ...nav.categories.map((c) => ({ key: `cat:${c.slug}` as MenuKey, id: `cat:${c.slug}`, label: c.name, href: `/shop/${c.slug}` })),
    { key: 'rooms', id: 'rooms', label: 'Rooms', href: '/rooms' },
    { key: 'collections', id: 'collections', label: 'Collections', href: '/collections' },
  ];
  const current = items.find((i) => i.id !== 'new' && pathname.startsWith(i.href))?.id ?? null;
  const [hover, setHover] = useState<string | null>(null);
  const target = (menu ? items.find((i) => i.key === menu)?.id : null) ?? hover ?? current;

  const row = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = target ? row.current?.querySelector<HTMLElement>(`[data-nav-id="${target}"]`) : null;
    setBar(el ? { left: el.offsetLeft + 14, width: el.offsetWidth - 28 } : null);
  }, [target]);

  return (
    <div className="hdr-cats hidden border-t border-line/70 lg:block" onMouseLeave={() => setHover(null)}>
      <div className="container-x flex items-center gap-4">
        <div ref={row} className="no-scrollbar relative -ml-3.5 flex h-12 min-w-0 flex-1 items-stretch overflow-x-auto">
          {items.map((item) => (
            <Link
              key={item.id}
              data-nav-id={item.id}
              href={item.href}
              onMouseEnter={() => {
                setHover(item.id);
                onHover(item.key);
              }}
              onFocus={() => onHover(item.key)}
              onMouseMove={onLeaveItem}
              aria-expanded={item.key ? menu === item.key : undefined}
              aria-haspopup={item.key ? 'true' : undefined}
              data-active={target === item.id || undefined}
              className={clsx(
                'hdr-cat relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 text-[0.88rem] font-medium transition-colors duration-200',
                target === item.id ? 'text-accent' : 'text-ink-soft hover:text-ink',
              )}
            >
              {item.label}
              {item.isNew && <span className="rounded-full bg-accent px-1.5 py-px text-[0.58rem] font-bold uppercase tracking-[0.08em] text-white">New</span>}
            </Link>
          ))}
          <span
            aria-hidden
            className="hdr-bar pointer-events-none absolute bottom-0 h-[2.5px] rounded-full bg-accent transition-[transform,width,opacity] duration-300 ease-[var(--ease-out-soft)]"
            style={{ transform: `translateX(${bar?.left ?? 0}px)`, width: bar?.width ?? 0, opacity: bar ? 1 : 0 }}
          />
        </div>
        <Link
          href="/contact"
          onMouseEnter={() => onHover(null)}
          className="group hidden shrink-0 items-center gap-2 rounded-full border border-brass/40 bg-[linear-gradient(120deg,#fbf3e4,#f3e2c4)] px-4 py-1.5 text-[0.82rem] font-semibold text-[#6b4b1c] shadow-[inset_0_1px_0_rgb(255_255_255/0.7)] transition-shadow hover:shadow-[0_6px_18px_-8px_rgb(156_122_67/0.7)] xl:flex"
        >
          <Hammer className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-rotate-12" strokeWidth={2} />
          Made to order
        </Link>
      </div>
    </div>
  );
}

/** Phones, home page: round category pictures that scroll sideways (like stories). */
function CategoryCircles({ nav }: { nav: Navigation }) {
  return (
    <nav aria-label="Categories" className="border-b border-line bg-surface lg:hidden">
      <ul className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-3">
        <li className="shrink-0 animate-[row-in_.45s_var(--ease-out-soft)_both]">
          <Link href="/shop?sort=new" className="grid w-16 justify-items-center gap-1.5 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-[conic-gradient(from_200deg,var(--color-accent),var(--color-brass-soft),var(--color-accent))] p-[2.5px]">
              <span className="grid h-full w-full place-items-center rounded-full bg-accent text-[0.72rem] font-bold uppercase tracking-[0.06em] text-white ring-2 ring-surface">New</span>
            </span>
            <span className="text-[0.72rem] font-medium leading-tight">New in</span>
          </Link>
        </li>
        {nav.categories.map((c, i) => (
          <li key={c.slug} className="shrink-0 animate-[row-in_.45s_var(--ease-out-soft)_both]" style={{ animationDelay: `${(i + 1) * 45}ms` }}>
            <Link href={`/shop/${c.slug}`} className="grid w-16 justify-items-center gap-1.5 text-center">
              <span className="rounded-full bg-[conic-gradient(from_200deg,var(--color-accent),var(--color-brass-soft),var(--color-accent))] p-[2.5px]">
                <span className="relative block h-[3.6rem] w-[3.6rem] overflow-hidden rounded-full bg-paper-2 ring-2 ring-surface">
                  {c.image && <Image src={c.image} alt="" fill sizes="64px" className="object-cover" />}
                </span>
              </span>
              <span className="line-clamp-2 text-[0.72rem] font-medium leading-tight">{c.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
