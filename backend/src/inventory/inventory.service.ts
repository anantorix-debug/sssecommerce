import { Injectable } from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { badRequest, conflict } from '../common/errors';
import { Db, PrismaService, Tx } from '../prisma/prisma.service';

export interface StockLine {
  variantId: string;
  quantity: number;
  label?: string;
}

/**
 * Stock rules:
 *  - available = onHand - reserved, never negative (also enforced by a CHECK constraint)
 *  - stock is held at order placement with a conditional UPDATE, so concurrent buyers
 *    of the last unit cannot both succeed
 *  - every change to onHand writes an append-only StockMovement
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async available(variantId: string, db: Db = this.prisma) {
    const rows = await db.inventoryLevel.findMany({ where: { variantId, location: { isActive: true } } });
    return rows.reduce((sum, r) => sum + Math.max(0, r.onHand - r.reserved), 0);
  }

  async availableMany(variantIds: string[], db: Db = this.prisma) {
    const rows = await db.inventoryLevel.findMany({ where: { variantId: { in: variantIds }, location: { isActive: true } } });
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.variantId, (map.get(r.variantId) ?? 0) + Math.max(0, r.onHand - r.reserved));
    return map;
  }

  /** Holds stock for an order. Throws STOCK_INSUFFICIENT listing every short line; the caller's transaction rolls back. */
  async reserve(tx: Tx, orderId: string, lines: StockLine[], expiresAt: Date, preferredLocationId?: string) {
    const short: { variantId: string; requested: number; available: number; label?: string }[] = [];
    for (const line of lines) {
      const levels = await tx.inventoryLevel.findMany({
        where: { variantId: line.variantId, location: { isActive: true } },
        orderBy: { onHand: 'desc' },
      });
      const ordered = [
        ...levels.filter((l) => l.locationId === preferredLocationId),
        ...levels.filter((l) => l.locationId !== preferredLocationId),
      ];
      let held: string | null = null;
      for (const level of ordered) {
        const updated = await tx.$executeRaw`
          UPDATE "InventoryLevel" SET "reserved" = "reserved" + ${line.quantity}, "updatedAt" = now()
          WHERE "id" = ${level.id} AND "onHand" - "reserved" >= ${line.quantity}`;
        if (updated === 1) {
          held = level.locationId;
          break;
        }
      }
      if (!held) {
        short.push({
          variantId: line.variantId,
          requested: line.quantity,
          available: levels.reduce((s, l) => s + Math.max(0, l.onHand - l.reserved), 0),
          label: line.label,
        });
        continue;
      }
      await tx.stockReservation.create({
        data: { orderId, variantId: line.variantId, locationId: held, quantity: line.quantity, expiresAt },
      });
    }
    if (short.length) {
      throw conflict(
        'STOCK_INSUFFICIENT',
        short.length === 1 && short[0].label
          ? `Only ${short[0].available} left of ${short[0].label}.`
          : 'Some items no longer have enough stock.',
        short,
      );
    }
  }

  /** Converts an order's held stock into a sale. */
  async commit(tx: Tx, orderId: string, reference: string) {
    const holds = await tx.stockReservation.findMany({ where: { orderId, status: 'ACTIVE' } });
    for (const h of holds) {
      await tx.$executeRaw`
        UPDATE "InventoryLevel" SET "onHand" = "onHand" - ${h.quantity}, "reserved" = "reserved" - ${h.quantity}, "updatedAt" = now()
        WHERE "variantId" = ${h.variantId} AND "locationId" = ${h.locationId}`;
      await tx.stockMovement.create({
        data: { variantId: h.variantId, locationId: h.locationId, type: 'SALE', quantity: -h.quantity, reference },
      });
      const variant = await tx.variant.findUnique({ where: { id: h.variantId }, select: { productId: true } });
      if (variant) await tx.product.update({ where: { id: variant.productId }, data: { soldCount: { increment: h.quantity } } });
    }
    await tx.stockReservation.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status: 'CONSUMED' } });
    return holds.length;
  }

  /** Lets go of held stock (payment never came, or order cancelled before payment). */
  async release(tx: Tx, orderId: string) {
    const holds = await tx.stockReservation.findMany({ where: { orderId, status: 'ACTIVE' } });
    for (const h of holds) {
      await tx.$executeRaw`
        UPDATE "InventoryLevel" SET "reserved" = GREATEST("reserved" - ${h.quantity}, 0), "updatedAt" = now()
        WHERE "variantId" = ${h.variantId} AND "locationId" = ${h.locationId}`;
    }
    await tx.stockReservation.updateMany({ where: { orderId, status: 'ACTIVE' }, data: { status: 'RELEASED' } });
    return holds.length;
  }

  /** Puts sold stock back after a cancellation, at the location it was sold from. */
  async restockOrder(tx: Tx, orderId: string, reference: string, type: StockMovementType = 'CANCEL_RESTOCK', only?: Map<string, number>) {
    const sold = await tx.stockReservation.findMany({ where: { orderId, status: 'CONSUMED' } });
    for (const s of sold) {
      const qty = only ? Math.min(only.get(s.variantId) ?? 0, s.quantity) : s.quantity;
      if (qty <= 0) continue;
      await this.move(tx, { variantId: s.variantId, locationId: s.locationId, quantity: qty, type, reference });
      const variant = await tx.variant.findUnique({ where: { id: s.variantId }, select: { productId: true } });
      if (variant) await tx.product.update({ where: { id: variant.productId }, data: { soldCount: { decrement: qty } } });
    }
  }

  /** Records a stock movement and applies it to on-hand stock. */
  async move(
    tx: Tx,
    m: { variantId: string; locationId: string; quantity: number; type: StockMovementType; reason?: string; reference?: string; actorId?: string },
  ) {
    const level = await tx.inventoryLevel.upsert({
      where: { variantId_locationId: { variantId: m.variantId, locationId: m.locationId } },
      update: {},
      create: { variantId: m.variantId, locationId: m.locationId },
    });
    if (level.onHand + m.quantity < level.reserved) {
      throw badRequest('STOCK_BELOW_RESERVED', `That would leave ${level.onHand + m.quantity} on hand, but ${level.reserved} are held for orders.`);
    }
    await tx.inventoryLevel.update({ where: { id: level.id }, data: { onHand: { increment: m.quantity } } });
    return tx.stockMovement.create({ data: m });
  }
}
