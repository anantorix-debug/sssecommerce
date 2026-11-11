import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';

/** Typed store settings with defaults; values live in the Setting table and are editable in admin. */
export const SETTING_DEFAULTS = {
  store: {
    name: 'SSS Furniture',
    legalName: 'SSS Furniture',
    gstin: '33AAAAA0000A1Z5', // placeholder: set the real GSTIN in Admin → Settings before invoicing
    state: 'Tamil Nadu',
    stateCode: '33',
    address: '100/179, Erumapalayam Pallikuduthar Kadu (near Govt Ration Store), Saniyasi Gundu, Salem, Tamil Nadu 636015',
    email: 'care@sssfurniture.co.in',
    phone: '+91 93420 83981',
    supportHours: 'Mon to Sat, 10am to 7pm',
  },
  cod: {
    enabled: true,
    maxOrderValue: 5_000_000, // ₹50,000 in paise
    maxOpenOrders: 3,
  },
  checkout: {
    reservationMinutes: 15,
    freeDeliveryAbove: 2_500_000, // ₹25,000
  },
  // Store-wide switch for Razorpay (only takes effect when the server has Razorpay keys). COD's switch is cod.enabled.
  payments: {
    online: true,
  },
  announcement: {
    text: 'Free delivery and installation on furniture above ₹25,000 · Call 93420 83981',
    href: '/policies/shipping',
    enabled: true,
  },
  delivery: {
    windows: ['09:00 – 13:00', '14:00 – 18:00'],
    defaultCapacity: 8,
    daysAhead: 21,
    // Deliver to every valid Indian pincode. Listed pincodes (Inventory → Pincodes) override these
    // defaults with their own fee and lead time, and a listed pincode marked inactive is blocked.
    allIndia: true,
    defaultLeadDays: 10,
    defaultFee: 99_900, // ₹999
    defaultCod: false,
    defaultInstallation: false,
  },
  finishLibrary: [
    { name: 'Natural Teak', hex: '#B07A47' },
    { name: 'Walnut', hex: '#5A3B26' },
    { name: 'Smoked Oak', hex: '#7A6450' },
    { name: 'Ebony', hex: '#2A2522' },
    { name: 'Ivory Linen', hex: '#E8E1D3' },
    { name: 'Moss Velvet', hex: '#4E5B3A' },
  ],
  attributeKeys: [
    { key: 'material', label: 'Material', filterable: true },
    { key: 'seating', label: 'Seating', filterable: true },
    { key: 'style', label: 'Style', filterable: true },
    { key: 'origin', label: 'Made in', filterable: false },
  ],
} as const;

type Widen<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean
  : T extends readonly (infer U)[] ? Widen<U>[] : T extends object ? { -readonly [K in keyof T]: Widen<T[K]> } : T;
export type Settings = Widen<typeof SETTING_DEFAULTS>;
export type SettingKey = keyof Settings;

@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: unknown; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<Settings[K]> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 30_000) return hit.value as Settings[K];
    const row = await this.prisma.setting.findUnique({ where: { key } });
    const fallback = SETTING_DEFAULTS[key] as unknown as Settings[K];
    const value =
      row && typeof fallback === 'object' && !Array.isArray(fallback)
        ? ({ ...fallback, ...(row.value as object) } as Settings[K])
        : ((row?.value as Settings[K] | undefined) ?? fallback);
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  /** Which payment methods the store offers right now (before per-order rules such as the COD value limit). */
  async paymentMethods() {
    const [payments, cod] = await Promise.all([this.get('payments'), this.get('cod')]);
    return { online: config.onlinePaymentsEnabled && payments.online, cod: cod.enabled };
  }

  async all() {
    const keys = Object.keys(SETTING_DEFAULTS) as SettingKey[];
    const entries = await Promise.all(keys.map(async (k) => [k, await this.get(k)] as const));
    return Object.fromEntries(entries) as Settings;
  }

  async set<K extends SettingKey>(key: K, value: Settings[K], staffId?: string) {
    await this.prisma.setting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, updatedBy: staffId },
      create: { key, value: value as Prisma.InputJsonValue, updatedBy: staffId },
    });
    this.cache.delete(key);
  }
}
