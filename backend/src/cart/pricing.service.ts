import { Injectable } from '@nestjs/common';
import type { Coupon } from '@prisma/client';
import { config } from '../config';
import { allocate, formatInr, includedTax } from '../common/money';
import { SettingsService } from '../common/settings.service';
import { toImg } from '../catalog/cards';
import { LogisticsService } from '../delivery/logistics.service';
import { InventoryService } from '../inventory/inventory.service';
import { Db, PrismaService } from '../prisma/prisma.service';

export interface PriceInput {
  items: { id: string; variantId: string; quantity: number }[];
  couponCode?: string | null;
  pincode?: string | null;
  email?: string | null;
}

export type PricedCart = Awaited<ReturnType<PricingService['price']>>;

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly logistics: LogisticsService,
    private readonly settings: SettingsService,
  ) {}

  async price(input: PriceInput, db: Db = this.prisma) {
    const variants = await db.variant.findMany({
      where: { id: { in: input.items.map((i) => i.variantId) } },
      include: {
        product: {
          include: {
            media: {
              where: { role: { in: ['GALLERY', 'LIFESTYLE'] }, media: { kind: 'IMAGE', deletedAt: null } },
              orderBy: { sort: 'asc' },
              include: { media: true },
            },
          },
        },
        optionValues: true,
      },
    });
    const stock = await this.inventory.availableMany(variants.map((v) => v.id), db);
    const checkout = await this.settings.get('checkout');
    const codSettings = await this.settings.get('cod');
    const methods = await this.settings.paymentMethods();

    const lines = input.items
      .map((item) => {
        const v = variants.find((x) => x.id === item.variantId);
        if (!v) return null;
        const p = v.product;
        const available = stock.get(v.id) ?? 0;
        const sellable = v.active && p.status === 'ACTIVE';
        const maxQuantity = sellable ? Math.min(available, v.maxPerOrder) : 0;
        const notices: string[] = [];
        if (!sellable) notices.push('UNAVAILABLE');
        else if (available === 0) notices.push('OUT_OF_STOCK');
        else if (item.quantity > maxQuantity) notices.push('QUANTITY_EXCEEDS_STOCK');
        const optionIds = new Set(v.optionValues.map((o) => o.optionValueId));
        const image = p.media.find((m) => m.optionValueId && optionIds.has(m.optionValueId)) ?? p.media.find((m) => !m.optionValueId) ?? p.media[0];
        return {
          id: item.id,
          variantId: v.id,
          productId: p.id,
          slug: p.slug,
          name: p.name,
          variantTitle: v.title,
          sku: v.sku,
          image: toImg(image?.media, p.name),
          imageKey: image?.media.storageKey ?? null,
          unitPrice: v.price,
          mrp: v.mrp,
          quantity: item.quantity,
          lineTotal: v.price * item.quantity,
          gstRate: p.gstRate,
          hsnCode: p.hsnCode,
          available,
          maxQuantity,
          leadTimeDays: v.leadTimeDays,
          installationIncluded: p.installationIncluded,
          codAllowed: p.codAllowed,
          returnable: p.returnable,
          returnWindowDays: p.returnWindowDays,
          notices,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const mrpTotal = lines.reduce((s, l) => s + (l.mrp ?? l.unitPrice) * l.quantity, 0);

    // Coupon
    let coupon: { code: string; discount: number; valid: boolean; message: string } | null = null;
    let discount = 0;
    if (input.couponCode) {
      const result = await this.evaluateCoupon(input.couponCode, subtotal, input.email ?? null, db);
      coupon = { code: input.couponCode.toUpperCase(), discount: result.discount, valid: result.valid, message: result.message };
      discount = result.valid ? result.discount : 0;
    }
    const lineDiscounts = allocate(discount, lines.map((l) => l.lineTotal));

    // Delivery
    const maxLead = lines.reduce((m, l) => Math.max(m, l.leadTimeDays), 0);
    const delivery = input.pincode ? await this.logistics.describe(input.pincode, maxLead) : null;
    const afterDiscount = subtotal - discount;
    const deliveryFee = delivery?.serviceable && afterDiscount < checkout.freeDeliveryAbove ? delivery.deliveryFee : 0;
    const total = afterDiscount + deliveryFee;

    const taxIncluded = lines.reduce((s, l, i) => s + includedTax(l.lineTotal - lineDiscounts[i], l.gstRate), 0);

    // Cash on delivery eligibility (open-order limit is checked at placement, when the email is known)
    let codReason: string | null = null;
    if (!codSettings.enabled) codReason = 'Cash on delivery is not available right now.';
    else if (lines.some((l) => !l.codAllowed)) codReason = 'One or more items cannot be paid for on delivery.';
    else if (total > codSettings.maxOrderValue) codReason = `Cash on delivery is available on orders up to ${formatInr(codSettings.maxOrderValue)}.`;
    else if (delivery && delivery.serviceable && !delivery.codAvailable) codReason = 'Cash on delivery is not available for this pincode.';

    const issues: { code: string; message: string }[] = [];
    if (!lines.length) issues.push({ code: 'CART_EMPTY', message: 'Your cart is empty.' });
    if (lines.some((l) => l.notices.length)) issues.push({ code: 'STOCK', message: 'Some items need your attention before checkout.' });
    if (delivery && !delivery.serviceable) issues.push({ code: 'PINCODE_UNSERVICEABLE', message: `We don't deliver to ${delivery.pincode} yet.` });

    return {
      items: lines.map((l, i) => ({ ...l, discount: lineDiscounts[i] })),
      itemCount: lines.reduce((s, l) => s + l.quantity, 0),
      coupon,
      delivery,
      summary: {
        subtotal,
        mrpTotal,
        savings: Math.max(0, mrpTotal - subtotal),
        discount,
        delivery: deliveryFee,
        freeDeliveryAbove: checkout.freeDeliveryAbove,
        total,
        taxIncluded,
      },
      payment: {
        // offered: the store has the method switched on at all (if not, the storefront hides it).
        // available: it can be used for this particular order.
        online: { offered: methods.online, available: methods.online, mode: config.PAYMENTS_MODE },
        cod: { offered: methods.cod, available: codReason === null, reason: codReason, limit: codSettings.maxOrderValue },
        emi: { available: config.FEATURE_EMI },
      },
      maxLeadDays: maxLead,
      issues,
    };
  }

  /** Checks a code against every coupon rule and returns the discount or a specific reason. */
  async evaluateCoupon(code: string, subtotal: number, email: string | null, db: Db = this.prisma) {
    const coupon = await db.coupon.findFirst({ where: { code: { equals: code.trim(), mode: 'insensitive' } } });
    const fail = (message: string) => ({ valid: false, discount: 0, message, coupon: null as Coupon | null });
    if (!coupon || !coupon.active) return fail('This code is not valid.');
    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) return fail('This code is not active yet.');
    if (coupon.endsAt && coupon.endsAt < now) return fail('This code has expired.');
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return fail('This code has been fully used.');
    if (subtotal < coupon.minSubtotal) return fail(`Add ${formatInr(coupon.minSubtotal - subtotal)} more to use this code.`);
    if (email) {
      const used = await db.couponRedemption.count({ where: { couponId: coupon.id, email } });
      if (used >= coupon.perCustomerLimit) return fail('You have already used this code.');
      if (coupon.firstOrderOnly) {
        const prior = await db.order.count({ where: { email, status: { in: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } } });
        if (prior > 0) return fail('This code is for your first order only.');
      }
    }
    let discount = coupon.type === 'PERCENT' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    discount = Math.min(discount, subtotal);
    return { valid: true, discount, message: `${coupon.code} applied. You save ${formatInr(discount)}.`, coupon };
  }
}
