import { Injectable, Logger } from '@nestjs/common';
import type { Pincode } from '@prisma/client';
import { SettingsService } from '../common/settings.service';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
const INDIAN_PIN = /^[1-9]\d{5}$/;

/** How we deliver to one pincode: its own listed terms, or the all-India defaults. */
export interface DeliveryTerms {
  pincode: string;
  city: string | null;
  state: string | null;
  leadDays: number;
  deliveryFee: number;
  codAvailable: boolean; // pincode-level; the store-wide COD switch is applied in describe()
  installationAvailable: boolean;
  locationId: string;
  listed: boolean;
}

/**
 * Shipping boundary. The MVP uses the "manual" provider: the store's own team or transport it arranges.
 * By default every valid Indian pincode is served on the all-India terms (Settings → Delivery);
 * listed pincodes (Inventory → Pincodes) get their own fee and lead time, and an inactive listed
 * pincode is blocked. With "deliver anywhere in India" off, only listed pincodes are served.
 * A carrier adapter can replace this later (SHIPPING_PROVIDER) without touching checkout or orders.
 */
@Injectable()
export class LogisticsService {
  private readonly logger = new Logger('Logistics');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** The delivery terms for a pincode, or null when we don't deliver there. */
  async resolve(pincode: string): Promise<DeliveryTerms | null> {
    return (await this.check(pincode)).terms;
  }

  /** Terms plus, when refused, why: not a real pincode, blocked by us, or outside a listed-only delivery area. */
  async check(pincode: string): Promise<{ terms: DeliveryTerms | null; reason: 'INVALID' | 'BLOCKED' | 'OUTSIDE_AREA' | null; area: string | null }> {
    if (!INDIAN_PIN.test(pincode)) return { terms: null, reason: 'INVALID', area: null };
    const pin = await this.prisma.pincode.findUnique({ where: { pincode } });
    if (pin) {
      if (!pin.active) return { terms: null, reason: 'BLOCKED', area: null }; // listed but switched off: blocked even with all-India delivery
      return {
        reason: null,
        area: null,
        terms: {
          pincode,
          city: pin.city,
          state: pin.state,
          leadDays: pin.leadDays,
          deliveryFee: pin.deliveryFee,
          codAvailable: pin.codAvailable,
          installationAvailable: pin.installationAvailable,
          locationId: pin.locationId,
          listed: true,
        },
      };
    }
    const d = await this.settings.get('delivery');
    if (!d.allIndia) return { terms: null, reason: 'OUTSIDE_AREA', area: null };
    const place = await this.place(pincode);
    if (place?.found === false) return { terms: null, reason: 'INVALID', area: null }; // India Post has no such pincode
    const locationId = await this.homeLocationId();
    if (!locationId) return { terms: null, reason: 'OUTSIDE_AREA', area: null };
    return {
      reason: null,
      area: place?.area ?? null,
      terms: {
        pincode,
        city: place?.district ?? null,
        state: place?.state ?? null,
        leadDays: d.defaultLeadDays,
        deliveryFee: d.defaultFee,
        codAvailable: d.defaultCod,
        installationAvailable: d.defaultInstallation,
        locationId,
        listed: false,
      },
    };
  }

  /**
   * District and state for any pincode: our cached copy first, else one call to India Post's public
   * service (3-second limit), saved for next time. Returns null when unknown (lookup off or unreachable),
   * so delivery still works; the customer just types the city themselves.
   */
  private async place(pincode: string): Promise<{ found: boolean; district: string | null; state: string | null; area: string | null } | null> {
    const cached = await this.prisma.pincodeDirectory.findUnique({ where: { pincode } });
    // Found places never change; "no such pincode" is re-checked after 30 days in case India Post adds it.
    if (cached && (cached.found || Date.now() - cached.fetchedAt.getTime() < 30 * DAY)) return cached;
    if (config.PINCODE_LOOKUP === 'off') return cached ?? null;
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return cached ?? null;
      const body = (await res.json()) as { Status?: string; PostOffice?: { Name: string; Block?: string; District?: string; State?: string }[] | null }[];
      const offices = body?.[0]?.Status === 'Success' ? (body[0].PostOffice ?? []) : [];
      if (body?.[0]?.Status !== 'Success' && body?.[0]?.Status !== 'Error') return cached ?? null; // unexpected reply: don't cache
      const first = offices[0];
      const data = {
        found: offices.length > 0,
        district: first?.District ?? null,
        state: first?.State ?? null,
        area: first ? (first.Block && first.Block !== 'NA' ? first.Block : first.Name) : null,
      };
      await this.prisma.pincodeDirectory.upsert({ where: { pincode }, update: { ...data, fetchedAt: new Date() }, create: { pincode, ...data } });
      return data;
    } catch (err) {
      this.logger.warn(`Pincode lookup for ${pincode} failed: ${(err as Error).message}`);
      return cached ?? null;
    }
  }

  /** Main dispatch location for unlisted pincodes: the active location in the store's own city, else the oldest. */
  private async homeLocationId() {
    const [locations, store] = await Promise.all([
      this.prisma.location.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, city: true } }),
      this.settings.get('store'),
    ]);
    return (locations.find((l) => store.address.toLowerCase().includes(l.city.toLowerCase())) ?? locations[0])?.id ?? null;
  }

  /** Delivery window: pincode lead days plus the slowest item's make-to-order time, skipping Sundays. */
  estimate(pin: Pick<Pincode, 'leadDays'>, itemLeadDays = 0, from = new Date()) {
    const start = addWorkingDays(from, pin.leadDays + itemLeadDays);
    const end = addWorkingDays(start, 2);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }

  async describe(pincode: string, itemLeadDays = 0) {
    const { terms, reason, area } = await this.check(pincode);
    if (!terms) return { pincode, serviceable: false as const, reason };
    const cod = await this.settings.get('cod');
    return {
      pincode,
      serviceable: true as const,
      city: terms.city,
      state: terms.state,
      area,
      // COD for this pincode, and only while the store offers COD at all (Admin → Settings → Payment methods).
      codAvailable: terms.codAvailable && cod.enabled,
      installationAvailable: terms.installationAvailable,
      deliveryFee: terms.deliveryFee,
      leadDays: terms.leadDays,
      listed: terms.listed,
      estimate: this.estimate(terms, itemLeadDays),
    };
  }
}

export function addWorkingDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  let added = 0;
  while (added < days) {
    d.setTime(d.getTime() + DAY);
    if (d.getDay() !== 0) added++;
  }
  return d;
}
