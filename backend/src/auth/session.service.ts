import { Injectable } from '@nestjs/common';
import { SessionRealm } from '@prisma/client';
import type { CookieOptions, Request, Response } from 'express';
import { config } from '../config';
import { randomToken, sha256 } from '../common/crypto';
import { clientIp } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';

export const CUSTOMER_COOKIE = 'sid';
export const STAFF_COOKIE = 'asid';

const CUSTOMER_TTL_MS = 30 * 24 * 3600 * 1000; // 30 days, sliding
const STAFF_TTL_MS = 12 * 3600 * 1000; // 12 hours absolute
const STAFF_IDLE_MS = 30 * 60 * 1000; // 30 minutes idle

/** Opaque, revocable sessions. Only a SHA-256 hash of the token is stored. */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  private cookieOptions(realm: SessionRealm, maxAge: number): CookieOptions {
    return {
      httpOnly: true,
      secure: config.isProd,
      sameSite: realm === 'STAFF' ? 'strict' : 'lax',
      path: '/',
      maxAge,
    };
  }

  async create(
    req: Request,
    res: Response,
    realm: SessionRealm,
    subject: { userId?: string; staffId?: string },
    verified = true,
  ) {
    const token = randomToken();
    const ttl = realm === 'STAFF' ? STAFF_TTL_MS : CUSTOMER_TTL_MS;
    await this.prisma.session.create({
      data: {
        tokenHash: sha256(token),
        realm,
        userId: subject.userId,
        staffId: subject.staffId,
        verified,
        expiresAt: new Date(Date.now() + ttl),
        ip: clientIp(req),
        userAgent: req.headers['user-agent']?.slice(0, 300),
      },
    });
    res.cookie(realm === 'STAFF' ? STAFF_COOKIE : CUSTOMER_COOKIE, token, this.cookieOptions(realm, ttl));
    return token;
  }

  async resolveCustomer(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!session || session.realm !== 'CUSTOMER' || !session.user || session.expiresAt < new Date()) return null;
    if (Date.now() - session.lastSeenAt.getTime() > 3600_000) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + CUSTOMER_TTL_MS) },
      });
    }
    return session;
  }

  async resolveStaff(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { staff: { include: { role: true } } },
    });
    if (!session || session.realm !== 'STAFF' || !session.staff || !session.staff.active) return null;
    const now = Date.now();
    if (session.expiresAt.getTime() < now || now - session.lastSeenAt.getTime() > STAFF_IDLE_MS) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    if (now - session.lastSeenAt.getTime() > 60_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return session;
  }

  async markVerified(sessionId: string) {
    await this.prisma.session.update({ where: { id: sessionId }, data: { verified: true, lastSeenAt: new Date() } });
  }

  async destroy(res: Response, realm: SessionRealm, token?: string) {
    if (token) await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    res.clearCookie(realm === 'STAFF' ? STAFF_COOKIE : CUSTOMER_COOKIE, { path: '/' });
  }

  async revokeAllForStaff(staffId: string) {
    await this.prisma.session.deleteMany({ where: { staffId } });
  }

  async purgeExpired() {
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
