import { Injectable, Logger } from '@nestjs/common';
import Razorpay from 'razorpay';
import { config } from '../config';
import { hmacSha256Hex, safeEqual } from '../common/crypto';
import { AppError } from '../common/errors';

/**
 * Payment provider boundary. In the MVP this runs in Razorpay test mode only
 * (enforced at startup in config.ts). EMI is hidden unless FEATURE_EMI=true.
 */
@Injectable()
export class RazorpayService {
  private readonly logger = new Logger('Razorpay');
  private readonly client: Razorpay | null;

  constructor() {
    this.client = config.onlinePaymentsEnabled
      ? new Razorpay({ key_id: config.RAZORPAY_KEY_ID, key_secret: config.RAZORPAY_KEY_SECRET })
      : null;
  }

  get enabled() {
    return this.client !== null;
  }

  private api() {
    if (!this.client) throw new AppError(503, 'ONLINE_PAYMENT_UNAVAILABLE', 'Online payment is not available right now. Please choose cash on delivery.');
    return this.client;
  }

  async createOrder(amount: number, receipt: string, notes: Record<string, string>) {
    const order = await this.api().orders.create({ amount, currency: 'INR', receipt, notes, payment_capture: true });
    return order as { id: string; amount: number; status: string };
  }

  async fetchPayment(paymentId: string) {
    return (await this.api().payments.fetch(paymentId)) as {
      id: string;
      order_id: string;
      amount: number;
      currency: string;
      status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
      method: string;
      error_description?: string;
    };
  }

  async capture(paymentId: string, amount: number) {
    return this.api().payments.capture(paymentId, amount, 'INR');
  }

  async orderPayments(razorpayOrderId: string) {
    const res = (await this.api().orders.fetchPayments(razorpayOrderId)) as { items: Awaited<ReturnType<RazorpayService['fetchPayment']>>[] };
    return res.items;
  }

  async refund(paymentId: string, amount: number, notes: Record<string, string>) {
    const r = (await this.api().payments.refund(paymentId, { amount, speed: 'normal', notes })) as { id: string; status: string };
    return r;
  }

  /** Checkout callback signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
    if (!config.RAZORPAY_KEY_SECRET) return false;
    return safeEqual(hmacSha256Hex(config.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
  }

  /** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
  verifyWebhookSignature(rawBody: Buffer, signature: string) {
    if (!config.RAZORPAY_WEBHOOK_SECRET) {
      this.logger.warn('Webhook received but RAZORPAY_WEBHOOK_SECRET is not set; rejecting.');
      return false;
    }
    return safeEqual(hmacSha256Hex(config.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
  }

  checkoutOptions() {
    return {
      keyId: config.RAZORPAY_KEY_ID,
      mode: config.PAYMENTS_MODE,
      // EMI stays hidden in the MVP; the switch is FEATURE_EMI.
      hiddenMethods: config.FEATURE_EMI ? [] : ['emi', 'cardless_emi', 'paylater'],
    };
  }
}
