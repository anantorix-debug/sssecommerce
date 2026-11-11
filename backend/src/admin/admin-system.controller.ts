import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { PageType, Prisma } from '@prisma/client';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Perm, StaffGuard } from '../auth/guards';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import { hashPassword } from '../common/crypto';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { PERMISSIONS } from '../common/permissions';
import { RateLimit, RateLimitGuard, RateLimitService } from '../common/rate-limit';
import { AppRequest, clientIp } from '../common/request';
import { SETTING_DEFAULTS, SettingKey, SettingsService } from '../common/settings.service';
import { email, id, zv } from '../common/zod';
import { RevalidateService } from '../content/revalidate.service';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { slugify } from './slug';

const PAID: Prisma.OrderWhereInput['status'] = { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] };

const blockSchema = z.object({ id: z.string().max(60), type: z.string().max(40), data: z.record(z.string(), z.unknown()) });
const pageSchema = z.object({
  type: z.enum(['HOME', 'STATIC', 'POLICY', 'GUIDE', 'FAQ']),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  title: z.string().trim().min(2).max(140),
  excerpt: z.string().trim().max(400).nullable().optional(),
  coverKey: z.string().max(200).nullable().optional(),
  authorName: z.string().trim().max(80).nullable().optional(),
  blocks: z.array(blockSchema).max(60),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(170).nullable().optional(),
});

const SETTING_SCHEMAS: Record<SettingKey, z.ZodType> = {
  store: z.object({
    name: z.string().trim().min(2).max(60), legalName: z.string().trim().min(2).max(120),
    gstin: z.string().trim().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN.'),
    state: z.string().trim().min(2).max(60), stateCode: z.string().regex(/^\d{2}$/), address: z.string().trim().min(5).max(300),
    email: email, phone: z.string().trim().min(6).max(30), supportHours: z.string().trim().max(80),
  }),
  cod: z.object({ enabled: z.boolean(), maxOrderValue: z.number().int().min(0), maxOpenOrders: z.number().int().min(1).max(20) }),
  checkout: z.object({ reservationMinutes: z.number().int().min(5).max(60), freeDeliveryAbove: z.number().int().min(0) }),
  payments: z.object({ online: z.boolean() }),
  announcement: z.object({ text: z.string().trim().max(160), href: z.string().trim().max(200), enabled: z.boolean() }),
  delivery: z.object({
    windows: z.array(z.string().trim().min(3).max(40)).min(1).max(6),
    defaultCapacity: z.number().int().min(1).max(200),
    daysAhead: z.number().int().min(7).max(60),
    allIndia: z.boolean(),
    defaultLeadDays: z.number().int().min(1).max(60),
    defaultFee: z.number().int().min(0),
    defaultCod: z.boolean(),
    defaultInstallation: z.boolean(),
  }),
  finishLibrary: z.array(z.object({ name: z.string(), hex: z.string() })),
  attributeKeys: z.array(z.object({ key: z.string(), label: z.string(), filterable: z.boolean() })),
};

