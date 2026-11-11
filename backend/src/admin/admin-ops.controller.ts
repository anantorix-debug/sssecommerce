import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CouponType, Prisma, RefundStatus, ReturnStatus, ReviewStatus } from '@prisma/client';
import { z } from 'zod';
import { Perm, StaffGuard } from '../auth/guards';
import { AuditService } from '../common/audit.service';
import { conflict, notFound } from '../common/errors';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { AppRequest, clientIp } from '../common/request';
import { id, zv } from '../common/zod';
import { mediaUrl } from '../catalog/cards';
import { RevalidateService } from '../content/revalidate.service';
import { STATUS_LABEL } from '../orders/order.service';
import { RefundService } from '../payments/refund.service';
import { PrismaService } from '../prisma/prisma.service';
import { RETURN_LABEL, ReturnsService } from '../returns/returns.service';
import { ReviewsService } from '../reviews/reviews.service';

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, 'Use 3 to 30 capital letters, numbers or hyphens.'),
  description: z.string().trim().max(200).nullable().optional(),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().min(1),
  minSubtotal: z.number().int().min(0).default(0),
  maxDiscount: z.number().int().min(1).nullable().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(100).default(1),
  firstOrderOnly: z.boolean().default(false),
  active: z.boolean().default(true),
}).refine((c) => c.type !== 'PERCENT' || c.value <= 90, { message: 'A percentage discount can be at most 90%.', path: ['value'] })
  .refine((c) => !c.startsAt || !c.endsAt || new Date(c.endsAt) > new Date(c.startsAt), { message: 'The end date must be after the start date.', path: ['endsAt'] });

