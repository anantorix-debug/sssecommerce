import { Injectable } from '@nestjs/common';
import type { Order, OrderItem } from '@prisma/client';
import { conflict, notFound, unprocessable } from '../common/errors';
import { SettingsService } from '../common/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { addWorkingDays, LogisticsService } from './logistics.service';

const DAY = 86_400_000;
const dateOnly = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/** Delivery slots with a capacity per location, day and time window. Installation happens on the same visit. */
@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly logistics: LogisticsService,
  ) {}

  private async context(order: Order & { items: OrderItem[] }) {
    const address = order.shippingAddress as { pincode: string };
    // Listed pincodes book their own location's slots; all-India deliveries use the main location's calendar.
    const pin = await this.logistics.resolve(address.pincode);
    if (!pin) throw unprocessable('PINCODE_UNSERVICEABLE', 'This address is outside our delivery area.');
    const variants = await this.prisma.variant.findMany({ where: { id: { in: order.items.map((i) => i.variantId) } }, select: { leadTimeDays: true } });
    const lead = pin.leadDays + Math.max(0, ...variants.map((v) => v.leadTimeDays));
    const earliest = dateOnly(addWorkingDays(order.confirmedAt ?? new Date(), Math.max(1, lead - 1)));
    const tomorrow = dateOnly(new Date(Date.now() + DAY));
    return { pin, earliest: earliest > tomorrow ? earliest : tomorrow, installs: order.items.some((i) => i.installationIncluded) && pin.installationAvailable };
  }

  async availableSlots(order: Order & { items: OrderItem[] }) {
    const { pin, earliest, installs } = await this.context(order);
    const slots = await this.prisma.deliverySlot.findMany({
      where: { locationId: pin.locationId, active: true, date: { gte: earliest, lte: new Date(earliest.getTime() + 21 * DAY) } },
      orderBy: [{ date: 'asc' }, { window: 'asc' }],
    });
    return {
      earliest: earliest.toISOString().slice(0, 10),
      installationIncluded: installs,
      current: order.deliverySlotId,
      slots: slots.map((s) => ({
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        window: s.window,
        available: Math.max(0, s.capacity - s.booked),
        full: s.booked >= s.capacity,
      })),
    };
  }

  async book(order: Order & { items: OrderItem[] }, slotId: string) {
    if (!['CONFIRMED', 'PROCESSING'].includes(order.status)) {
      throw conflict('ORDER_NOT_SCHEDULABLE', 'Delivery can be scheduled once the order is confirmed and before it is dispatched.');
    }
    if (order.deliverySlotId === slotId) return;
    const { pin, earliest, installs } = await this.context(order);
    await this.prisma.$transaction(async (tx) => {
      const slot = await tx.deliverySlot.findUnique({ where: { id: slotId } });
      if (!slot || !slot.active || slot.locationId !== pin.locationId) throw notFound('Delivery slot');
      if (slot.date < earliest) throw unprocessable('SLOT_TOO_EARLY', 'That date is earlier than we can deliver this order.');
      const taken = await tx.$executeRaw`UPDATE "DeliverySlot" SET "booked" = "booked" + 1 WHERE "id" = ${slotId} AND "booked" < "capacity"`;
      if (taken !== 1) throw conflict('SLOT_FULL', 'That slot was just booked up. Please choose another.');
      if (order.deliverySlotId) {
        await tx.$executeRaw`UPDATE "DeliverySlot" SET "booked" = GREATEST("booked" - 1, 0) WHERE "id" = ${order.deliverySlotId}`;
      }
      await tx.order.update({ where: { id: order.id }, data: { deliverySlotId: slotId } });
      await tx.orderEvent.create({ data: { orderId: order.id, toStatus: order.status, fromStatus: order.status, actorType: 'CUSTOMER', note: `Delivery booked for ${slot.date.toISOString().slice(0, 10)}, ${slot.window}` } });
      if (installs) {
        const job = await tx.installationJob.findFirst({ where: { orderId: order.id, status: 'SCHEDULED' } });
        if (job) await tx.installationJob.update({ where: { id: job.id }, data: { scheduledOn: slot.date, window: slot.window } });
        else await tx.installationJob.create({ data: { orderId: order.id, scheduledOn: slot.date, window: slot.window } });
      }
    });
  }

  /** Keeps slots open for the next N days for every active location. Idempotent. */
  async generate(days?: number, from = new Date()) {
    const settings = await this.settings.get('delivery');
    const span = days ?? settings.daysAhead;
    const locations = await this.prisma.location.findMany({ where: { isActive: true } });
    const data = [];
    for (const loc of locations) {
      for (let i = 1; i <= span; i++) {
        const day = dateOnly(new Date(from.getTime() + i * DAY));
        if (day.getUTCDay() === 0) continue; // no Sunday deliveries
        for (const window of settings.windows) data.push({ locationId: loc.id, date: day, window, capacity: settings.defaultCapacity });
      }
    }
    const res = await this.prisma.deliverySlot.createMany({ data, skipDuplicates: true });
    return res.count;
  }
}
