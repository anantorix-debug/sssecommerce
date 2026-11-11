import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { CustomerGuard } from '../auth/guards';
import { CheckoutService } from '../checkout/checkout.service';
import { safeEqual } from '../common/crypto';
import { badRequest, notFound } from '../common/errors';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { AppRequest, CurrentUser } from '../common/request';
import { email, id, zv } from '../common/zod';
import { SchedulingService } from '../delivery/scheduling.service';
import { InvoiceService } from '../invoices/invoice.service';
import { MediaService, UploadFile } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReturnsService } from '../returns/returns.service';
import { ReviewsService } from '../reviews/reviews.service';
import { OrderService, STATUS_LABEL } from './order.service';

const returnSchema = z.object({
  items: z.array(z.object({ orderItemId: id, quantity: z.number().int().min(1).max(20) })).min(1),
  reason: z.enum(['Damaged in delivery', 'Defective or not working', 'Different from what I ordered', 'Does not fit my space', 'Changed my mind', 'Other']),
  details: z.string().trim().max(1000).optional(),
  photos: z.array(z.string().max(200)).max(6).default([]),
  resolution: z.enum(['REFUND', 'REPLACEMENT']).default('REFUND'),
});

const reviewSchema = z.object({
  orderItemId: id,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(20, 'Tell us a little more (at least 20 characters).').max(3000),
  photos: z.array(z.string().max(200)).max(6).default([]),
});

