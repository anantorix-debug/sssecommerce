import { Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError } from '../common/errors';
import { AppRequest } from '../common/request';
import { OrderService } from '../orders/order.service';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayService } from './razorpay.service';
import { RefundService } from './refund.service';

interface RazorpayEvent {
  event: string;
  payload: {
    payment?: { entity: { id: string; order_id: string; amount: number; status: string; method: string; error_description?: string } };
    refund?: { entity: { id: string; payment_id: string; amount: number; status: string } };
  };
}

/**
 * Razorpay webhooks. Never rate-limited: the signature on the raw body is the protection.
 * Each event is stored once (unique event id), so retries from Razorpay are harmless.
 */
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly orders: OrderService,
    private readonly refunds: RefundService,
  ) {}

  @Post('razorpay')
  @HttpCode(200)
  async razorpayWebhook(
    @Req() req: AppRequest,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Headers('x-razorpay-event-id') eventId: string | undefined,
  ) {
    if (!req.rawBody || !signature || !this.razorpay.verifyWebhookSignature(req.rawBody, signature)) {
      this.logger.warn(`Rejected webhook with invalid signature from ${req.ip}`);
      throw new AppError(400, 'WEBHOOK_SIGNATURE_INVALID', 'Invalid signature.');
    }
    const body = JSON.parse(req.rawBody.toString('utf8')) as RazorpayEvent;
    const id = eventId ?? `${body.event}:${body.payload.payment?.entity.id ?? body.payload.refund?.entity.id}`;

    try {
      await this.prisma.webhookEvent.create({
        data: { provider: 'razorpay', eventId: id, eventType: body.event, payload: body as unknown as Prisma.InputJsonValue },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { ok: true, duplicate: true };
      throw err;
    }

    try {
      await this.handle(body);
      await this.prisma.webhookEvent.update({ where: { provider_eventId: { provider: 'razorpay', eventId: id } }, data: { status: 'PROCESSED', processedAt: new Date() } });
    } catch (err) {
      this.logger.error(`Webhook ${body.event} failed: ${(err as Error).message}`);
      await this.prisma.webhookEvent.update({ where: { provider_eventId: { provider: 'razorpay', eventId: id } }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 500) } });
      // 500 makes Razorpay retry later; the stored event is reprocessed on retry only if we delete it.
      await this.prisma.webhookEvent.delete({ where: { provider_eventId: { provider: 'razorpay', eventId: id } } });
      throw err;
    }
    return { ok: true };
  }

  private async handle(e: RazorpayEvent) {
    const payment = e.payload.payment?.entity;
    if ((e.event === 'payment.captured' || e.event === 'order.paid') && payment) {
      const row = await this.prisma.payment.findUnique({ where: { providerOrderId: payment.order_id } });
      if (!row) return this.logger.warn(`Payment for unknown Razorpay order ${payment.order_id}`);
      await this.orders.confirmPaid(row.orderId, { providerPaymentId: payment.id, amount: payment.amount, method: payment.method, raw: payment });
    } else if (e.event === 'payment.failed' && payment) {
      await this.prisma.payment.updateMany({
        where: { providerOrderId: payment.order_id, status: 'CREATED' },
        data: { errorReason: payment.error_description?.slice(0, 300) ?? 'Payment failed' },
      });
    } else if (e.event === 'refund.processed' && e.payload.refund) {
      await this.refunds.markFromProvider(e.payload.refund.entity.id, 'PROCESSED');
    } else if (e.event === 'refund.failed' && e.payload.refund) {
      await this.refunds.markFromProvider(e.payload.refund.entity.id, 'FAILED');
    }
  }
}
