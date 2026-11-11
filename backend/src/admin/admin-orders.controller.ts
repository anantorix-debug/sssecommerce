import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { InstallationStatus, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { Perm, StaffGuard } from '../auth/guards';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import { badRequest, conflict, forbidden, notFound } from '../common/errors';
import { hasPermission } from '../common/permissions';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { AppRequest, clientIp } from '../common/request';
import { id, zv } from '../common/zod';
import { SchedulingService } from '../delivery/scheduling.service';
import { InvoiceService } from '../invoices/invoice.service';
import { MailService } from '../notifications/mail.service';
import { OrderService, STATUS_LABEL } from '../orders/order.service';
import { RefundService } from '../payments/refund.service';
import { PrismaService } from '../prisma/prisma.service';

const transitionSchema = z.object({
  action: z.enum(['confirm_cod', 'start_processing', 'ship', 'deliver', 'cancel']),
  note: z.string().trim().max(500).optional(),
  trackingNote: z.string().trim().max(300).optional(),
  version: z.number().int(),
});

@Controller('admin')
@UseGuards(StaffGuard, RateLimitGuard)
@RateLimit('admin', 'staff')
export class AdminOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly refunds: RefundService,
    private readonly invoices: InvoiceService,
    private readonly scheduling: SchedulingService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  @Get('orders')
  @Perm('orders.read')
  async list(@Query(zv(z.object({
    status: z.string().optional(),
    method: z.enum(['ONLINE', 'COD']).optional(),
    q: z.string().max(100).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
  }))) q: { status?: string; method?: PaymentMethod; q?: string; from?: string; to?: string; page: number }) {
    const statuses = q.status?.split(',').filter((s): s is OrderStatus => s in STATUS_LABEL);
    const where: Prisma.OrderWhereInput = {
      ...(statuses?.length ? { status: { in: statuses } } : { status: { not: 'EXPIRED' } }),
      ...(q.method ? { paymentMethod: q.method } : {}),
      ...(q.q ? { OR: [{ orderNumber: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {}),
      ...(q.from || q.to ? { placedAt: { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(`${q.to}T23:59:59`) : undefined } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (q.page - 1) * 30,
        take: 30,
        include: { _count: { select: { items: true } }, deliverySlot: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
    ]);
    return {
      total,
      page: q.page,
      pageCount: Math.max(1, Math.ceil(total / 30)),
      items: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        placedAt: o.placedAt,
        name: o.name,
        email: o.email,
        phone: o.phone,
        city: (o.shippingAddress as { city?: string }).city,
        status: o.status,
        statusLabel: STATUS_LABEL[o.status],
        paymentMethod: o.paymentMethod,
        paymentStatus: o.payments[0]?.status ?? null,
        total: o.grandTotal,
        itemCount: o._count.items,
        slot: o.deliverySlot ? `${o.deliverySlot.date.toISOString().slice(0, 10)} ${o.deliverySlot.window}` : null,
      })),
    };
  }

  @Get('orders/:id')
  @Perm('orders.read')
  async detail(@Req() req: AppRequest, @Param('id', zv(id)) orderId: string) {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        events: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
        refunds: { orderBy: { createdAt: 'asc' } },
        invoice: { select: { id: true, number: true, issuedAt: true } },
        deliverySlot: true,
        installations: { orderBy: { createdAt: 'desc' } },
        returns: { select: { id: true, returnNumber: true, status: true } },
        user: { select: { id: true, email: true, name: true } },
      },
    });
    if (!o) throw notFound('Order');
    await this.audit.log({ staff: req.staff, action: 'order.view', entityType: 'Order', entityId: o.id, ip: clientIp(req) });
    const actors = await this.prisma.staffUser.findMany({ where: { id: { in: o.events.map((e) => e.actorId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
    return {
      ...o,
      statusLabel: STATUS_LABEL[o.status],
      items: o.items.map((i) => ({ ...i, image: i.imageKey ? `/media/${i.imageKey}` : null })),
      events: o.events.map((e) => ({ ...e, label: STATUS_LABEL[e.toStatus], actorName: e.actorType === 'STAFF' ? actors.find((a) => a.id === e.actorId)?.name ?? 'Staff' : e.actorType === 'CUSTOMER' ? 'Customer' : 'System' })),
      storefrontUrl: this.orders.orderUrl(o),
      allowed: this.allowedActions(o.status, o.paymentMethod),
    };
  }

  private allowedActions(status: OrderStatus, method: PaymentMethod) {
    return {
      confirm_cod: status === 'PENDING_CONFIRMATION' && method === 'COD',
      start_processing: status === 'CONFIRMED',
      ship: status === 'PROCESSING',
      deliver: status === 'SHIPPED',
      cancel: ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING'].includes(status),
    };
  }

  @Post('orders/:id/transition')
  @HttpCode(200)
  @Perm('orders.write')
  async transition(@Req() req: AppRequest, @Param('id', zv(id)) orderId: string, @Body(zv(transitionSchema)) body: z.infer<typeof transitionSchema>) {
    const staff = req.staff!;
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, deliverySlot: true } });
    if (!order) throw notFound('Order');
    if (order.version !== body.version) throw conflict('ORDER_STATE_CHANGED', 'This order was just updated by someone else. Refresh to see the latest.');
    const actor = { type: 'STAFF' as const, id: staff.id };

    if (body.action === 'cancel') {
      if (!hasPermission(staff.role.permissions, 'orders.cancel')) throw forbidden();
      if (!body.note) throw badRequest('REASON_REQUIRED', 'Give a cancellation reason the customer will see.');
      await this.orders.cancel(orderId, actor, body.note);
    } else {
      await this.prisma.$transaction(async (tx) => {
        const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, deliverySlot: true } });
        if (body.action === 'confirm_cod') {
          if (fresh.paymentMethod !== 'COD') throw badRequest('NOT_COD', 'Only cash-on-delivery orders need confirmation.');
          await this.orders.transition(tx, fresh, 'CONFIRMED', actor, body.note ?? 'COD order confirmed with customer');
          await this.invoices.issue(tx, fresh.id);
          await this.mail.queue(fresh.email, 'orderConfirmed', this.orders.summary(fresh), tx);
        } else if (body.action === 'start_processing') {
          await this.orders.transition(tx, fresh, 'PROCESSING', actor, body.note ?? 'Being prepared for dispatch');
        } else if (body.action === 'ship') {
          await this.orders.transition(tx, fresh, 'SHIPPED', actor, body.note ?? 'Dispatched', { trackingNote: body.trackingNote });
          const slot = fresh.deliverySlot ? `${fresh.deliverySlot.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}, ${fresh.deliverySlot.window}` : null;
          await this.mail.queue(fresh.email, 'orderShipped', { ...this.orders.summary(fresh), slot, note: body.trackingNote }, tx);
        } else if (body.action === 'deliver') {
          await this.orders.transition(tx, fresh, 'DELIVERED', actor, body.note ?? 'Delivered');
          await tx.installationJob.updateMany({ where: { orderId, status: 'SCHEDULED', scheduledOn: { lte: new Date() } }, data: { status: 'COMPLETED', completedAt: new Date() } });
          const reviewUrl = fresh.userId ? `${config.STOREFRONT_URL}/account/orders/${fresh.orderNumber}` : this.orders.orderUrl(fresh);
          await this.mail.queue(fresh.email, 'orderDelivered', { ...this.orders.summary(fresh), reviewUrl }, tx);
        }
      });
    }
    await this.audit.log({ staff, action: `order.${body.action}`, entityType: 'Order', entityId: orderId, after: body, ip: clientIp(req) });
    return this.detail(req, orderId);
  }

  @Post('orders/:id/notes')
  @HttpCode(200)
  @Perm('orders.read')
  async note(@Req() req: AppRequest, @Param('id', zv(id)) orderId: string, @Body(zv(z.object({ text: z.string().trim().min(1).max(1000) }))) body: { text: string }) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound('Order');
    const notes = [...((order.internalNotes as object[]) ?? []), { text: body.text, by: req.staff!.name, at: new Date().toISOString() }];
    await this.prisma.order.update({ where: { id: orderId }, data: { internalNotes: notes } });
    return { notes };
  }

  /** Partial or full refund on an order (online: back to the payment; COD: manual payout). */
  @Post('orders/:id/refunds')
  @Perm('refunds.approve')
  async refund(
    @Req() req: AppRequest,
    @Param('id', zv(id)) orderId: string,
    @Body(zv(z.object({ amount: z.number().int().min(100), reason: z.string().trim().min(3).max(300), method: z.enum(['ORIGINAL', 'BANK_TRANSFER', 'UPI']), payoutDetails: z.string().trim().max(300).optional() }))) body: { amount: number; reason: string; method: 'ORIGINAL' | 'BANK_TRANSFER' | 'UPI'; payoutDetails?: string },
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) throw notFound('Order');
    const payment = order.payments.find((p) => ['CAPTURED', 'PARTIALLY_REFUNDED', 'COLLECTED'].includes(p.status));
    if (!payment) throw badRequest('NOTHING_TO_REFUND', 'This order has no completed payment to refund.');
    if (body.method === 'ORIGINAL' && payment.method !== 'ONLINE') throw badRequest('REFUND_METHOD_INVALID', 'Cash payments are refunded by bank transfer or UPI.');
    const refund = await this.prisma.$transaction((tx) =>
      this.refunds.create(tx, { orderId, paymentId: payment.id, amount: body.amount, reason: body.reason, method: body.method, requestedBy: req.staff!.id, payoutDetails: body.payoutDetails }),
    );
    await this.audit.log({ staff: req.staff, action: 'refund.create', entityType: 'Refund', entityId: refund.id, after: body, ip: clientIp(req) });
    if (body.method === 'ORIGINAL') return this.refunds.process(refund.id, req.staff!.id);
    return refund;
  }

  // ── Cash on delivery ──
  @Get('cod')
  @Perm('cod.manage')
  async codCollections(@Query(zv(z.object({ state: z.enum(['uncollected', 'collected', 'all']).default('uncollected') }))) q: { state: string }) {
    const rows = await this.prisma.order.findMany({
      where: {
        paymentMethod: 'COD',
        status: q.state === 'all' ? { in: ['SHIPPED', 'DELIVERED'] } : 'DELIVERED',
        payments: q.state === 'uncollected' ? { some: { status: 'PENDING_COLLECTION' } } : q.state === 'collected' ? { some: { status: 'COLLECTED' } } : undefined,
      },
      orderBy: { deliveredAt: 'desc' },
      take: 200,
      include: { payments: { where: { method: 'COD' } } },
    });
    const totals = await this.prisma.payment.groupBy({ by: ['status'], where: { method: 'COD', order: { status: 'DELIVERED' } }, _sum: { amount: true }, _count: true });
    return {
      totals: totals.map((t) => ({ status: t.status, amount: t._sum.amount ?? 0, count: t._count })),
      items: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        name: o.name,
        phone: o.phone,
        deliveredAt: o.deliveredAt,
        total: o.grandTotal,
        payment: o.payments[0] ? { id: o.payments[0].id, status: o.payments[0].status, collectedAt: o.payments[0].collectedAt, collectedBy: o.payments[0].collectedBy } : null,
      })),
    };
  }

  @Post('cod/:paymentId/collect')
  @HttpCode(200)
  @Perm('cod.manage')
  async collect(@Req() req: AppRequest, @Param('paymentId', zv(id)) paymentId: string, @Body(zv(z.object({ amount: z.number().int().min(0), collectedBy: z.string().trim().min(2).max(80) }))) body: { amount: number; collectedBy: string }) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    if (!payment || payment.method !== 'COD') throw notFound('COD payment');
    if (payment.order.status !== 'DELIVERED') throw conflict('NOT_DELIVERED', 'Record cash only after the order is delivered.');
    if (payment.status !== 'PENDING_COLLECTION') throw conflict('ALREADY_COLLECTED', 'Cash for this order is already recorded.');
    if (body.amount !== payment.amount) throw badRequest('AMOUNT_MISMATCH', `The order total is ₹${(payment.amount / 100).toLocaleString('en-IN')}. Record the full amount or add a note on the order.`);
    const updated = await this.prisma.payment.update({ where: { id: paymentId }, data: { status: 'COLLECTED', collectedAt: new Date(), collectedBy: body.collectedBy } });
    await this.audit.log({ staff: req.staff, action: 'cod.collect', entityType: 'Payment', entityId: paymentId, after: body, ip: clientIp(req) });
    return updated;
  }

  // ── Delivery slots ──
  @Get('delivery/slots')
  @Perm('delivery.manage')
  async slots(@Query(zv(z.object({ from: z.string().optional(), days: z.coerce.number().int().min(1).max(60).default(14), locationId: id.optional() }))) q: { from?: string; days: number; locationId?: string }) {
    const start = q.from ? new Date(q.from) : new Date(new Date().toISOString().slice(0, 10));
    const end = new Date(start.getTime() + q.days * 86_400_000);
    const slots = await this.prisma.deliverySlot.findMany({
      where: { date: { gte: start, lt: end }, ...(q.locationId ? { locationId: q.locationId } : {}) },
      orderBy: [{ date: 'asc' }, { window: 'asc' }],
      include: { location: { select: { name: true } }, orders: { select: { id: true, orderNumber: true, name: true, status: true } } },
    });
    return slots.map((s) => ({ ...s, date: s.date.toISOString().slice(0, 10) }));
  }

  @Post('delivery/slots/generate')
  @HttpCode(200)
  @Perm('delivery.manage')
  async generate(@Body(zv(z.object({ days: z.number().int().min(1).max(60).default(21) }))) body: { days: number }) {
    return { created: await this.scheduling.generate(body.days) };
  }

  @Patch('delivery/slots/:id')
  @Perm('delivery.manage')
  async updateSlot(@Req() req: AppRequest, @Param('id', zv(id)) slotId: string, @Body(zv(z.object({ capacity: z.number().int().min(0).max(200).optional(), active: z.boolean().optional() }))) body: { capacity?: number; active?: boolean }) {
    const slot = await this.prisma.deliverySlot.findUnique({ where: { id: slotId } });
    if (!slot) throw notFound('Slot');
    if (body.capacity !== undefined && body.capacity < slot.booked) throw badRequest('CAPACITY_BELOW_BOOKED', `${slot.booked} deliveries are already booked in this slot.`);
    const s = await this.prisma.deliverySlot.update({ where: { id: slotId }, data: body });
    await this.audit.log({ staff: req.staff, action: 'slot.update', entityType: 'DeliverySlot', entityId: slotId, after: body, ip: clientIp(req) });
    return s;
  }

  // ── Installation jobs ──
  @Get('installations')
  @Perm('delivery.manage')
  async installations(@Query(zv(z.object({ status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional() }))) q: { status?: InstallationStatus }) {
    const rows = await this.prisma.installationJob.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { scheduledOn: 'asc' },
      take: 200,
      include: { order: { select: { id: true, orderNumber: true, name: true, phone: true, shippingAddress: true, status: true, items: { where: { installationIncluded: true }, select: { productName: true, variantTitle: true, quantity: true } } } } },
    });
    return rows.map((j) => ({ ...j, scheduledOn: j.scheduledOn.toISOString().slice(0, 10) }));
  }

  @Patch('installations/:id')
  @Perm('delivery.manage')
  async updateInstallation(
    @Req() req: AppRequest,
    @Param('id', zv(id)) jobId: string,
    @Body(zv(z.object({ technician: z.string().trim().max(80).optional(), status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(), notes: z.string().trim().max(1000).optional(), scheduledOn: z.string().optional(), window: z.string().max(40).optional() }))) body: { technician?: string; status?: InstallationStatus; notes?: string; scheduledOn?: string; window?: string },
  ) {
    const job = await this.prisma.installationJob.update({
      where: { id: jobId },
      data: { ...body, scheduledOn: body.scheduledOn ? new Date(body.scheduledOn) : undefined, completedAt: body.status === 'COMPLETED' ? new Date() : undefined },
    });
    await this.audit.log({ staff: req.staff, action: 'installation.update', entityType: 'InstallationJob', entityId: jobId, after: body, ip: clientIp(req) });
    return job;
  }

  // ── Invoices ──
  @Get('invoices')
  @Perm('invoices.read')
  async invoicesList(@Query(zv(z.object({ q: z.string().max(60).optional(), page: z.coerce.number().int().min(1).default(1) }))) q: { q?: string; page: number }) {
    const where: Prisma.InvoiceWhereInput = q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { order: { orderNumber: { contains: q.q, mode: 'insensitive' } } }] } : {};
    const [total, rows] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({ where, orderBy: { issuedAt: 'desc' }, skip: (q.page - 1) * 50, take: 50, include: { order: { select: { id: true, orderNumber: true, name: true, grandTotal: true, status: true } } } }),
    ]);
    return {
      total,
      page: q.page,
      pageCount: Math.max(1, Math.ceil(total / 50)),
      items: rows.map((i) => {
        const t = i.totals as { taxable: number; cgst: number; sgst: number; igst: number; intraState: boolean; placeOfSupply: string };
        return { id: i.id, number: i.number, fy: i.fy, issuedAt: i.issuedAt, order: i.order, taxable: t.taxable, tax: t.cgst + t.sgst + t.igst, intraState: t.intraState, placeOfSupply: t.placeOfSupply };
      }),
    };
  }

  @Get('orders/:id/invoice')
  @Perm('invoices.read')
  async invoicePdf(@Res() res: Response, @Param('id', zv(id)) orderId: string) {
    const { buffer, filename } = await this.invoices.pdf(orderId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}