@Controller()
@UseGuards(RateLimitGuard)
export class CustomerOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly checkout: CheckoutService,
    private readonly invoices: InvoiceService,
    private readonly scheduling: SchedulingService,
    private readonly returns: ReturnsService,
    private readonly reviews: ReviewsService,
    private readonly media: MediaService,
  ) {}

  private async ownOrder(user: User, orderNumber: string) {
    const order = await this.prisma.order.findFirst({ where: { orderNumber, userId: user.id }, include: { items: true } });
    if (!order) throw notFound('Order');
    return order;
  }

  @Get('me/orders')
  @UseGuards(CustomerGuard)
  async list(@CurrentUser() user: User) {
    const orders = await this.prisma.order.findMany({
      where: { userId: user.id, status: { not: 'EXPIRED' } },
      orderBy: { placedAt: 'desc' },
      take: 100,
      include: { items: { take: 4, select: { productName: true, imageKey: true, quantity: true } }, _count: { select: { items: true } } },
    });
    return orders.map((o) => ({
      orderNumber: o.orderNumber,
      status: o.status,
      statusLabel: STATUS_LABEL[o.status],
      placedAt: o.placedAt,
      total: o.grandTotal,
      paymentMethod: o.paymentMethod,
      itemCount: o._count.items,
      items: o.items.map((i) => ({ name: i.productName, image: i.imageKey ? `/media/${i.imageKey}` : null, quantity: i.quantity })),
    }));
  }

  @Get('me/orders/:orderNumber')
  @UseGuards(CustomerGuard)
  async detail(@CurrentUser() user: User, @Param('orderNumber') orderNumber: string) {
    const order = await this.ownOrder(user, orderNumber);
    return this.orders.detailForCustomer({ id: order.id });
  }

  @Post('me/orders/:orderNumber/cancel')
  @UseGuards(CustomerGuard)
  @HttpCode(200)
  async cancel(
    @CurrentUser() user: User,
    @Param('orderNumber') orderNumber: string,
    @Body(zv(z.object({ reason: z.string().trim().min(3).max(300) }))) body: { reason: string },
  ) {
    const order = await this.ownOrder(user, orderNumber);
    await this.orders.cancel(order.id, { type: 'CUSTOMER', id: user.id }, body.reason);
    return this.orders.detailForCustomer({ id: order.id });
  }

  /** Invoice PDF for the account owner, or a guest holding the order's access token. */
  @Get('store/orders/:orderNumber/invoice')
  async invoice(@Req() req: AppRequest, @Res() res: Response, @Param('orderNumber') orderNumber: string, @Query('t') token?: string) {
    const order = await this.checkout.findAccessible(req, orderNumber, token);
    const { buffer, filename } = await this.invoices.pdf(order.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }

  // ── Delivery scheduling ──
  @Get('me/orders/:orderNumber/slots')
  @UseGuards(CustomerGuard)
  async slots(@CurrentUser() user: User, @Param('orderNumber') orderNumber: string) {
    return this.scheduling.availableSlots(await this.ownOrder(user, orderNumber));
  }

  @Post('me/orders/:orderNumber/schedule')
  @UseGuards(CustomerGuard)
  @HttpCode(200)
  @RateLimit('slotBooking', 'user')
  async schedule(@CurrentUser() user: User, @Param('orderNumber') orderNumber: string, @Body(zv(z.object({ slotId: id }))) body: { slotId: string }) {
    const order = await this.ownOrder(user, orderNumber);
    await this.scheduling.book(order, body.slotId);
    return this.orders.detailForCustomer({ id: order.id });
  }

  // ── Returns ──
  @Post('me/orders/:orderNumber/returns')
  @UseGuards(CustomerGuard)
  @RateLimit('returnRequest', 'user')
  async requestReturn(@CurrentUser() user: User, @Param('orderNumber') orderNumber: string, @Body(zv(returnSchema)) body: z.infer<typeof returnSchema>) {
    const ret = await this.returns.create(user.id, orderNumber, body);
    return this.returns.detail(ret.id, user.id);
  }

  @Get('me/returns')
  @UseGuards(CustomerGuard)
  async myReturns(@CurrentUser() user: User) {
    const rows = await this.prisma.returnRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, include: { order: { select: { orderNumber: true } } } });
    return rows.map((r) => ({ id: r.id, returnNumber: r.returnNumber, status: r.status, orderNumber: r.order.orderNumber, createdAt: r.createdAt }));
  }

  @Get('me/returns/:id')
  @UseGuards(CustomerGuard)
  returnDetail(@CurrentUser() user: User, @Param('id', zv(id)) returnId: string) {
    return this.returns.detail(returnId, user.id);
  }

  // ── Reviews ──
  @Get('me/reviews/eligible/:orderItemId')
  @UseGuards(CustomerGuard)
  eligible(@CurrentUser() user: User, @Param('orderItemId', zv(id)) orderItemId: string) {
    return this.reviews.eligibleItem(user.id, orderItemId);
  }

  @Post('me/reviews')
  @UseGuards(CustomerGuard)
  @RateLimit('reviewSubmit', 'user')
  async review(@CurrentUser() user: User, @Body(zv(reviewSchema)) body: z.infer<typeof reviewSchema>) {
    const r = await this.reviews.create(user.id, body);
    return { id: r.id, status: r.status };
  }

  /** Photo uploads for reviews (public once approved) and returns (private, staff only). */
  @Post('me/uploads')
  @UseGuards(CustomerGuard)
  @RateLimit('customerUpload', 'user')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  async upload(@UploadedFile() file: UploadFile | undefined, @Query('purpose') purpose: string) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Choose a photo to upload.');
    if (purpose !== 'review' && purpose !== 'return') throw badRequest('PURPOSE_INVALID', 'Unknown upload purpose.');
    const asset = await this.media.store(file, { visibility: purpose === 'return' ? 'PRIVATE' : 'PUBLIC', maxImageMb: 8 });
    return { key: asset.storageKey, url: purpose === 'review' ? `/media/${asset.storageKey}` : null, width: asset.width, height: asset.height };
  }

  // ── Guest tracking ──
  @Post('store/track')
  @HttpCode(200)
  @RateLimit('track')
  async track(@Body(zv(z.object({ orderNumber: z.string().trim().toUpperCase().max(40), email }))) body: { orderNumber: string; email: string }) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber: body.orderNumber } });
    // Same message for wrong number and wrong email, so order numbers can't be probed.
    if (!order || !safeEqual(order.email, body.email)) throw notFound('An order with these details');
    const detail = await this.orders.detailForCustomer({ id: order.id });
    return {
      orderNumber: detail.orderNumber,
      status: detail.status,
      statusLabel: detail.statusLabel,
      placedAt: detail.placedAt,
      deliverySlot: detail.deliverySlot,
      timeline: detail.timeline,
      items: detail.items.map((i) => ({ productName: i.productName, variantTitle: i.variantTitle, quantity: i.quantity, image: i.image })),
      trackingNote: detail.trackingNote,
      // lets the guest open the full order page
      link: `/checkout/confirmation/${order.orderNumber}?t=${order.accessToken}`,
    };
  }
}
