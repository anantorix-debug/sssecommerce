import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { AppRequest } from '../common/request';
import { addressSchema, email, phone, zv } from '../common/zod';
import { OrderService } from '../orders/order.service';
import { CheckoutService, PlaceOrderInput } from './checkout.service';

const placeSchema = z.object({
  contact: z.object({ email, phone, name: z.string().trim().min(2).max(100) }),
  address: addressSchema,
  paymentMethod: z.enum(['ONLINE', 'COD']),
  expectedTotal: z.number().int().min(0),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN.')
    .optional()
    .nullable()
    .or(z.literal('')),
  note: z.string().trim().max(500).optional().nullable(),
  saveAddress: z.boolean().optional(),
  acceptTerms: z.literal(true, { message: 'Please accept the terms to place your order.' }),
});

const verifySchema = z.object({
  orderNumber: z.string().max(40),
  token: z.string().max(100).optional(),
  razorpayOrderId: z.string().max(60),
  razorpayPaymentId: z.string().max(60),
  razorpaySignature: z.string().max(200),
});

@Controller('store/checkout')
@UseGuards(RateLimitGuard)
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: OrderService,
  ) {}

  @Post('orders')
  @RateLimit('placeOrder', 'session')
  place(@Req() req: AppRequest, @Headers('idempotency-key') key: string | undefined, @Body(zv(placeSchema)) body: PlaceOrderInput) {
    return this.checkout.place(req, body, key);
  }

  @Get('orders/:orderNumber')
  async status(@Req() req: AppRequest, @Param('orderNumber') orderNumber: string, @Query('t') token?: string) {
    const order = await this.checkout.findAccessible(req, orderNumber, token);
    return { ...(await this.orders.detailForCustomer({ id: order.id })), payment: await this.checkout.response(order.id) };
  }

  /** Re-opens Razorpay for an order still awaiting payment (retry after a failure). */
  @Post('orders/:orderNumber/pay')
  @RateLimit('verifyPayment', 'session')
  async pay(@Req() req: AppRequest, @Param('orderNumber') orderNumber: string, @Body(zv(z.object({ token: z.string().max(100).optional() }))) body: { token?: string }) {
    const order = await this.checkout.findAccessible(req, orderNumber, body.token);
    return this.checkout.response(order.id);
  }

  @Post('orders/:orderNumber/payment-failed')
  @HttpCode(200)
  @RateLimit('verifyPayment', 'session')
  failed(
    @Req() req: AppRequest,
    @Param('orderNumber') orderNumber: string,
    @Body(zv(z.object({ token: z.string().max(100).optional(), reason: z.string().max(300).default('Payment failed') }))) body: { token?: string; reason: string },
  ) {
    return this.checkout.recordFailedAttempt(req, orderNumber, body.token, body.reason);
  }

  @Post('payments/verify')
  @HttpCode(200)
  @RateLimit('verifyPayment', 'session')
  verify(@Req() req: AppRequest, @Body(zv(verifySchema)) body: z.infer<typeof verifySchema>) {
    return this.checkout.verifyPayment(req, body);
  }
}