@Controller('admin')
@UseGuards(StaffGuard, RateLimitGuard)
@RateLimit('admin', 'staff')
export class AdminOpsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly returns: ReturnsService,
    private readonly refunds: RefundService,
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
  ) {}

  // ── Returns ──
  @Get('returns')
  @Perm('returns.manage')
  async returnsList(@Query(zv(z.object({ status: z.string().optional(), page: z.coerce.number().int().min(1).default(1) }))) q: { status?: string; page: number }) {
    const statuses = q.status?.split(',').filter((s): s is ReturnStatus => s in RETURN_LABEL);
    const where: Prisma.ReturnRequestWhereInput = statuses?.length ? { status: { in: statuses } } : {};
    const [total, rows] = await Promise.all([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * 30,
        take: 30,
        include: { order: { select: { orderNumber: true, name: true, paymentMethod: true } }, items: { include: { orderItem: { select: { productName: true, unitPrice: true } } } } },
      }),
    ]);
    return {
      total,
      page: q.page,
      pageCount: Math.max(1, Math.ceil(total / 30)),
      items: rows.map((r) => ({
        id: r.id,
        returnNumber: r.returnNumber,
        status: r.status,
        statusLabel: RETURN_LABEL[r.status],
        reason: r.reason,
        createdAt: r.createdAt,
        order: r.order,
        items: r.items.map((i) => `${i.orderItem.productName} × ${i.quantity}`),
        value: r.items.reduce((s, i) => s + i.orderItem.unitPrice * i.quantity, 0),
      })),
    };
  }

  @Get('returns/:id')
  @Perm('returns.manage')
  returnDetail(@Param('id', zv(id)) returnId: string) {
    return this.returns.detail(returnId);
  }

  @Post('returns/:id/advance')
  @HttpCode(200)
  @Perm('returns.manage')
  async advance(
    @Req() req: AppRequest,
    @Param('id', zv(id)) returnId: string,
    @Body(zv(z.object({
      to: z.enum(['APPROVED', 'REJECTED', 'PICKUP_SCHEDULED', 'RECEIVED', 'INSPECTED', 'REFUNDED', 'CLOSED']),
      note: z.string().trim().max(1000).optional(),
      pickupDate: z.string().optional(),
      inspectionPass: z.boolean().optional(),
      restock: z.boolean().optional(),
      refundMethod: z.enum(['BANK_TRANSFER', 'UPI']).optional(),
      payoutDetails: z.string().trim().max(300).optional(),
      rejectReason: z.string().trim().max(300).optional(),
    }))) body: Parameters<ReturnsService['advance']>[2],
  ) {
    const result = await this.returns.advance(returnId, req.staff!.id, body);
    await this.audit.log({ staff: req.staff, action: `return.${body.to.toLowerCase()}`, entityType: 'ReturnRequest', entityId: returnId, after: body, ip: clientIp(req) });
    return result;
  }

  // ── Refunds ──
  @Get('refunds')
  @Perm('refunds.approve')
  async refundsList(@Query(zv(z.object({ status: z.enum(['REQUESTED', 'PROCESSING', 'PROCESSED', 'FAILED', 'REJECTED']).optional() }))) q: { status?: RefundStatus }) {
    const rows = await this.prisma.refund.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { order: { select: { id: true, orderNumber: true, name: true, paymentMethod: true } }, returnRequest: { select: { returnNumber: true } } },
    });
    return rows;
  }

  @Post('refunds/:id/process')
  @HttpCode(200)
  @Perm('refunds.approve')
  async processRefund(@Req() req: AppRequest, @Param('id', zv(id)) refundId: string, @Body(zv(z.object({ reference: z.string().trim().max(120).optional() }))) body: { reference?: string }) {
    const r = await this.refunds.process(refundId, req.staff!.id, body.reference ? { reference: body.reference } : undefined);
    await this.audit.log({ staff: req.staff, action: 'refund.process', entityType: 'Refund', entityId: refundId, after: body, ip: clientIp(req) });
    return r;
  }

  @Post('refunds/:id/reject')
  @HttpCode(200)
  @Perm('refunds.approve')
  async rejectRefund(@Req() req: AppRequest, @Param('id', zv(id)) refundId: string) {
    await this.refunds.reject(refundId, req.staff!.id);
    await this.audit.log({ staff: req.staff, action: 'refund.reject', entityType: 'Refund', entityId: refundId, ip: clientIp(req) });
    return { ok: true };
  }

  // ── Customers ──
  @Get('customers')
  @Perm('customers.read')
  async customers(@Query(zv(z.object({ q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1) }))) q: { q?: string; page: number }) {
    const where: Prisma.UserWhereInput = q.q ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] } : {};
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * 30,
        take: 30,
        include: { orders: { where: { status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } }, select: { grandTotal: true, placedAt: true } } },
      }),
    ]);
    return {
      total,
      page: q.page,
      pageCount: Math.max(1, Math.ceil(total / 30)),
      items: rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        createdAt: u.createdAt,
        orders: u.orders.length,
        spent: u.orders.reduce((s, o) => s + o.grandTotal, 0),
        lastOrderAt: u.orders.map((o) => o.placedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      })),
    };
  }

  @Get('customers/:id')
  @Perm('customers.read')
  async customer(@Req() req: AppRequest, @Param('id', zv(id)) userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: true,
        orders: { orderBy: { placedAt: 'desc' }, select: { id: true, orderNumber: true, status: true, grandTotal: true, placedAt: true, paymentMethod: true } },
        returns: { select: { id: true, returnNumber: true, status: true, createdAt: true } },
        reviews: { select: { id: true, rating: true, title: true, status: true, product: { select: { name: true } } } },
        _count: { select: { wishlist: true } },
      },
    });
    if (!u) throw notFound('Customer');
    await this.audit.log({ staff: req.staff, action: 'customer.view', entityType: 'User', entityId: userId, ip: clientIp(req) });
    const { passwordHash, googleId, ...rest } = u;
    return {
      ...rest,
      hasPassword: Boolean(passwordHash),
      googleLinked: Boolean(googleId),
      orders: u.orders.map((o) => ({ ...o, statusLabel: STATUS_LABEL[o.status] })),
      lifetimeValue: u.orders.filter((o) => ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(o.status)).reduce((s, o) => s + o.grandTotal, 0),
    };
  }

  // ── Reviews ──
  @Get('reviews')
  @Perm('reviews.moderate')
  async reviewsList(@Query(zv(z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING') }))) q: { status: ReviewStatus }) {
    const rows = await this.prisma.review.findMany({
      where: { status: q.status },
      orderBy: { createdAt: q.status === 'PENDING' ? 'asc' : 'desc' },
      take: 100,
      include: { product: { select: { name: true, slug: true } }, user: { select: { name: true, email: true } }, orderItem: { select: { variantTitle: true, order: { select: { orderNumber: true } } } } },
    });
    return rows.map((r) => ({ ...r, photos: (r.photos as string[]).map((k) => mediaUrl(k)) }));
  }

  @Post('reviews/:id/moderate')
  @HttpCode(200)
  @Perm('reviews.moderate')
  async moderate(@Req() req: AppRequest, @Param('id', zv(id)) reviewId: string, @Body(zv(z.object({ status: z.enum(['APPROVED', 'REJECTED']), reply: z.string().trim().max(1000).nullable().optional() }))) body: { status: 'APPROVED' | 'REJECTED'; reply?: string | null }) {
    const r = await this.reviews.moderate(reviewId, req.staff!.id, body);
    await this.audit.log({ staff: req.staff, action: `review.${body.status.toLowerCase()}`, entityType: 'Review', entityId: reviewId, after: body, ip: clientIp(req) });
    const p = await this.prisma.product.findUnique({ where: { id: r.productId }, select: { slug: true } });
    if (p) this.revalidate.tags([`product:${p.slug}`, 'products', 'home']);
    return r;
  }

  // ── Coupons ──
  @Get('coupons')
  @Perm('coupons.manage')
  async coupons() {
    const rows = await this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, include: { redemptions: { select: { amount: true } } } });
    return rows.map(({ redemptions, ...c }) => ({ ...c, discountGiven: redemptions.reduce((s, r) => s + r.amount, 0) }));
  }

  @Get('coupons/:id')
  @Perm('coupons.manage')
  async coupon(@Param('id', zv(id)) couponId: string) {
    const c = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!c) throw notFound('Coupon');
    return c;
  }

  @Post('coupons')
  @Perm('coupons.manage')
  async createCoupon(@Req() req: AppRequest, @Body(zv(couponSchema)) body: z.infer<typeof couponSchema>) {
    const c = await this.prisma.coupon.create({ data: { ...body, type: body.type as CouponType, startsAt: body.startsAt ? new Date(body.startsAt) : null, endsAt: body.endsAt ? new Date(body.endsAt) : null } });
    await this.audit.log({ staff: req.staff, action: 'coupon.create', entityType: 'Coupon', entityId: c.id, after: body, ip: clientIp(req) });
    return c;
  }

  @Patch('coupons/:id')
  @Perm('coupons.manage')
  async updateCoupon(@Req() req: AppRequest, @Param('id', zv(id)) couponId: string, @Body(zv(couponSchema)) body: z.infer<typeof couponSchema>) {
    const before = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!before) throw notFound('Coupon');
    if (before.usedCount > 0 && before.code !== body.code) throw conflict('COUPON_USED', 'This code has been used, so it cannot be renamed. Create a new coupon instead.');
    const c = await this.prisma.coupon.update({ where: { id: couponId }, data: { ...body, startsAt: body.startsAt ? new Date(body.startsAt) : null, endsAt: body.endsAt ? new Date(body.endsAt) : null } });
    await this.audit.log({ staff: req.staff, action: 'coupon.update', entityType: 'Coupon', entityId: c.id, before, after: body, ip: clientIp(req) });
    return c;
  }

  @Delete('coupons/:id')
  @HttpCode(204)
  @Perm('coupons.manage')
  async deleteCoupon(@Req() req: AppRequest, @Param('id', zv(id)) couponId: string) {
    const c = await this.prisma.coupon.findUnique({ where: { id: couponId } });
    if (!c) throw notFound('Coupon');
    if (c.usedCount > 0) {
      await this.prisma.coupon.update({ where: { id: couponId }, data: { active: false } });
    } else {
      await this.prisma.coupon.delete({ where: { id: couponId } });
    }
    await this.audit.log({ staff: req.staff, action: 'coupon.delete', entityType: 'Coupon', entityId: couponId, before: c, ip: clientIp(req) });
  }
}
