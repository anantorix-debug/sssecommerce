'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { call, errorMessage } from '@/lib/client';
import type { Cart, PublicSettings, User } from '@/lib/types';

// ───────────────── Toasts ─────────────────
interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'success' | 'error';
  action?: { label: string; href: string };
}
const ToastCtx = createContext<{ notify: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>) => void }>({ notify: () => {} });
export const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, opts: Partial<Omit<Toast, 'id' | 'message'>> = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone: opts.tone ?? 'default', action: opts.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-center gap-4 rounded-full px-5 py-3 text-[0.9rem] shadow-[0_12px_40px_rgb(0_0_0/0.18)] animate-[toast-in_.35s_var(--ease-out-soft)] ${
              t.tone === 'error' ? 'bg-danger text-white' : 'bg-ink text-paper'
            }`}
          >
            <span>{t.message}</span>
            {t.action && (
              <a href={t.action.href} className="shrink-0 font-semibold underline underline-offset-4">
                {t.action.label}
              </a>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ───────────────── Store settings (from the server layout) ─────────────────
const SettingsCtx = createContext<PublicSettings | null>(null);
export const useSettings = () => useContext(SettingsCtx)!;

// ───────────────── Session ─────────────────
interface SessionState {
  user: User | null;
  ready: boolean;
  googleClientId: string | null;
  refresh: () => Promise<User | null>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}
const SessionCtx = createContext<SessionState | null>(null);
export const useSession = () => useContext(SessionCtx)!;

// ───────────────── Cart ─────────────────
interface CartState {
  cart: Cart | null;
  busy: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  refresh: () => Promise<void>;
  add: (variantId: string, quantity?: number, opts?: { silent?: boolean }) => Promise<boolean>;
  update: (itemId: string, quantity: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<string | null>;
  removeCoupon: () => Promise<void>;
  setPincode: (pincode: string | null) => Promise<Cart | null>;
  replace: (c: Cart) => void;
}
const CartCtx = createContext<CartState | null>(null);
export const useCart = () => useContext(CartCtx)!;

// ───────────────── Wishlist and compare ─────────────────
interface SavedState {
  wishlist: Set<string>;
  toggleWishlist: (productId: string, name?: string) => void;
  compare: string[];
  toggleCompare: (productId: string, name?: string) => void;
  clearCompare: () => void;
  pincode: string | null;
  setPincode: (p: string | null) => void;
}
const SavedCtx = createContext<SavedState | null>(null);
export const useSaved = () => useContext(SavedCtx)!;

const read = (k: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '[]');
  } catch {
    return [];
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable (private mode): state still works for this visit */
  }
};

function Inner({ children }: { children: ReactNode }) {
  const { notify } = useToast();

  // Session
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const refreshSession = useCallback(async () => {
    try {
      const s = await call<{ user: User | null; googleClientId: string | null }>('/store/auth/session');
      setUser(s.user);
      setGoogleClientId(s.googleClientId);
      return s.user;
    } catch {
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  // Cart
  const [cart, setCart] = useState<Cart | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const refreshCart = useCallback(async () => {
    try {
      setCart(await call<Cart>('/store/cart'));
    } catch {
      /* the cart icon simply shows empty */
    }
  }, []);

  const run = useCallback(
    async (fn: () => Promise<Cart>) => {
      setBusy(true);
      try {
        setCart(await fn());
        return true;
      } catch (err) {
        notify(errorMessage(err), { tone: 'error' });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  // Wishlist / compare / pincode
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState<string[]>([]);
  const [pincode, setPin] = useState<string | null>(null);
  const merged = useRef(false);

  useEffect(() => {
    document.documentElement.classList.add('js');
    setCompare(read('compare'));
    try {
      setPin(localStorage.getItem('pincode'));
    } catch {}
    void refreshSession();
    void refreshCart();
  }, [refreshSession, refreshCart]);

  // Wishlist source of truth: server when signed in (after merging guest saves), local otherwise.
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setWishlist(new Set(read('wishlist')));
      merged.current = false;
      return;
    }
    (async () => {
      const local = read('wishlist');
      if (local.length && !merged.current) {
        merged.current = true;
        await call('/me/wishlist', { method: 'POST', json: { productIds: local } }).catch(() => undefined);
        write('wishlist', []);
      }
      const items = await call<{ id: string }[]>('/me/wishlist').catch(() => []);
      setWishlist(new Set(items.map((i) => i.id)));
    })();
  }, [user, ready]);

  const toggleWishlist = useCallback(
    (productId: string, name?: string) => {
      setWishlist((prev) => {
        const next = new Set(prev);
        const adding = !next.has(productId);
        if (adding) next.add(productId);
        else next.delete(productId);
        if (user) {
          void (adding ? call('/me/wishlist', { method: 'POST', json: { productIds: [productId] } }) : call(`/me/wishlist/${productId}`, { method: 'DELETE' })).catch(() =>
            notify('We couldn’t update your wishlist. Please try again.', { tone: 'error' }),
          );
        } else write('wishlist', [...next]);
        notify(adding ? `${name ?? 'Saved'} added to your wishlist` : `${name ?? 'Item'} removed from your wishlist`, adding ? { action: { label: 'View', href: '/wishlist' } } : {});
        return next;
      });
    },
    [user, notify],
  );

  const toggleCompare = useCallback(
    (productId: string, name?: string) => {
      setCompare((prev) => {
        let next: string[];
        if (prev.includes(productId)) next = prev.filter((x) => x !== productId);
        else if (prev.length >= 3) {
          notify('You can compare up to 3 pieces. Remove one first.');
          return prev;
        } else {
          next = [...prev, productId];
          notify(`${name ?? 'Item'} added to compare`, next.length >= 2 ? { action: { label: 'Compare', href: '/compare' } } : {});
        }
        write('compare', next);
        return next;
      });
    },
    [notify],
  );

  const setPincodeCart = useCallback(async (p: string | null) => {
    try {
      const c = await call<Cart>('/store/cart/pincode', { method: 'PUT', json: { pincode: p } });
      setCart(c);
      return c;
    } catch (err) {
      notify(errorMessage(err), { tone: 'error' });
      return null;
    }
  }, [notify]);

  const setPincode = useCallback(
    (p: string | null) => {
      setPin(p);
      try {
        if (p) localStorage.setItem('pincode', p);
        else localStorage.removeItem('pincode');
      } catch {}
      void setPincodeCart(p);
    },
    [setPincodeCart],
  );

  const sessionValue = useMemo<SessionState>(
    () => ({
      user,
      ready,
      googleClientId,
      refresh: refreshSession,
      setUser: (u) => {
        setUser(u);
        void refreshCart();
      },
      logout: async () => {
        await call('/store/auth/logout', { method: 'POST' }).catch(() => undefined);
        setUser(null);
        setCart(null);
        void refreshCart();
      },
    }),
    [user, ready, googleClientId, refreshSession, refreshCart],
  );

  const cartValue = useMemo<CartState>(
    () => ({
      cart,
      busy,
      open,
      setOpen,
      refresh: refreshCart,
      replace: setCart,
      add: async (variantId, quantity = 1, opts) => {
        const ok = await run(() => call<Cart>('/store/cart/items', { method: 'POST', json: { variantId, quantity } }));
        if (ok && !opts?.silent) setOpen(true);
        return ok;
      },
      update: async (itemId, quantity) => {
        await run(() => call<Cart>(`/store/cart/items/${itemId}`, { method: 'PATCH', json: { quantity } }));
      },
      remove: async (itemId) => {
        await run(() => call<Cart>(`/store/cart/items/${itemId}`, { method: 'DELETE' }));
      },
      applyCoupon: async (code) => {
        try {
          setCart(await call<Cart>('/store/cart/coupon', { method: 'POST', json: { code } }));
          return null;
        } catch (err) {
          return errorMessage(err);
        }
      },
      removeCoupon: async () => {
        await run(() => call<Cart>('/store/cart/coupon', { method: 'DELETE' }));
      },
      setPincode: setPincodeCart,
    }),
    [cart, busy, open, run, refreshCart, setPincodeCart],
  );

  const savedValue = useMemo<SavedState>(
    () => ({ wishlist, toggleWishlist, compare, toggleCompare, clearCompare: () => { setCompare([]); write('compare', []); }, pincode, setPincode }),
    [wishlist, toggleWishlist, compare, toggleCompare, pincode, setPincode],
  );

  return (
    <SessionCtx.Provider value={sessionValue}>
      <CartCtx.Provider value={cartValue}>
        <SavedCtx.Provider value={savedValue}>{children}</SavedCtx.Provider>
      </CartCtx.Provider>
    </SessionCtx.Provider>
  );
}

export function Providers({ settings, children }: { settings: PublicSettings; children: ReactNode }) {
  return (
    <SettingsCtx.Provider value={settings}>
      <ToastProvider>
        <Inner>{children}</Inner>
      </ToastProvider>
    </SettingsCtx.Provider>
  );
}
