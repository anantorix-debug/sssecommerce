import { Injectable } from '@nestjs/common';
import { Prisma, RefundMethod, ReturnStatus } from '@prisma/client';
import { config } from '../config';
import { badRequest, conflict, notFound } from '../common/errors';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from '../notifications/mail.service';
import { RefundService } from '../payments/refund.service';
import { PrismaService } from '../prisma/prisma.service';

export const RETURN_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  PICKUP_SCHEDULED: 'Pickup scheduled',
  RECEIVED: 'Received at warehouse',
  INSPECTED: 'Inspected',
  REFUNDED: 'Refunded',
  CLOSED: 'Closed',
};

const NEXT: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['PICKUP_SCHEDULED', 'APPROVED', 'REJECTED'],
  APPROVED: ['PICKUP_SCHEDULED', 'REJECTED'],
  PICKUP_SCHEDULED: ['RECEIVED'],
  RECEIVED: ['INSPECTED'],
  INSPECTED: ['REFUNDED', 'CLOSED'],
  REFUNDED: ['CLOSED'],
  REJECTED: [],
  CLOSED: [],
};

/** Return flow: request → approved / pickup scheduled → received → inspected → refunded → closed. */
@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly refunds: RefundService,
    private readonly mail: MailService,
  ) {}

  private url(id: string) {
    return `${config.STOREFRONT_URL}/account/returns/${id}`;
  }

  async create(userId: string, orderNumber: string, body: { items: { orderItemId: string; quantity: number }[]; reason: string; details?: string; photos: string[]; resolution: 'REFUND' | 'REPLACEMENT' }) {
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, userId },
      include: { items: { include: { returnItems: { include: { returnReq: true } } } } },
    });
    if (!order) throw notFound('Order');
    if (order.status !== 'DELIVERED' || !order.deliveredAt) throw conflict('RETURN_NOT_ALLOWED', 'Returns can be requested after delivery.');
    const days = (Date.now() - order.deliveredAt.getTime()) / 86_400_000;
    for (const line of body.items) {
      const item = order.items.find((i) => i.id === line.orderItemId);
      if (!item) throw badRequest('RETURN_ITEM_INVALID', 'One of the items is not part of this order.');
      if (!item.returnable) throw badRequest('RETURN_NOT_ALLOWED', `${item.productName} cannot be returned.`);
      if (days > item.returnWindowDays) throw badRequest('RETURN_WINDOW_CLOSED', `The ${item.returnWindowDays}-day return window for ${item.productName} has closed.`);
      const taken = item.returnItems.filter((r) => r.returnReq.status !== 'REJECTED').reduce((s, r) => s + r.quantity, 0);
      if (line.quantity > item.quantity - taken) throw badRequest('RETURN_QUANTITY_INVALID', `You can return up to ${item.quantity - taken} of ${item.productName}.`);
    }
    const ret = await this.prisma.$transaction(async (tx) => {
      const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('return_number_seq')`;
      const created = await tx.returnRequest.create({
        data: {
          returnNumber: `RT-${String(nextval).padStart(5, '0')}`,
          orderId: order.id,
          userId,
          reason: body.reason,
          details: body.details,
          photos: body.photos,
          resolution: body.resolution,
          events: [{ status: 'REQUESTED', at: new Date().toISOString(), note: null }],
          items: { create: body.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })) },
        },
      });
      await this.mail.queue(order.email, 'returnUpdate', {
        returnNumber: created.returnNumber,
        heading: 'We have your return request',
        message: 'Our team will review it within one working day and let you know the pickup date.',
        url: this.url(created.id),
      }, tx);
      return created;
    });
    return ret;
  }

  async detail(id: string, userId?: string) {
    const r = await this.prisma.returnRequest.findFirst({
      where: { id, ...(userId ? { userId } : {}) },
      include: { items: { include: { orderItem: true } }, order: { select: { orderNumber: true, paymentMethod: true, email: true, name: true, phone: true, shippingAddress: true } }, refunds: true },
    });
    if (!r) throw notFound('Return');
    return {
      id: r.id,
      returnNumber: r.returnNumber,
      status: r.status,
      statusLabel: RETURN_LABEL[r.status],
      reason: r.reason,
      details: r.details,
      resolution: r.resolution,
      pickupDate: r.pickupDate,
      inspectionPass: r.inspectionPass,
      inspectionNotes: r.inspectionNotes,
      rejectReason: r.rejectReason,
      refundAmount: r.refundAmount,
      photoCount: (r.photos as string[]).length,
      photos: r.photos as string[],
      createdAt: r.createdAt,
      events: r.events as { status: ReturnStatus; at: string; note: string | null }[],
      order: r.order,
      items: r.items.map((i) => ({
        orderItemId: i.orderItemId,
        productName: i.orderItem.productName,
        variantTitle: i.orderItem.variantTitle,
        image: i.orderItem.imageKey ? `/media/${i.orderItem.imageKey}` : null,
        quantity: i.quantity,
        unitPrice: i.orderItem.unitPrice,
      })),
      refunds: r.refunds.map((f) => ({ id: f.id, amount: f.amount, status: f.status, method: f.method, reference: f.reference })),
    };
  }

  /** Staff moves a return forward. Restock happens on a passed inspection; refunds are created at the REFUNDED step. */
  async advance(
    id: string,
    staffId: string,
    a: { to: ReturnStatus; note?: string; pickupDate?: string; inspectionPass?: boolean; restock?: boolean; refundMethod?: RefundMethod; payoutDetails?: string; rejectReason?: string },
  ) {
    const r = await this.prisma.returnRequest.findUnique({
      where: { id },
      include: { items: { include: { orderItem: true } }, order: { include: { payments: true, items: true } } },
    });
    if (!r) throw notFound('Return');
    if (!NEXT[r.status].includes(a.to)) throw conflict('RETURN_STATE', `A return that is ${RETURN_LABEL[r.status].toLowerCase()} cannot move to ${RETURN_LABEL[a.to].toLowerCase()}.`);

    const data: Prisma.ReturnRequestUpdateInput = { status: a.to };
    let message = '';
    let refundToProcess: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      if (a.to === 'PICKUP_SCHEDULED') {
        if (!a.pickupDate) throw badRequest('PICKUP_DATE_REQUIRED', 'Choose a pickup date.');
        data.pickupDate = new Date(a.pickupDate);
        message = `Your return is approved. We will collect it on ${new Date(a.pickupDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}.`;
      } else if (a.to === 'APPROVED') {
        message = 'Your return is approved. We will confirm the pickup date shortly.';
      } else if (a.to === 'REJECTED') {
        if (!a.rejectReason) throw badRequest('REASON_REQUIRED', 'Give a reason the customer will see.');
        data.rejectReason = a.rejectReason;
        message = `We could not approve this return: ${a.rejectReason}`;
      } else if (a.to === 'RECEIVED') {
        message = 'We have received the item and will inspect it within two working days.';
      } else if (a.to === 'INSPECTED') {
        if (a.inspectionPass === undefined) throw badRequest('INSPECTION_RESULT_REQUIRED', 'Record whether the item passed inspection.');
        data.inspectionPass = a.inspectionPass;
        data.inspectionNotes = a.note;
        if (a.inspectionPass && a.restock) {
          const only = new Map(r.items.map((i) => [i.orderItem.variantId, i.quantity]));
          await this.inventory.restockOrder(tx, r.orderId, `${r.returnNumber} restock`, 'RETURN_RESTOCK', only);
        }
        message = a.inspectionPass ? 'The item passed inspection. Your refund will be processed next.' : `The item did not pass inspection. ${a.note ?? ''}`;
      } else if (a.to === 'REFUNDED') {
        if (!r.inspectionPass) throw conflict('INSPECTION_FAILED', 'Only returns that passed inspection can be refunded.');
        const open = await tx.refund.count({ where: { returnId: r.id, status: { notIn: ['FAILED', 'REJECTED'] } } });
        if (open) throw conflict('REFUND_EXISTS', 'A refund for this return already exists. Process it under Refunds.');
        // Refund what the customer actually paid per returned unit (after any coupon discount).
        const amount = r.items.reduce((s, i) => s + Math.round(((i.orderItem.lineTotal - i.orderItem.discount) / i.orderItem.quantity) * i.quantity), 0);
        const online = r.order.payments.find((p) => p.method === 'ONLINE' && (p.status === 'CAPTURED' || p.status === 'PARTIALLY_REFUNDED'));
        const method: RefundMethod = online ? 'ORIGINAL' : (a.refundMethod ?? 'BANK_TRANSFER');
        if (!online && !a.payoutDetails) throw badRequest('PAYOUT_DETAILS_REQUIRED', 'Cash on delivery refunds need the customer\'s bank or UPI details.');
        const refund = await this.refunds.create(tx, {
          orderId: r.orderId,
          paymentId: online?.id ?? r.order.payments.find((p) => p.method === 'COD')?.id,
          returnId: r.id,
          amount,
          reason: `Return ${r.returnNumber}`,
          method,
          requestedBy: staffId,
          payoutDetails: a.payoutDetails,
        });
        data.refundAmount = amount;
        data.status = 'INSPECTED'; // becomes REFUNDED once the refund is processed
        refundToProcess = online ? refund.id : null;
        message = online ? 'Your refund has been started to your original payment method.' : 'Your refund has been approved and will be paid to the account you shared.';
      }
      const events = [...(r.events as object[]), { status: a.to, at: new Date().toISOString(), note: a.note ?? null }];
      await tx.returnRequest.update({ where: { id }, data: { ...data, events } });
      if (message) {
        await this.mail.queue(r.order.email, 'returnUpdate', { returnNumber: r.returnNumber, heading: RETURN_LABEL[a.to], message, url: this.url(r.id) }, tx);
      }
    });
    if (refundToProcess) await this.refunds.process(refundToProcess, staffId);
    return this.detail(id);
  }
}
