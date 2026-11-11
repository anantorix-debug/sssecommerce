import { Injectable, Logger } from '@nestjs/common';
import { RefundMethod } from '@prisma/client';
import { badRequest, conflict, notFound } from '../common/errors';
import { MailService } from '../notifications/mail.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { config } from '../config';
import { RazorpayService } from './razorpay.service';

const METHOD_LABEL: Record<RefundMethod, string> = {
  ORIGINAL: 'your original payment method',
  BANK_TRANSFER: 'bank transfer',
  UPI: 'UPI',
};

/**
 * Refunds are records first, money second. Online payments are refunded through Razorpay;
 * cash-on-delivery refunds are paid out by hand (bank transfer or UPI) and the reference is recorded.
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger('Refunds');

  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService,
    private readonly mail: MailService,
  ) {}

  async create(
    tx: Tx,
    r: { orderId: string; paymentId?: string | null; returnId?: string | null; amount: number; reason: string; method: RefundMethod; requestedBy?: string; payoutDetails?: string },
  ) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { payments: true, refunds: true } });
    const paid = order.payments.filter((p) => p.status === 'CAPTURED' || p.status === 'COLLECTED' || p.status === 'PARTIALLY_REFUNDED').reduce((s, p) => s + p.amount, 0);
    const already = order.refunds.filter((x) => x.status !== 'FAILED' && x.status !== 'REJECTED').reduce((s, x) => s + x.amount, 0);
    if (r.amount <= 0) throw badRequest('REFUND_AMOUNT_INVALID', 'Refund amount must be more than zero.');
    if (already + r.amount > paid) {
      throw conflict('REFUND_EXCEEDS_PAID', `Refunds can't exceed the ₹${(paid / 100).toLocaleString('en-IN')} paid (₹${(already / 100).toLocaleString('en-IN')} already refunded).`);
    }
    return tx.refund.create({
      data: {
        orderId: r.orderId,
        paymentId: r.paymentId ?? undefined,
        returnId: r.returnId ?? undefined,
        amount: r.amount,
        reason: r.reason,
        method: r.method,
        requestedBy: r.requestedBy,
        payoutDetails: r.payoutDetails,
      },
    });
  }

  /** Executes a requested refund. For manual payouts a payment reference is required. */
  async process(refundId: string, staffId: string | null, manual?: { reference: string }) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId }, include: { payment: true, order: true } });
    if (!refund) throw notFound('Refund');
    if (refund.status !== 'REQUESTED' && refund.status !== 'FAILED') throw conflict('REFUND_STATE', 'This refund has already been processed.');

    if (refund.method === 'ORIGINAL') {
      if (!refund.payment || refund.payment.method !== 'ONLINE' || !refund.payment.providerPaymentId) {
        throw badRequest('REFUND_METHOD_INVALID', 'Cash on delivery orders must be refunded by bank transfer or UPI.');
      }
      try {
        const r = await this.razorpay.refund(refund.payment.providerPaymentId, refund.amount, { refundId: refund.id, order: refund.order.orderNumber });
        const done = r.status === 'processed';
        await this.prisma.refund.update({
          where: { id: refund.id },
          data: { providerRefundId: r.id, status: done ? 'PROCESSED' : 'PROCESSING', approvedBy: staffId, processedAt: done ? new Date() : null },
        });
        if (done) await this.afterProcessed(refund.id);
      } catch (err) {
        await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED', approvedBy: staffId } });
        this.logger.error(`Razorpay refund failed for ${refund.order.orderNumber}: ${(err as Error).message}`);
        throw badRequest('REFUND_FAILED', 'The payment provider could not process this refund. Try again or refund by bank transfer.');
      }
    } else {
      if (!manual?.reference?.trim()) throw badRequest('REFERENCE_REQUIRED', 'Enter the bank or UPI transaction reference.');
      await this.prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'PROCESSED', reference: manual.reference.trim(), approvedBy: staffId, processedAt: new Date() },
      });
      await this.afterProcessed(refund.id);
    }
    return this.prisma.refund.findUniqueOrThrow({ where: { id: refund.id } });
  }

  /** Razorpay webhook: refund.processed / refund.failed */
  async markFromProvider(providerRefundId: string, status: 'PROCESSED' | 'FAILED') {
    const refund = await this.prisma.refund.findUnique({ where: { providerRefundId } });
    if (!refund || refund.status === status) return;
    await this.prisma.refund.update({ where: { id: refund.id }, data: { status, processedAt: status === 'PROCESSED' ? new Date() : null } });
    if (status === 'PROCESSED') await this.afterProcessed(refund.id);
  }

  async reject(refundId: string, staffId: string) {
    await this.prisma.refund.update({ where: { id: refundId }, data: { status: 'REJECTED', approvedBy: staffId } });
  }

  private async afterProcessed(refundId: string) {
    const refund = await this.prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { order: { include: { refunds: true, payments: true } }, payment: true } });
    if (refund.payment) {
      const refunded = refund.order.refunds.filter((r) => r.paymentId === refund.paymentId && r.status === 'PROCESSED').reduce((s, r) => s + r.amount, 0);
      await this.prisma.payment.update({
        where: { id: refund.payment.id },
        data: { status: refunded >= refund.payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
    }
    if (refund.returnId) {
      await this.prisma.returnRequest.update({ where: { id: refund.returnId }, data: { status: 'REFUNDED' } }).catch(() => undefined);
    }
    const o = refund.order;
    const url = o.userId ? `${config.STOREFRONT_URL}/account/orders/${o.orderNumber}` : `${config.STOREFRONT_URL}/checkout/confirmation/${o.orderNumber}?t=${o.accessToken}`;
    await this.mail.queue(o.email, 'refundProcessed', { orderNumber: o.orderNumber, amount: refund.amount, method: METHOD_LABEL[refund.method], url });
  }
}
