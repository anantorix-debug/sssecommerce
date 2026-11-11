'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSettings } from '../providers';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Showroom hours (IST). Kept here rather than parsed from the free-text "support hours" setting. */
const OPEN_HOUR = 10;
const CLOSE_HOUR = 19;
const CLOSED_DAY = 0; // Sunday
const fmtHour = (h: number) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;

function showroomState(now = new Date()) {
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  const hour = ist.getHours() + ist.getMinutes() / 60;
  if (day !== CLOSED_DAY && hour >= OPEN_HOUR && hour < CLOSE_HOUR) {
    return { open: true, text: CLOSE_HOUR - hour <= 1 ? `Open now · closing at ${fmtHour(CLOSE_HOUR)}` : `Open now · till ${fmtHour(CLOSE_HOUR)}` };
  }
  // Next opening: later today if it's before opening time, otherwise the next day that isn't Sunday.
  const when = day !== CLOSED_DAY && hour < OPEN_HOUR ? 'today' : (day + 1) % 7 === CLOSED_DAY ? 'Monday' : 'tomorrow';
  return { open: false, text: `Closed · opens ${fmtHour(OPEN_HOUR)} ${when}` };
}

/** "Salem showroom · Open now · till 7 pm" with a live pulsing dot. Rendered after mount so it uses the visitor's clock. */
export function ShowroomStatus({ className }: { className?: string }) {
  const [state, setState] = useState<ReturnType<typeof showroomState> | null>(null);
  useEffect(() => {
    setState(showroomState());
    const t = setInterval(() => setState(showroomState()), 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <Link href="/contact" className={clsx('group items-center gap-2 text-paper/85 hover:text-white', className)}>
      <span className="relative grid h-2 w-2 place-items-center" aria-hidden>
        {state?.open && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />}
        <span className={clsx('relative inline-flex h-2 w-2 rounded-full', state ? (state.open ? 'bg-emerald-400' : 'bg-paper/40') : 'bg-paper/25')} />
      </span>
      <span>
        <span className="font-semibold text-paper">Salem showroom</span>
        {state && <span className="text-paper/70"> · {state.text}</span>}
      </span>
    </Link>
  );
}

/** Rotates the store announcement with a few brand messages; slides each one up. Pauses on hover. */
export function AnnouncementTicker({ className }: { className?: string }) {
  const settings = useSettings();
  const messages = [
    ...(settings.announcement ? [{ text: settings.announcement.text, href: settings.announcement.href }] : []),
    { text: 'Custom sizes and finishes, made in our Salem workshop', href: '/contact' },
    { text: 'Free installation by our own team on every furniture order', href: '/policies/shipping' },
  ];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || messages.length < 2 || reducedMotion()) return;
    const t = setInterval(() => setI((n) => (n + 1) % messages.length), 4500);
    return () => clearInterval(t);
  }, [paused, messages.length]);
  const m = messages[i % messages.length];
  return (
    <div className={clsx('relative flex h-full items-center justify-center overflow-hidden', className)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-live="off">
      <Link key={i} href={m.href} className="truncate text-center tracking-[0.02em] text-paper/90 animate-[ticker-in_.55s_var(--ease-out-soft)_both] hover:text-white">
        {m.text}
      </Link>
    </div>
  );
}

const TYPED = ['teak dining set', 'recliner sofa', 'king size bed', 'office chair', 'study table', 'sheesham sideboard'];

/** Search placeholder that types real example searches, one after another. */
export function TypingPlaceholder({ className }: { className?: string }) {
  const [text, setText] = useState('');
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (reducedMotion()) return;
    setAnimate(true);
    let word = 0;
    let char = 0;
    let deleting = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      const w = TYPED[word];
      if (!deleting) {
        char++;
        setText(w.slice(0, char));
        if (char === w.length) {
          deleting = true;
          t = setTimeout(tick, 1600);
          return;
        }
        t = setTimeout(tick, 70 + Math.random() * 50);
      } else {
        char--;
        setText(w.slice(0, char));
        if (char === 0) {
          deleting = false;
          word = (word + 1) % TYPED.length;
          t = setTimeout(tick, 350);
          return;
        }
        t = setTimeout(tick, 32);
      }
    };
    t = setTimeout(tick, 700);
    return () => clearTimeout(t);
  }, []);
  if (!animate) return <span className={className}>Search sofas, beds, teak…</span>;
  return (
    <span className={className} aria-hidden>
      Search for “<span className="text-ink-soft">{text}</span>
      <span className="hdr-caret ml-px inline-block h-[1.05em] w-[1.5px] translate-y-[2px] bg-accent animate-[caret_1s_steps(1)_infinite]" />”
    </span>
  );
}
