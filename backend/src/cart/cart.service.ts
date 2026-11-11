import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { config } from '../config';
import { randomToken } from '../common/crypto';
import { badRequest, notFound } from '../common/errors';
import { AppRequest } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';

export const CART_COOKIE = 'cart';
const CART_TTL_MS = 60 * 24 * 3600 * 1000;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  private setCookie(res: Response, token: string) {
    res.cookie(CART_COOKIE, token, { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/', maxAge: CART_TTL_MS });
  }

  /** Finds the visitor's cart from the cookie, or the signed-in customer's latest cart. */
  async find(req: AppRequest) {
    const token = req.cookies?.[CART_COOKIE];
    if (token) {
      const cart = await this.prisma.cart.findUnique({ where: { token }, include: { items: { orderBy: { addedAt: 'asc' } } } });
      if (cart && (!cart.userId || cart.userId === req.user?.id)) return cart;
    }
    if (req.user) {
      return this.prisma.cart.findFirst({ where: { userId: req.user.id }, orderBy: { updatedAt: 'desc' }, include: { items: { orderBy: { addedAt: 'asc' } } } });
    }
    return null;
  }

  async findOrCreate(req: AppRequest, res: Response) {
    const existing = await this.find(req);
    if (existing) {
      if (req.cookies?.[CART_COOKIE] !== existing.token) this.setCookie(res, existing.token);
      return existing;
    }
    const token = randomToken(24);
    const cart = await this.prisma.cart.create({ data: { token, userId: req.user?.id }, include: { items: true } });
    this.setCookie(res, token);
    return cart;
  }

  async priced(req: AppRequest) {
    const cart = await this.find(req);
    const priced = await this.pricing.price({
      items: cart?.items ?? [],
      couponCode: cart?.couponCode,
      pincode: cart?.pincode,
      email: req.user?.email,
    });
    return { id: cart?.id ?? null, pincode: cart?.pincode ?? null, ...priced };
  }

  async addItem(req: AppRequest, res: Response, variantId: string, quantity: number) {
    const variant = await this.prisma.variant.findUnique({ where: { id: variantId }, include: { product: { select: { status: true } } } });
    if (!variant || !variant.active || variant.product.status !== 'ACTIVE') throw notFound('That item');
    const cart = await this.findOrCreate(req, res);
    const existing = cart.items.find((i) => i.variantId === variantId);
    const next = Math.min((existing?.quantity ?? 0) + quantity, variant.maxPerOrder);
    if (cart.items.length >= 30 && !existing) throw badRequest('CART_FULL', 'Your cart can hold up to 30 different items.');
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      update: { quantity: next },
      create: { cartId: cart.id, variantId, quantity: next },
    });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
  }

  async updateItem(req: AppRequest, itemId: string, quantity: number) {
    const cart = await this.find(req);
    const item = cart?.items.find((i) => i.id === itemId);
    if (!cart || !item) throw notFound('Cart item');
    if (quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
      return;
    }
    const variant = await this.prisma.variant.findUniqueOrThrow({ where: { id: item.variantId } });
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity: Math.min(quantity, variant.maxPerOrder) } });
  }

  async setCoupon(req: AppRequest, res: Response, code: string | null) {
    const cart = await this.findOrCreate(req, res);
    if (code) {
      const subtotalCart = await this.pricing.price({ items: cart.items, email: req.user?.email });
      const result = await this.pricing.evaluateCoupon(code, subtotalCart.summary.subtotal, req.user?.email ?? null);
      if (!result.valid) throw badRequest('COUPON_INVALID', result.message);
    }
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code ? code.trim().toUpperCase() : null } });
  }

  async setPincode(req: AppRequest, res: Response, pincode: string | null) {
    const cart = await this.findOrCreate(req, res);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { pincode } });
  }

  /** On sign-in, the guest cart becomes the customer's cart, absorbing any items saved earlier. */
  async mergeOnLogin(req: AppRequest, res: Response, userId: string) {
    const token = req.cookies?.[CART_COOKIE];
    const guest = token ? await this.prisma.cart.findUnique({ where: { token }, include: { items: true } }) : null;
    const saved = await this.prisma.cart.findFirst({
      where: { userId, ...(guest ? { id: { not: guest.id } } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: { items: true },
    });
    if (guest && (!guest.userId || guest.userId === userId)) {
      if (saved) {
        for (const item of saved.items) {
          const exists = guest.items.find((g) => g.variantId === item.variantId);
          if (!exists) await this.prisma.cartItem.create({ data: { cartId: guest.id, variantId: item.variantId, quantity: item.quantity } });
        }
        await this.prisma.cart.delete({ where: { id: saved.id } });
      }
      await this.prisma.cart.update({ where: { id: guest.id }, data: { userId } });
    } else if (saved) {
      this.setCookie(res, saved.token);
    }
  }

  async clear(cartId: string) {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
    await this.prisma.cart.update({ where: { id: cartId }, data: { couponCode: null } }).catch(() => undefined);
  }
}
