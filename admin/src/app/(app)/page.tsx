'use client';

import clsx from 'clsx';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useStaff } from '@/components/staff';
import { Card, ErrorBox, Loading, PageHeader, Stat } from '@/components/ui';
import { inr, useApi } from '@/lib/api';

interface Dashboard {
  today: { revenue: number; orders: number; aov: number };
  yesterday: { revenue: number; orders: number };
  queues: { key: string; label: string; count: number; href: string; urgent?: boolean }[];
  series: { date: string; revenue: number; orders: number }[];
  topProducts: { name: string; units: number; revenue: number }[];
  paymentMix: { method: string; orders: number; revenue: number }[];
}

export default function DashboardPage() {
  const staff = useStaff();
  const { data, error } = useApi<Dashboard>('/dashboard');
  const { data: launch } = useApi<{ ready: boolean; items: { key: string; message: string; where: string }[] }>('/launch-checklist');
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading rows={10} />;

  const change = data.yesterday.revenue ? Math.round(((data.today.revenue - data.yesterday.revenue) / data.yesterday.revenue) * 100) : null;
  const total30 = data.series.reduce((s, d) => s + d.revenue, 0);
  const orders30 = data.series.reduce((s, d) => s + d.orders, 0);
  const open = data.queues.filter((q) => q.count > 0);

  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${staff.name.split(' ')[0]}`} description={`${open.length ? `${open.reduce((s, q) => s + q.count, 0)} things need attention today.` : 'All queues are clear.'}`} />
      {launch && !launch.ready && (
        <div className="mb-6 rounded-xl border border-warning/30 bg-warning/[0.06] p-5">
          <div className="flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle className="h-4 w-4" /> Before you go live: {launch.items.length} thing{launch.items.length === 1 ? '' : 's'} to fix
          </div>
          <ul className="mt-3 grid gap-2 text-[0.86rem]">
            {launch.items.map((i) => (
              <li key={i.key} className="grid gap-0.5 sm:grid-cols-[1fr_auto] sm:gap-4">
                <span className="text-ink">{i.message}</span>
                <span className="text-muted">{i.where}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Revenue today" value={inr(data.today.revenue)} sub={change === null ? `Yesterday ${inr(data.yesterday.revenue)}` : `${change >= 0 ? '+' : ''}${change}% vs yesterday`} tone={change === null ? undefined : change >= 0 ? 'up' : 'down'} />
        <Stat label="Orders today" value={data.today.orders} sub={`Yesterday ${data.yesterday.orders}`} />
        <Stat label="Average order today" value={data.today.orders ? inr(data.today.aov) : '—'} />
        <Stat label="Last 30 days" value={inr(total30)} sub={`${orders30} confirmed orders`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Work queues" className="xl:col-span-1" padded={false}>
          <ul className="divide-y divide-line">
            {data.queues.map((q) => (
              <li key={q.key}>
                <Link href={q.href} className="group flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas/70">
                  <span className={clsx('text-[0.86rem]', q.count === 0 && 'text-muted')}>{q.label}</span>
                  <span className="flex items-center gap-2">
                    <span className={clsx('grid h-6 min-w-6 place-items-center rounded-full px-2 text-[0.75rem] font-semibold tabular', q.count === 0 ? 'bg-ink/[0.05] text-muted' : q.urgent ? 'bg-clay text-white' : 'bg-ink text-white')}>{q.count}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div className="grid content-start gap-6 xl:col-span-2">
          <Card title="Revenue, last 30 days">
            <RevenueChart series={data.series} />
          </Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Top products, 30 days" padded={false}>
              {data.topProducts.length === 0 ? (
                <p className="p-5 text-[0.86rem] text-muted">No confirmed orders in the last 30 days.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {data.topProducts.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-3 px-5 py-3 text-[0.86rem]">
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 tabular text-muted">
                        {p.units} sold · <span className="text-ink">{inr(p.revenue)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Payment mix, 30 days">
              {data.paymentMix.length === 0 ? (
                <p className="text-[0.86rem] text-muted">No payments yet.</p>
              ) : (
                <div className="grid gap-4">
                  {data.paymentMix.map((m) => {
                    const share = orders30 ? Math.round((m.orders / orders30) * 100) : 0;
                    return (
                      <div key={m.method} className="grid gap-1.5">
                        <div className="flex justify-between text-[0.86rem]">
                          <span>{m.method === 'COD' ? 'Cash on delivery' : 'Online'}</span>
                          <span className="tabular text-muted">
                            {m.orders} orders · {share}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                          <div className={clsx('h-full rounded-full', m.method === 'COD' ? 'bg-clay' : 'bg-accent')} style={{ width: `${share}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function RevenueChart({ series }: { series: Dashboard['series'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((s) => s.revenue));
  const W = 720;
  const H = 180;
  const TOP = 12;
  const bw = W / series.length;
  const last = series.length - 1;
  const showLabel = (i: number) => (i % 7 === 0 && last - i >= 4) || i === last;
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  const active = hover !== null ? series[hover] : null;
  return (
    <div className="grid gap-2">
      <p className="h-5 text-[0.8rem] text-muted" aria-live="polite">
        {active ? `${new Date(active.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}: ${inr(active.revenue)} from ${active.orders} orders` : 'Hover a day for details'}
      </p>
      <svg viewBox={`0 ${-TOP} ${W + 72} ${H + 24 + TOP}`} className="w-full" role="img" aria-label="Daily revenue for the last 30 days">
        {ticks.map((t) => {
          const y = H - (t / max) * H;
          return (
            <g key={t}>
              <line x1={64} x2={W + 64} y1={y} y2={y} stroke="var(--color-line)" strokeDasharray={t ? '3 4' : undefined} />
              <text x={56} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">
                {t >= 100000 ? `₹${Math.round(t / 100000)}k` : `₹${Math.round(t / 100)}`}
              </text>
            </g>
          );
        })}
        {series.map((s, i) => {
          const h = (s.revenue / max) * H;
          return (
            <g key={s.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={64 + i * bw} y={0} width={bw} height={H} fill="transparent" />
              <rect x={64 + i * bw + bw * 0.18} y={H - h} width={bw * 0.64} height={Math.max(h, s.revenue ? 2 : 0)} rx={2} fill={hover === i ? 'var(--color-ink)' : 'var(--color-accent)'} />
            </g>
          );
        })}
        {series.map((s, i) =>
          showLabel(i) ? (
            <text key={s.date} x={64 + i * bw + bw / 2} y={H + 18} textAnchor={i === last ? 'end' : 'middle'} fontSize="11" fill="var(--color-muted)">
              {new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
