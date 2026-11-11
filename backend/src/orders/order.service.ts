import { Injectable, Logger } from '@nestjs/common';
import { Order, OrderItem, OrderStatus, Prisma } from '@prisma/client';
import { config } from '../config';
import { conflict, notFound } from '../common/errors';
import { formatInr } from '../common/money';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from '../notifications/mail.service';
import type { OrderSummary } from '../notifications/templates';
import { InvoiceService } from '../invoices/invoice.service';
import { RefundService } from '../payments/refund.service';
import { PrismaService, Tx } from '../prisma/prisma.service';

export type Actor = { type: 'SYSTEM' | 'CUSTOMER' | 'STAFF'; id?: string | null };

/** Allowed status changes. Anything else is refused with ORDER_STATE_CHANGED. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  PENDING_CONFIRMATION: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  EXPIRED: ['CONFIRMED'],
};

export const CANCELLABLE: OrderStatus[] = ['PENDING_PAYMENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING'];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PENDING_CONFIRMATION: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being prepared',
  SHIPPED: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Payment not completed',
};

@Injectable()
export class OrderService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly mail: MailService,
    private readonly invoices: InvoiceService,
    private readonly refunds: RefundService,
  ) {}

  /** Changes status only if the order is still in the expected state (optimistic lock). */
  async transition(tx: Tx, order: Pick<Order, 'id' | 'status'>, to: OrderStatus, actor: Actor, note?: string, extra: Prisma.OrderUpdateManyMutationInput = {}) {
    if (!TRANSITIONS[order.status].includes(to)) {
      throw conflict('ORDER_STATE_CHANGED', `An order that is ${STATUS_LABEL[order.status].toLowerCase()} cannot become ${STATUS_LABEL[to].toLowerCase()}.`);
    }
    const now = new Date();
    const stamps: Prisma.OrderUpdateManyMutationInput =
      to === 'CONFIRMED' ? { confirmedAt: now }
      : to === 'SHIPPED' ? { shippedAt: now }
      : to === 'DELIVERED' ? { deliveredAt: now }
      : to === 'CANCELLED' ? { cancelledAt: now }
      : {};
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: to, version: { increment: 1 }, ...stamps, ...extra },
    });
    if (updated.count !== 1) throw conflict('ORDER_STATE_CHANGED', 'This order was just updated by someone else. Refresh and try again.');
    await tx.orderEvent.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: to, actorType: actor.type, actorId: actor.id ?? undefined, note } });
  }

  orderUrl(order: Pick<Order, 'orderNumber' | 'userId' | 'accessToken'>) {
    return order.userId
      ? `${config.STOREFRONT_URL}/account/orders/${order.orderNumber}`
      : `${config.STOREFRONT_URL}/checkout/confirmation/${order.orderNumber}?t=${order.accessToken}`;
  }

  summary(order: Order & { items: OrderItem[] }): OrderSummary {
    return {
      orderNumber: order.orderNumber,
      name: order.name.split(' ')[0],
      grandTotal: order.grandTotal,
      paymentMethod: order.paymentMethod,
      items: order.items.map((i) => ({ productName: i.productName, variantTitle: i.variantTitle, quantity: i.quantity, lineTotal: i.lineTotal - i.discount })),
      url: this.orderUrl(order),
    };
  }

  /**
   * Marks an online order paid. Safe to call from the browser callback, the webhook and the
   * reconciliation job: whichever arrives first confirms, the rest are no-ops.
   */
  async confirmPaid(orderId: string, payment: { providerPaymentId: string; amount: number; method?: string; raw?: unknown }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } });
      if (!order) throw notFound('Order');
      const already = order.payments.find((p) => p.providerPaymentId === payment.providerPaymentId && p.status === 'CAPTURED');
      if (already || ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status)) return { order, outcome: 'already' as const };

      const pending = order.payments.find((p) => p.method === 'ONLINE' && p.status === 'CREATED');
      const paymentData = {
        providerPaymentId: payment.providerPaymentId,
        status: 'CAPTURED' as const,
        raw: payment.raw === undefined ? undefined : (payment.raw as Prisma.InputJsonValue),
      };
      const paymentRow = pending
        ? await tx.payment.update({ where: { id: pending.id }, data: paymentData })
        : await tx.payment.create({ data: { orderId, method: 'ONLINE', provider: 'razorpay', amount: payment.amount, ...paymentData } });

      if (payment.amount !== order.grandTotal) {
        this.logger.error(`Amount mismatch on ${order.orderNumber}: paid ${payment.amount}, expected ${order.grandTotal}`);
      }

      if (order.status === 'PENDING_PAYMENT') {
        await this.inventory.commit(tx, order.id, order.orderNumber);
        await this.transition(tx, order, 'CONFIRMED', { type: 'SYSTEM' }, `Paid online (${payment.method ?? 'razorpay'})`);
      } else {
        // Paid after the hold expired or the order was cancelled: try to hold stock again.
        try {
          await this.inventory.reserve(tx, order.id, order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })), new Date(Date.now() + 60_000));
          await this.inventory.commit(tx, order.id, order.orderNumber);
          await tx.order.update({ where: { id: order.id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
          await tx.orderEvent.create({ data: { orderId, fromStatus: order.status, toStatus: 'CONFIRMED', actorType: 'SYSTEM', note: 'Late payment accepted' } });
        } catch {
          await this.refunds.create(tx, {
            orderId,
            paymentId: paymentRow.id,
            amount: payment.amount,
            reason: 'Payment received after the order expired and stock was no longer available',
            method: 'ORIGINAL',
            requestedBy: 'SYSTEM',
          });
          return { order, outcome: 'late-refund' as const, paymentId: paymentRow.id };
        }
      }
      await this.invoices.issue(tx, order.id);
      if (order.cartId) await tx.cartItem.deleteMany({ where: { cartId: order.cartId } });
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      await this.mail.queue(order.email, 'orderConfirmed', this.summary(fresh), tx);
      return { order: fresh, outcome: 'confirmed' as const };
    });
    if (result.outcome === 'late-refund') {
      const refund = await this.prisma.refund.findFirst({ where: { orderId, status: 'REQUESTED' }, orderBy: { createdAt: 'desc' } });
      if (refund) await this.refunds.process(refund.id, null).catch((e) => this.logger.error(`Auto refund failed: ${e.message}`));
    }
    return result;
  }

  /** Cancels before dispatch: puts stock back, frees the delivery slot and coupon, refunds online payments. */
  async cancel(orderId: string, actor: Actor, reason: string) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, payments: true } });
      if (!order) throw notFound('Order');
      if (!CANCELLABLE.includes(order.status)) {
        throw conflict('ORDER_NOT_CANCELLABLE', order.status === 'SHIPPED' || order.status === 'DELIVERED'
          ? 'This order has already left our warehouse, so it can no longer be cancelled. You can request a return after delivery.'
          : 'This order can no longer be cancelled.');
      }
      if (order.status === 'PENDING_PAYMENT') await this.inventory.release(tx, order.id);
      else await this.inventory.restockOrder(tx, order.id, `${order.orderNumber} cancelled`);

      if (order.deliverySlotId) {
        await tx.deliverySlot.update({ where: { id: order.deliverySlotId }, data: { booked: { decrement: 1 } } });
      }
      await tx.installationJob.updateMany({ where: { orderId, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
      await this.releaseCoupon(tx, order.id);
      await this.transition(tx, order, 'CANCELLED', actor, reason, { cancelReason: reason });
      if (order.deliverySlotId) await tx.order.update({ where: { id: order.id }, data: { deliverySlotId: null } });

      const captured = order.payments.find((p) => p.method === 'ONLINE' && p.status === 'CAPTURED');
      let refundId: string | null = null;
      if (captured) {
        const refund = await this.refunds.create(tx, {
          orderId,
          paymentId: captured.id,
          amount: captured.amount,
          reason: `Order cancelled: ${reason}`,
          method: 'ORIGINAL',
          requestedBy: actor.type === 'STAFF' ? actor.id ?? 'STAFF' : actor.type,
        });
        refundId = refund.id;
      }
      await tx.payment.updateMany({ where: { orderId, status: { in: ['CREATED', 'PENDING_COLLECTION'] } }, data: { status: 'FAILED', errorReason: 'Order cancelled' } });
      await this.mail.queue(order.email, 'orderCancelled', { ...this.summary(order), reason, refund: Boolean(captured) }, tx);
      return { refundId };
    });
    if (outcome.refundId) {
      await this.refunds.process(outcome.refundId, null).catch((e) => this.logger.error(`Refund on cancel failed: ${e.message}`));
    }
  }

  /** Called by the job when an online order's 15-minute stock hold runs out without payment. */
  async expire(orderId: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== 'PENDING_PAYMENT') return;
      await this.inventory.release(tx, order.id);
      await this.releaseCoupon(tx, order.id);
      await this.transition(tx, order, 'EXPIRED', { type: 'SYSTEM' }, 'Payment not completed in time; stock released');
      await tx.payment.updateMany({ where: { orderId, status: 'CREATED' }, data: { status: 'FAILED', errorReason: 'Expired' } });
    });
  }

  private async releaseCoupon(tx: Tx, orderId: string) {
    const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
    if (!redemption) return;
    await tx.couponRedemption.delete({ where: { orderId } });
    await tx.coupon.update({ where: { id: redemption.couponId }, data: { usedCount: { decrement: 1 } } });
  }

  /** Customer-facing order detail (also used for guests with the access token). */
  async detailForCustomer(where: Prisma.OrderWhereUniqueInput) {
    const order = await this.prisma.order.findUnique({
      where,
      include: {
        items: { include: { review: { select: { id: true, status: true } }, returnItems: { include: { returnReq: { select: { status: true } } } } } },
        events: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        invoice: { select: { number: true, issuedAt: true } },
        deliverySlot: true,
        installations: { where: { status: { not: 'CANCELLED' } } },
        returns: { orderBy: { createdAt: 'desc' }, select: { id: true, returnNumber: true, status: true, createdAt: true } },
        refunds: { orderBy: { createdAt: 'desc' }, select: { amount: true, status: true, method: true, createdAt: true } },
      },
    });
    if (!order) throw notFound('Order');
    const deliveredDays = order.deliveredAt ? (Date.now() - order.deliveredAt.getTime()) / 86_400_000 : null;
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: STATUS_LABEL[order.status],
      paymentMethod: order.paymentMethod,
      placedAt: order.placedAt,
      confirmedAt: order.confirmedAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      cancelReason: order.cancelReason,
      reservationExpiresAt: order.reservationExpiresAt,
      trackingNote: order.trackingNote,
      email: order.email,
      phone: order.phone,
      name: order.name,
      shippingAddress: order.shippingAddress,
      totals: {
        subtotal: order.subtotal,
        discount: order.discountTotal,
        delivery: order.shippingTotal,
        taxIncluded: order.taxTotal,
        total: order.grandTotal,
        couponCode: order.couponCode,
      },
      items: order.items.map((i) => {
        const returned = i.returnItems.filter((r) => r.returnReq.status !== 'REJECTED').reduce((s, r) => s + r.quantity, 0);
        return {
          id: i.id,
          productName: i.productName,
          productSlug: i.productSlug,
          variantTitle: i.variantTitle,
          sku: i.sku,
          image: i.imageKey ? `/media/${i.imageKey}` : null,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          lineTotal: i.lineTotal - i.discount,
          installationIncluded: i.installationIncluded,
          canReview: order.status === 'DELIVERED' && !i.review,
          review: i.review,
          returnableQuantity:
            order.status === 'DELIVERED' && i.returnable && deliveredDays !== null && deliveredDays <= i.returnWindowDays
              ? i.quantity - returned
              : 0,
          returnWindowDays: i.returnWindowDays,
        };
      }),
      timeline: order.events.map((e) => ({ status: e.toStatus, label: STATUS_LABEL[e.toStatus], at: e.createdAt, note: e.actorType === 'STAFF' ? null : e.note })),
      payment: order.payments[0] ? { method: order.payments[0].method, status: order.payments[0].status, amount: order.payments[0].amount } : null,
      invoice: order.invoice,
      deliverySlot: order.deliverySlot ? { date: order.deliverySlot.date, window: order.deliverySlot.window } : null,
      installation: order.installations[0] ? { date: order.installations[0].scheduledOn, window: order.installations[0].window, status: order.installations[0].status } : null,
      returns: order.returns,
      refunds: order.refunds,
      actions: {
        canCancel: CANCELLABLE.includes(order.status),
        canSchedule: ['CONFIRMED', 'PROCESSING'].includes(order.status),
        canPay: order.status === 'PENDING_PAYMENT' && order.paymentMethod === 'ONLINE',
        canReturn: order.items.some((i) => i.returnable) && order.status === 'DELIVERED',
      },
      displayTotal: formatInr(order.grandTotal),
    };
  }
}