@Controller('admin')
@UseGuards(StaffGuard, RateLimitGuard)
@RateLimit('admin', 'staff')
export class AdminSystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly revalidate: RevalidateService,
    private readonly mail: MailService,
    private readonly limits: RateLimitService,
  ) {}

  // ── Dashboard ──
  /** What still stands between this install and a real launch. Empty list = ready. */
  @Get('launch-checklist')
  @Perm('dashboard.view')
  async launchChecklist() {
    const [store, methods, demoStaff, demoCustomers] = await Promise.all([
      this.settings.get('store'),
      this.settings.paymentMethods(),
      this.prisma.staffUser.count({ where: { active: true, email: { endsWith: '@aangan.example' } } }),
      this.prisma.user.count({ where: { email: { endsWith: '@example.com' } } }),
    ]);
    const items: { key: string; message: string; where: string }[] = [];
    if (store.gstin === SETTING_DEFAULTS.store.gstin) items.push({ key: 'gstin', message: 'The GSTIN is still the placeholder. It prints on every invoice.', where: 'Settings → Store and invoices' });
    if (!(methods.online && config.PAYMENTS_MODE === 'live') && !methods.cod) items.push({ key: 'payments', message: 'No way to take real money yet: online payment is in test mode and cash on delivery is off.', where: 'Live Razorpay keys on the server, or Settings → Payment methods' });
    if (demoStaff) items.push({ key: 'demo-staff', message: `${demoStaff} demo admin account(s) with a published password are active.`, where: 'Team → Staff (deactivate @aangan.example accounts)' });
    if (demoCustomers) items.push({ key: 'demo-data', message: `Demo customers and orders exist (${demoCustomers} @example.com accounts). The live database should start clean.`, where: 'Use a fresh database with npm run setup:owner' });
    config.launchWarnings.forEach((m, i) => items.push({ key: `env-${i}`, message: m, where: 'Server .env file' }));
    return { ready: items.length === 0, items };
  }

  @Get('dashboard')
  @Perm('dashboard.view')
  async dashboard() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const yesterday = new Date(startOfDay.getTime() - 86_400_000);
    const since30 = new Date(startOfDay.getTime() - 29 * 86_400_000);

    const [today, prev, queues, lowStock, series, top, mix] = await Promise.all([
      this.prisma.order.aggregate({ where: { status: PAID, confirmedAt: { gte: startOfDay } }, _sum: { grandTotal: true }, _count: true }),
      this.prisma.order.aggregate({ where: { status: PAID, confirmedAt: { gte: yesterday, lt: startOfDay } }, _sum: { grandTotal: true }, _count: true }),
      Promise.all([
        this.prisma.order.count({ where: { status: 'PENDING_CONFIRMATION' } }),
        this.prisma.order.count({ where: { status: 'CONFIRMED' } }),
        this.prisma.order.count({ where: { status: 'PROCESSING' } }),
        this.prisma.order.count({ where: { status: 'SHIPPED' } }),
        this.prisma.order.count({ where: { status: { in: ['CONFIRMED', 'PROCESSING'] }, deliverySlotId: null } }),
        this.prisma.returnRequest.count({ where: { status: 'REQUESTED' } }),
        this.prisma.returnRequest.count({ where: { status: 'RECEIVED' } }),
        this.prisma.refund.count({ where: { status: { in: ['REQUESTED', 'FAILED'] } } }),
        this.prisma.review.count({ where: { status: 'PENDING' } }),
        this.prisma.payment.count({ where: { method: 'COD', status: 'PENDING_COLLECTION', order: { status: 'DELIVERED' } } }),
        this.prisma.contactMessage.count({ where: { handled: false } }),
        this.prisma.installationJob.count({ where: { status: 'SCHEDULED', scheduledOn: { lte: new Date(startOfDay.getTime() + 2 * 86_400_000) } } }),
      ]),
      // Low stock is judged on a variant's total across warehouses, matching the Inventory screen.
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM (
          SELECT v.id FROM "Variant" v
          JOIN "Product" p ON p.id = v."productId" AND p.status = 'ACTIVE'
          JOIN "InventoryLevel" i ON i."variantId" = v.id
          WHERE v.active
          GROUP BY v.id
          HAVING sum(i."onHand" - i."reserved") <= max(i."lowStockThreshold")
        ) low`,
      this.prisma.$queryRaw<{ day: Date; revenue: bigint; orders: bigint }[]>`
        SELECT date_trunc('day', "confirmedAt" AT TIME ZONE 'Asia/Kolkata') AS day, sum("grandTotal") AS revenue, count(*) AS orders
        FROM "Order" WHERE "confirmedAt" >= ${since30} AND status IN ('CONFIRMED','PROCESSING','SHIPPED','DELIVERED')
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ productName: string; units: bigint; revenue: bigint }[]>`
        SELECT oi."productName", sum(oi.quantity) AS units, sum(oi."lineTotal" - oi.discount) AS revenue
        FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."confirmedAt" >= ${since30} AND o.status IN ('CONFIRMED','PROCESSING','SHIPPED','DELIVERED')
        GROUP BY 1 ORDER BY revenue DESC LIMIT 5`,
      this.prisma.order.groupBy({ by: ['paymentMethod'], where: { status: PAID, confirmedAt: { gte: since30 } }, _count: true, _sum: { grandTotal: true } }),
    ]);

    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(since30.getTime() + i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      const row = series.find((s) => new Date(s.day).toISOString().slice(0, 10) === key);
      return { date: key, revenue: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0) };
    });
    const [codToConfirm, toProcess, toShip, outForDelivery, unscheduled, returnsToReview, returnsToInspect, refundsPending, reviewsPending, codUncollected, messages, installsSoon] = queues;
    return {
      today: { revenue: today._sum.grandTotal ?? 0, orders: today._count, aov: today._count ? Math.round((today._sum.grandTotal ?? 0) / today._count) : 0 },
      yesterday: { revenue: prev._sum.grandTotal ?? 0, orders: prev._count },
      queues: [
        { key: 'codToConfirm', label: 'COD orders to confirm', count: codToConfirm, href: '/orders?status=PENDING_CONFIRMATION', urgent: true },
        { key: 'toProcess', label: 'Confirmed, to prepare', count: toProcess, href: '/orders?status=CONFIRMED' },
        { key: 'toShip', label: 'Packed, to dispatch', count: toShip, href: '/orders?status=PROCESSING' },
        { key: 'outForDelivery', label: 'Out for delivery', count: outForDelivery, href: '/orders?status=SHIPPED' },
        { key: 'unscheduled', label: 'No delivery slot booked', count: unscheduled, href: '/orders?status=CONFIRMED,PROCESSING' },
        { key: 'installsSoon', label: 'Installations in next 2 days', count: installsSoon, href: '/delivery/installations' },
        { key: 'returnsToReview', label: 'Returns to review', count: returnsToReview, href: '/returns?status=REQUESTED', urgent: true },
        { key: 'returnsToInspect', label: 'Returns to inspect', count: returnsToInspect, href: '/returns?status=RECEIVED' },
        { key: 'refundsPending', label: 'Refunds to process', count: refundsPending, href: '/returns/refunds', urgent: true },
        { key: 'codUncollected', label: 'COD cash not recorded', count: codUncollected, href: '/orders/cod' },
        { key: 'lowStock', label: 'Low-stock variants', count: Number(lowStock[0]?.n ?? 0), href: '/inventory?low=1' },
        { key: 'reviewsPending', label: 'Reviews to moderate', count: reviewsPending, href: '/reviews' },
        { key: 'messages', label: 'Unanswered messages', count: messages, href: '/content/messages' },
      ],
      series: days,
      topProducts: top.map((t) => ({ name: t.productName, units: Number(t.units), revenue: Number(t.revenue) })),
      paymentMix: mix.map((m) => ({ method: m.paymentMethod, orders: m._count, revenue: m._sum.grandTotal ?? 0 })),
    };
  }

  // ── Reports ──
  private async salesRows(from: Date, to: Date) {
    const rows = await this.prisma.$queryRaw<{ day: Date; orders: bigint; units: bigint; gross: bigint; discount: bigint; delivery: bigint; tax: bigint; net: bigint }[]>`
      SELECT date_trunc('day', o."confirmedAt" AT TIME ZONE 'Asia/Kolkata') AS day,
        count(DISTINCT o.id) AS orders,
        coalesce(sum(i.units), 0) AS units,
        sum(o.subtotal) AS gross, sum(o."discountTotal") AS discount, sum(o."shippingTotal") AS delivery,
        sum(o."taxTotal") AS tax, sum(o."grandTotal") AS net
      FROM "Order" o
      LEFT JOIN (SELECT "orderId", sum(quantity) AS units FROM "OrderItem" GROUP BY 1) i ON i."orderId" = o.id
      WHERE o."confirmedAt" >= ${from} AND o."confirmedAt" < ${to} AND o.status IN ('CONFIRMED','PROCESSING','SHIPPED','DELIVERED')
      GROUP BY 1 ORDER BY 1`;
    const refunds = await this.prisma.refund.aggregate({ where: { status: 'PROCESSED', processedAt: { gte: from, lt: to } }, _sum: { amount: true } });
    const items = rows.map((r) => ({
      date: new Date(r.day).toISOString().slice(0, 10),
      orders: Number(r.orders), units: Number(r.units), gross: Number(r.gross), discount: Number(r.discount),
      delivery: Number(r.delivery), tax: Number(r.tax), net: Number(r.net),
    }));
    const sum = (k: keyof (typeof items)[number]) => items.reduce((s, r) => s + (r[k] as number), 0);
    return { items, totals: { orders: sum('orders'), units: sum('units'), gross: sum('gross'), discount: sum('discount'), delivery: sum('delivery'), tax: sum('tax'), net: sum('net'), refunds: refunds._sum.amount ?? 0 } };
  }

  @Get('reports/sales')
  @Perm('reports.view')
  sales(@Query(zv(z.object({ from: z.string(), to: z.string() }))) q: { from: string; to: string }) {
    return this.salesRows(new Date(q.from), new Date(new Date(q.to).getTime() + 86_400_000));
  }

  @Get('reports/sales.csv')
  @Perm('reports.export')
  async salesCsv(@Req() req: AppRequest, @Res() res: Response, @Query(zv(z.object({ from: z.string(), to: z.string() }))) q: { from: string; to: string }) {
    await this.limits.hit('adminExport', req.staff!.id);
    const { items, totals } = await this.salesRows(new Date(q.from), new Date(new Date(q.to).getTime() + 86_400_000));
    const rs = (p: number) => (p / 100).toFixed(2);
    const lines = ['Date,Orders,Units,Gross (Rs),Discount (Rs),Delivery (Rs),GST included (Rs),Net (Rs)'];
    for (const r of items) lines.push([r.date, r.orders, r.units, rs(r.gross), rs(r.discount), rs(r.delivery), rs(r.tax), rs(r.net)].join(','));
    lines.push(['Total', totals.orders, totals.units, rs(totals.gross), rs(totals.discount), rs(totals.delivery), rs(totals.tax), rs(totals.net)].join(','));
    await this.audit.log({ staff: req.staff, action: 'report.export', entityType: 'Report', entityId: 'sales', after: q, ip: clientIp(req) });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sales-${q.from}-to-${q.to}.csv"`);
    res.send(lines.join('\n'));
  }

  // ── Content pages ──
  @Get('pages')
  @Perm('content.manage')
  pages(@Query('type') type?: string) {
    return this.prisma.contentPage.findMany({
      where: type ? { type: type as PageType } : {},
      orderBy: [{ type: 'asc' }, { title: 'asc' }],
      select: { id: true, type: true, slug: true, title: true, status: true, updatedAt: true, publishedAt: true },
    });
  }

  @Get('pages/:id')
  @Perm('content.manage')
  async page(@Param('id', zv(id)) pageId: string) {
    const p = await this.prisma.contentPage.findUnique({ where: { id: pageId } });
    if (!p) throw notFound('Page');
    return p;
  }

  @Post('pages')
  @Perm('content.manage')
  async createPage(@Req() req: AppRequest, @Body(zv(pageSchema.partial({ blocks: true, status: true }).extend({ slug: z.string().optional() }))) body: Partial<z.infer<typeof pageSchema>> & { title: string; type: PageType }) {
    const s = slugify(body.slug || body.title);
    if (await this.prisma.contentPage.findUnique({ where: { slug: s } })) throw conflict('SLUG_TAKEN', 'A page with this URL already exists.');
    const p = await this.prisma.contentPage.create({ data: { type: body.type, title: body.title, slug: s, status: 'DRAFT', blocks: (body.blocks ?? []) as Prisma.InputJsonValue } });
    await this.audit.log({ staff: req.staff, action: 'page.create', entityType: 'ContentPage', entityId: p.id, after: { title: p.title }, ip: clientIp(req) });
    return p;
  }

  @Put('pages/:id')
  @Perm('content.manage')
  async savePage(@Req() req: AppRequest, @Param('id', zv(id)) pageId: string, @Body(zv(pageSchema)) body: z.infer<typeof pageSchema>) {
    const before = await this.prisma.contentPage.findUnique({ where: { id: pageId } });
    if (!before) throw notFound('Page');
    if (before.type === 'HOME' && (body.slug !== 'home' || body.type !== 'HOME')) throw badRequest('HOME_LOCKED', 'The homepage keeps its type and URL.');
    const p = await this.prisma.contentPage.update({
      where: { id: pageId },
      data: { ...body, blocks: body.blocks as Prisma.InputJsonValue, publishedAt: body.status === 'ACTIVE' && !before.publishedAt ? new Date() : undefined },
    });
    await this.audit.log({ staff: req.staff, action: 'page.update', entityType: 'ContentPage', entityId: p.id, before: { title: before.title, status: before.status }, after: { title: p.title, status: p.status }, ip: clientIp(req) });
    this.revalidate.tags(p.type === 'HOME' ? ['home'] : ['pages', `page:${p.slug}`, `page:${before.slug}`, 'guides']);
    return p;
  }

  @Delete('pages/:id')
  @HttpCode(204)
  @Perm('content.manage')
  async deletePage(@Req() req: AppRequest, @Param('id', zv(id)) pageId: string) {
    const p = await this.prisma.contentPage.findUnique({ where: { id: pageId } });
    if (!p) throw notFound('Page');
    if (p.type === 'HOME') throw badRequest('HOME_LOCKED', 'The homepage cannot be deleted.');
    await this.prisma.contentPage.delete({ where: { id: pageId } });
    await this.audit.log({ staff: req.staff, action: 'page.delete', entityType: 'ContentPage', entityId: pageId, before: { title: p.title }, ip: clientIp(req) });
    this.revalidate.tags(['pages', `page:${p.slug}`, 'guides']);
  }

  // ── Navigation (footer columns) ──
  @Get('navigation/:location')
  @Perm('content.manage')
  async navigation(@Param('location') location: string) {
    return (await this.prisma.navigationMenu.findUnique({ where: { location } })) ?? { location, items: [] };
  }

  @Put('navigation/:location')
  @Perm('content.manage')
  async saveNavigation(
    @Req() req: AppRequest,
    @Param('location') location: string,
    @Body(zv(z.object({ items: z.array(z.object({ title: z.string().trim().min(1).max(40), links: z.array(z.object({ label: z.string().trim().min(1).max(60), href: z.string().trim().min(1).max(200) })).max(12) })).max(6) }))) body: { items: unknown[] },
  ) {
    if (!['footer'].includes(location)) throw badRequest('MENU_UNKNOWN', 'Unknown menu.');
    const m = await this.prisma.navigationMenu.upsert({ where: { location }, update: { items: body.items as Prisma.InputJsonValue }, create: { location, items: body.items as Prisma.InputJsonValue } });
    await this.audit.log({ staff: req.staff, action: 'navigation.update', entityType: 'NavigationMenu', entityId: location, after: body, ip: clientIp(req) });
    this.revalidate.tags(['settings']);
    return m;
  }

  // ── Redirects ──
  @Get('redirects')
  @Perm('content.manage')
  redirects() {
    return this.prisma.redirect.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Post('redirects')
  @Perm('content.manage')
  async createRedirect(@Req() req: AppRequest, @Body(zv(z.object({ fromPath: z.string().trim().regex(/^\/[^\s]*$/, 'Paths start with /'), toPath: z.string().trim().regex(/^(\/|https:\/\/)[^\s]*$/), code: z.union([z.literal(301), z.literal(302)]).default(301) }))) body: { fromPath: string; toPath: string; code: number }) {
    if (body.fromPath === body.toPath) throw badRequest('REDIRECT_LOOP', 'A page cannot redirect to itself.');
    const r = await this.prisma.redirect.create({ data: body });
    await this.audit.log({ staff: req.staff, action: 'redirect.create', entityType: 'Redirect', entityId: r.id, after: body, ip: clientIp(req) });
    return r;
  }

  @Delete('redirects/:id')
  @HttpCode(204)
  @Perm('content.manage')
  async deleteRedirect(@Req() req: AppRequest, @Param('id', zv(id)) redirectId: string) {
    await this.prisma.redirect.delete({ where: { id: redirectId } });
    await this.audit.log({ staff: req.staff, action: 'redirect.delete', entityType: 'Redirect', entityId: redirectId, ip: clientIp(req) });
  }

  // ── Contact messages ──
  @Get('messages')
  @Perm('customers.read')
  messages() {
    return this.prisma.contactMessage.findMany({ orderBy: [{ handled: 'asc' }, { createdAt: 'desc' }], take: 200 });
  }

  @Post('messages/:id/handled')
  @HttpCode(200)
  @Perm('customers.read')
  async handled(@Param('id', zv(id)) messageId: string, @Body(zv(z.object({ handled: z.boolean() }))) body: { handled: boolean }) {
    return this.prisma.contactMessage.update({ where: { id: messageId }, data: { handled: body.handled } });
  }

  // ── Staff and roles ──
  @Get('staff')
  @Perm('staff.manage')
  async staff() {
    const rows = await this.prisma.staffUser.findMany({ orderBy: { createdAt: 'asc' }, include: { role: { select: { id: true, name: true } } } });
    return rows.map(({ passwordHash, totpSecret, ...s }) => s);
  }

  @Post('staff')
  @Perm('staff.manage')
  async invite(@Req() req: AppRequest, @Body(zv(z.object({ email, name: z.string().trim().min(2).max(80), roleId: id }))) body: { email: string; name: string; roleId: string }) {
    const role = await this.prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) throw notFound('Role');
    if (role.permissions.includes('*') && !req.staff!.role.permissions.includes('*')) throw forbidden('Only an owner can create another owner.');
    const temp = randomBytes(9).toString('base64url');
    const s = await this.prisma.staffUser.create({ data: { email: body.email, name: body.name, roleId: body.roleId, passwordHash: await hashPassword(temp) } });
    await this.mail.queue(body.email, 'staffInvite', { name: body.name, email: body.email, password: temp, url: config.ADMIN_URL });
    await this.audit.log({ staff: req.staff, action: 'staff.invite', entityType: 'StaffUser', entityId: s.id, after: { email: body.email, role: role.name }, ip: clientIp(req) });
    return { id: s.id, temporaryPassword: temp };
  }

  @Patch('staff/:id')
  @Perm('staff.manage')
  async updateStaff(@Req() req: AppRequest, @Param('id', zv(id)) staffId: string, @Body(zv(z.object({ name: z.string().trim().min(2).max(80).optional(), roleId: id.optional(), active: z.boolean().optional(), resetTwoFactor: z.boolean().optional() }))) body: { name?: string; roleId?: string; active?: boolean; resetTwoFactor?: boolean }) {
    const me = req.staff!;
    const target = await this.prisma.staffUser.findUnique({ where: { id: staffId }, include: { role: true } });
    if (!target) throw notFound('Staff member');
    if (staffId === me.id && (body.roleId || body.active === false)) throw forbidden('You cannot change your own role or deactivate yourself.');
    if (target.role.permissions.includes('*') && !me.role.permissions.includes('*')) throw forbidden('Only an owner can change an owner.');
    if (body.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: body.roleId } });
      if (!role) throw notFound('Role');
      if (role.permissions.includes('*') && !me.role.permissions.includes('*')) throw forbidden('Only an owner can grant owner access.');
    }
    if (target.role.permissions.includes('*') && (body.active === false || (body.roleId && body.roleId !== target.roleId))) {
      const owners = await this.prisma.staffUser.count({ where: { active: true, role: { permissions: { has: '*' } } } });
      if (owners <= 1) throw conflict('LAST_OWNER', 'There must always be at least one active owner.');
    }
    const s = await this.prisma.staffUser.update({
      where: { id: staffId },
      data: { name: body.name, roleId: body.roleId, active: body.active, ...(body.resetTwoFactor ? { totpEnabled: false, totpSecret: null } : {}) },
    });
    if (body.active === false || body.roleId || body.resetTwoFactor) await this.prisma.session.deleteMany({ where: { staffId } });
    await this.audit.log({ staff: me, action: 'staff.update', entityType: 'StaffUser', entityId: staffId, before: { roleId: target.roleId, active: target.active }, after: body, ip: clientIp(req) });
    return { id: s.id };
  }

  @Get('roles')
  @Perm('staff.manage')
  async roles() {
    const rows = await this.prisma.role.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { staff: true } } } });
    return { roles: rows.map((r) => ({ ...r, staffCount: r._count.staff })), permissions: Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })) };
  }

  @Post('roles')
  @Perm('staff.manage')
  async createRole(@Req() req: AppRequest, @Body(zv(z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(200).optional(), permissions: z.array(z.enum(Object.keys(PERMISSIONS) as [string, ...string[]])) }))) body: { name: string; description?: string; permissions: string[] }) {
    const r = await this.prisma.role.create({ data: body });
    await this.audit.log({ staff: req.staff, action: 'role.create', entityType: 'Role', entityId: r.id, after: body, ip: clientIp(req) });
    return r;
  }

  @Patch('roles/:id')
  @Perm('staff.manage')
  async updateRole(@Req() req: AppRequest, @Param('id', zv(id)) roleId: string, @Body(zv(z.object({ name: z.string().trim().min(2).max(60).optional(), description: z.string().trim().max(200).optional(), permissions: z.array(z.enum(Object.keys(PERMISSIONS) as [string, ...string[]])).optional() }))) body: { name?: string; description?: string; permissions?: string[] }) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw notFound('Role');
    if (role.isSystem) throw forbidden('Built-in roles cannot be changed. Create a custom role instead.');
    const r = await this.prisma.role.update({ where: { id: roleId }, data: body });
    await this.audit.log({ staff: req.staff, action: 'role.update', entityType: 'Role', entityId: roleId, before: role, after: body, ip: clientIp(req) });
    return r;
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @Perm('staff.manage')
  async deleteRole(@Req() req: AppRequest, @Param('id', zv(id)) roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, include: { _count: { select: { staff: true } } } });
    if (!role) throw notFound('Role');
    if (role.isSystem) throw forbidden('Built-in roles cannot be deleted.');
    if (role._count.staff) throw conflict('ROLE_IN_USE', 'Move staff to another role first.');
    await this.prisma.role.delete({ where: { id: roleId } });
    await this.audit.log({ staff: req.staff, action: 'role.delete', entityType: 'Role', entityId: roleId, before: role, ip: clientIp(req) });
  }

  // ── Audit log ──
  @Get('audit')
  @Perm('audit.view')
  async auditLog(@Query(zv(z.object({ entityType: z.string().max(40).optional(), entityId: z.string().max(100).optional(), actor: z.string().max(100).optional(), action: z.string().max(60).optional(), page: z.coerce.number().int().min(1).default(1) }))) q: { entityType?: string; entityId?: string; actor?: string; action?: string; page: number }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actor ? { actorEmail: { contains: q.actor, mode: 'insensitive' } } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 50, take: 50 }),
    ]);
    return { total, page: q.page, pageCount: Math.max(1, Math.ceil(total / 50)), items };
  }

  // ── Settings ──
  @Get('settings')
  @Perm('settings.manage')
  async allSettings() {
    return {
      settings: await this.settings.all(),
      environment: {
        paymentsMode: config.PAYMENTS_MODE,
        onlinePayments: config.onlinePaymentsEnabled,
        emi: config.FEATURE_EMI,
        shippingProvider: config.SHIPPING_PROVIDER,
        email: config.mailEnabled ? 'SMTP' : 'Development mailbox (storage/mail)',
        googleSignIn: config.googleEnabled,
        twoFactorRequired: config.STAFF_2FA_REQUIRED,
      },
    };
  }

  /** The two checkout switches, saved together so the store can never end up with no way to pay. */
  @Put('payment-methods')
  @Perm('settings.manage')
  async savePaymentMethods(@Req() req: AppRequest, @Body(zv(z.object({ online: z.boolean(), cod: z.boolean() }))) body: { online: boolean; cod: boolean }) {
    if (!body.online && !body.cod) throw badRequest('NO_PAYMENT_METHOD', 'Keep at least one payment method on, or customers cannot check out.');
    if (body.online && !config.onlinePaymentsEnabled) throw badRequest('RAZORPAY_NOT_CONFIGURED', 'Add the Razorpay keys to the server’s .env file before turning on online payment.');
    const before = await this.settings.paymentMethods();
    const cod = await this.settings.get('cod');
    await this.settings.set('payments', { online: body.online }, req.staff!.id);
    await this.settings.set('cod', { ...cod, enabled: body.cod }, req.staff!.id);
    await this.audit.log({ staff: req.staff, action: 'settings.update', entityType: 'Setting', entityId: 'payment-methods', before, after: body, ip: clientIp(req) });
    this.revalidate.tags(['settings', 'home']);
    return this.settings.paymentMethods();
  }

  @Put('settings/:key')
  @Perm('settings.manage')
  async saveSetting(@Req() req: AppRequest, @Param('key') key: string, @Body() body: unknown) {
    if (!(key in SETTING_DEFAULTS)) throw notFound('Setting');
    const parsed = SETTING_SCHEMAS[key as SettingKey].safeParse(body);
    if (!parsed.success) throw badRequest('VALIDATION_FAILED', 'Some fields need attention.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    // The same "at least one way to pay" rule when a switch is saved on its own.
    const methods = await this.settings.paymentMethods();
    const data = parsed.data as { enabled?: boolean; online?: boolean };
    if ((key === 'cod' && data.enabled === false && !methods.online) || (key === 'payments' && data.online === false && !methods.cod)) {
      throw badRequest('NO_PAYMENT_METHOD', 'Keep at least one payment method on, or customers cannot check out.');
    }
    const before = await this.settings.get(key as SettingKey);
    await this.settings.set(key as SettingKey, parsed.data as never, req.staff!.id);
    await this.audit.log({ staff: req.staff, action: 'settings.update', entityType: 'Setting', entityId: key, before, after: parsed.data, ip: clientIp(req) });
    this.revalidate.tags(['settings', 'home']);
    return { key, value: await this.settings.get(key as SettingKey) };
  }
}
