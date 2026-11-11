import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Db } from '../prisma/prisma.service';
import type { StaffWithRole } from './request';

export interface AuditEntry {
  staff?: Pick<StaffWithRole, 'id' | 'email'> | null;
  actorType?: 'STAFF' | 'CUSTOMER' | 'SYSTEM';
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/** Append-only record of every admin write and sensitive read. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Db = this.prisma) {
    await db.auditLog.create({
      data: {
        actorType: entry.actorType ?? (entry.staff ? 'STAFF' : 'SYSTEM'),
        actorId: entry.staff?.id,
        actorEmail: entry.staff?.email,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? undefined,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: entry.ip,
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value, (k, v) => (k === 'passwordHash' || k === 'totpSecret' ? undefined : v)));
}
