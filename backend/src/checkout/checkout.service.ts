import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { PricingService } from '../cart/pricing.service';
import { randomToken, safeEqual } from '../common/crypto';
import { AppError, badRequest, conflict, notFound, unprocessable } from '../common/errors';
import { AppRequest } from '../common/request';
import { SettingsService } from '../common/settings.service';
import { AddressInput } from '../common/zod';
import { LogisticsService } from '../delivery/logistics.service';
import { InventoryService } from '../inventory/inventory.service';
import { MailService } from '../notifications/mail.service';
import { OrderService } from '../orders/order.service';
import { RazorpayService } from '../payments/razorpay.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PlaceOrderInput {
  contact: { email: string; phone: string; name: string };
  address: AddressInput;
  paymentMethod: 'ONLINE' | 'COD';
  expectedTotal: number;
  gstin?: string | null;
  note?: string | null;
  saveAddress?: boolean;
  acceptTerms: true;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger('Checkout');

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly orders: OrderService,
    private readonly razorpay: RazorpayService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly logistics: LogisticsService,
  ) {}

  async place(req: AppRequest, input: PlaceOrderInput, idempotencyKey: string | undefined) {
    if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 100) {
      throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'This request needs an Idempotency-Key header.');
    }
    const existing = await this.prisma.order.findUnique({ where: { idempotencyKey }, include: { payments: true } });
    if (existing) return this.response(existing.id);

    const cart = await this.carts.find(req);
    if (!cart || !cart.items.length) throw conflict('CART_EMPTY', 'Your cart is empty.');

    const priced = await this.pricing.price({
      items: cart.items,
      couponCode: cart.couponCode,
      pincode: input.address.pincode,
      email: input.contact.email,
    });

    const blocked = priced.items.filter((i) => i.notices.length);
    if (blocked.length) {
      throw conflict('STOCK_INSUFFICIENT', 'Some items in your cart are no longer available in the quantity you chose.', blocked.map((b) => ({ cartItemId: b.id, name: b.name, requested: b.quantity, available: b.maxQuantity })));
    }
    if (!priced.delivery?.serviceable) {
      const invalid = priced.delivery && 'reason' in priced.delivery && priced.delivery.reason === 'INVALID';
      throw unprocessable('PINCODE_UNSERVICEABLE', invalid ? `${input.address.pincode} is not a valid pincode.` : `We don't deliver to ${input.address.pincode} yet.`);
    }
    if (priced.summary.total !== input.expectedTotal) {
      throw conflict('PRICE_CHANGED', 'Prices in your cart changed since you last looked. Please review the new total.', { total: priced.summary.total });
    }
    if (priced.coupon && !priced.coupon.valid) throw badRequest('COUPON_INVALID', priced.coupon.message);

    if (input.paymentMethod === 'ONLINE' && !priced.payment.online.available) {
      throw new AppError(503, 'ONLINE_PAYMENT_UNAVAILABLE', 'Online payment is not available right now. Please choose cash on delivery.');
    }
    if (input.paymentMethod === 'COD') {
      if (!priced.payment.cod.available) throw unprocessable('COD_UNAVAILABLE', priced.payment.cod.reason ?? 'Cash on delivery is not available for this order.');
      const cod = await this.settings.get('cod');
      const open = await this.prisma.order.count({
        where: {
          paymentMethod: 'COD',
          status: { in: ['PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING', 'SHIPPED'] },
          OR: [{ email: input.contact.email }, { phone: input.contact.phone }],
        },
      });
      if (open >= cod.maxOpenOrders) {
        throw unprocessable('COD_LIMIT', `You already have ${open} cash-on-delivery orders in progress. Please pay online or wait until one is delivered.`);
      }
    }

    const checkout = await this.settings.get('checkout');
    const isCod = input.paymentMethod === 'COD';
    const holdUntil = new Date(Date.now() + checkout.reservationMinutes * 60_000);
    // Listed pincode or all-India default: decides which location's stock is held for this order.
    const pin = await this.logistics.resolve(input.address.pincode);
    const user = req.user ?? null;

    const orderId = await this.prisma.$transaction(async (tx) => {
      const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
      const now = new Date();
      const orderNumber = `SSS-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}-${String(nextval).padStart(6, '0')}`;
      const shippingAddress = { ...input.address, phone: input.address.phone };

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: user?.id,
          email: input.contact.email,
          phone: input.contact.phone,
          name: input.contact.name,
          status: isCod ? 'PENDING_CONFIRMATION' : 'PENDING_PAYMENT',
          paymentMethod: input.paymentMethod,
          subtotal: priced.summary.subtotal,
          discountTotal: priced.summary.discount,
          shippingTotal: priced.summary.delivery,
          taxTotal: priced.summary.taxIncluded,
          grandTotal: priced.summary.total,
          couponCode: priced.coupon?.valid ? priced.coupon.code : null,
          shippingAddress: shippingAddress as Prisma.InputJsonValue,
          gstin: input.gstin || null,
          customerNote: input.note || null,
          idempotencyKey,
          accessToken: randomToken(18),
          cartId: cart.id,
          reservationExpiresAt: isCod ? null : holdUntil,
          items: {
            create: priced.items.map((i) => ({
              variantId: i.variantId,
              productId: i.productId,
              productName: i.name,
              productSlug: i.slug,
              variantTitle: i.variantTitle,
              sku: i.sku,
              imageKey: i.imageKey,
              unitPrice: i.unitPrice,
              mrp: i.mrp,
              quantity: i.quantity,
              discount: i.discount,
              gstRate: i.gstRate,
              taxAmount: Math.round(((i.lineTotal - i.discount) * i.gstRate) / (100 + i.gstRate)),
              lineTotal: i.lineTotal,
              hsnCode: i.hsnCode,
              installationIncluded: i.installationIncluded,
              returnable: i.returnable,
              returnWindowDays: i.returnWindowDays,
            })),
          },
          events: {
            create: { toStatus: isCod ? 'PENDING_CONFIRMATION' : 'PENDING_PAYMENT', actorType: 'CUSTOMER', actorId: user?.id, note: isCod ? 'Placed with cash on delivery' : 'Placed, awaiting online payment' },
          },
          payments: {
            create: { method: input.paymentMethod, provider: isCod ? 'cod' : 'razorpay', amount: priced.summary.total, status: isCod ? 'PENDING_COLLECTION' : 'CREATED' },
          },
        },
      });

      await this.inventory.reserve(
        tx,
        order.id,
        priced.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, label: `${i.name} (${i.variantTitle})` })),
        isCod ? new Date(Date.now() + 365 * 86_400_000) : holdUntil,
        pin?.locationId,
      );
      if (isCod) await this.inventory.commit(tx, order.id, orderNumber);

      if (priced.coupon?.valid) {
        const coupon = await tx.coupon.findFirstOrThrow({ where: { code: { equals: priced.coupon.code, mode: 'insensitive' } } });
        const claimed = await tx.coupon.updateMany({
          where: { id: coupon.id, OR: [{ usageLimit: null }, { usedCount: { lt: coupon.usageLimit ?? 0 } }] },
          data: { usedCount: { increment: 1 } },
        });
        if (claimed.count !== 1) throw badRequest('COUPON_INVALID', 'This code has been fully used.');
        await tx.couponRedemption.create({ data: { couponId: coupon.id, orderId: order.id, email: input.contact.email, amount: priced.summary.discount } });
      }

      if (user && input.saveAddress) {
        const same = await tx.address.findFirst({ where: { userId: user.id, line1: input.address.line1, pincode: input.address.pincode } });
        if (!same) {
          const count = await tx.address.count({ where: { userId: user.id } });
          await tx.address.create({ data: { ...input.address, userId: user.id, isDefault: count === 0 } });
        }
      }
      if (user && !user.phone) await tx.user.update({ where: { id: user.id }, data: { phone: input.contact.phone, name: user.name ?? input.contact.name } });

      if (isCod) {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        await tx.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
        const full = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
        await this.mail.queue(order.email, 'orderPlaced', { ...this.orders.summary(full), cod: true }, tx);
      }
      return order.id;
    });

    if (!isCod) {
      try {
        const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
        const rp = await this.razorpay.createOrder(order.grandTotal, order.orderNumber, { orderNumber: order.orderNumber });
        await this.prisma.payment.updateMany({ where: { orderId, status: 'CREATED' }, data: { providerOrderId: rp.id } });
      } catch (err) {
        this.logger.error(`Could not start Razorpay payment: ${(err as Error).message}`);
        await this.orders.cancel(orderId, { type: 'SYSTEM' }, 'Payment could not be started').catch(() => undefined);
        throw new AppError(503, 'PAYMENT_START_FAILED', 'We could not start the payment. You have not been charged. Please try again or choose cash on delivery.');
      }
    }
    return this.response(orderId);
  }

  /** What the browser needs after placing (or re-opening) an order. */
  async response(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: { orderBy: { createdAt: 'desc' } } } });
    const payment = order.payments.find((p) => p.method === 'ONLINE' && p.status === 'CREATED');
    return {
      orderNumber: order.orderNumber,
      accessToken: order.accessToken,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total: order.grandTotal,
      reservationExpiresAt: order.reservationExpiresAt,
      razorpay:
        order.status === 'PENDING_PAYMENT' && payment?.providerOrderId
          ? {
              ...this.razorpay.checkoutOptions(),
              orderId: payment.providerOrderId,
              amount: order.grandTotal,
              currency: 'INR',
              // Razorpay pre-fills only an E.164 number (+91XXXXXXXXXX); otherwise it asks the customer again.
              prefill: { name: order.name, email: order.email, contact: order.phone ? `+91${order.phone.replace(/\D/g, '').slice(-10)}` : undefined },
            }
          : null,
    };
  }

  /** Finds an order the visitor may see: their own account order, or a guest order with its access token. */
  async findAccessible(req: AppRequest, orderNumber: string, token?: string) {
    const order = await this.prisma.order.findUnique({ where: { orderNumber } });
    if (!order) throw notFound('Order');
    const owns = req.user && order.userId === req.user.id;
    const hasToken = token && safeEqual(token, order.accessToken);
    if (!owns && !hasToken) throw notFound('Order');
    return order;
  }

  async verifyPayment(req: AppRequest, body: { orderNumber: string; token?: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) {
    const order = await this.findAccessible(req, body.orderNumber, body.token);
    const payment = await this.prisma.payment.findFirst({ where: { orderId: order.id, providerOrderId: body.razorpayOrderId } });
    if (!payment) throw badRequest('PAYMENT_MISMATCH', 'This payment does not belong to this order.');
    if (!this.razorpay.verifyPaymentSignature(body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature)) {
      this.logger.warn(`Invalid payment signature for ${order.orderNumber} from ${req.ip}`);
      throw badRequest('PAYMENT_SIGNATURE_INVALID', 'We could not verify this payment. If money was taken, it will be confirmed or refunded automatically.');
    }
    // Never trust the browser alone: confirm amount and status with Razorpay.
    let rp = await this.razorpay.fetchPayment(body.razorpayPaymentId);
    if (rp.order_id !== body.razorpayOrderId || rp.amount !== order.grandTotal) {
      throw badRequest('PAYMENT_MISMATCH', 'The payment amount does not match this order.');
    }
    if (rp.status === 'authorized') {
      await this.razorpay.capture(rp.id, rp.amount);
      rp = await this.razorpay.fetchPayment(rp.id);
    }
    if (rp.status !== 'captured') return { orderNumber: order.orderNumber, status: order.status, pending: true };
    await this.orders.confirmPaid(order.id, { providerPaymentId: rp.id, amount: rp.amount, method: rp.method, raw: rp });
    const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    return { orderNumber: fresh.orderNumber, status: fresh.status, pending: false };
  }

  async recordFailedAttempt(req: AppRequest, orderNumber: string, token: string | undefined, reason: string) {
    const order = await this.findAccessible(req, orderNumber, token);
    await this.prisma.payment.updateMany({ where: { orderId: order.id, status: 'CREATED' }, data: { errorReason: reason.slice(0, 300) } });
    return this.response(order.id);
  }
}
