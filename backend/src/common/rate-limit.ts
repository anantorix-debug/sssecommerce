import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { safeEqual } from './crypto';
import { tooManyRequests } from './errors';
import { AppRequest, clientIp } from './request';

/**
 * Fixed-window rate limiting with counters in PostgreSQL, so limits are shared by
 * every API process and survive restarts. All limits are defined in RATE_LIMITS.
 */
export const RATE_LIMITS = {
  otpRequestEmail: { limit: 3, window: 600 },
  otpRequestIp: { limit: 10, window: 3600 },
  otpVerify: { limit: 5, window: 600 },
  loginFailAccount: { limit: 5, window: 900 },
  loginIp: { limit: 20, window: 900 },
  register: { limit: 5, window: 3600 },
  forgotPassword: { limit: 3, window: 3600 },
  staffLoginFail: { limit: 5, window: 900 },
  placeOrder: { limit: 10, window: 60 },
  verifyPayment: { limit: 10, window: 60 },
  cart: { limit: 60, window: 60 },
  coupon: { limit: 10, window: 600 },
  search: { limit: 60, window: 60 },
  pincode: { limit: 30, window: 60 },
  track: { limit: 10, window: 600 },
  contact: { limit: 5, window: 3600 },
  newsletter: { limit: 5, window: 3600 },
  reviewSubmit: { limit: 5, window: 86400 },
  returnRequest: { limit: 5, window: 86400 },
  slotBooking: { limit: 10, window: 3600 },
  customerUpload: { limit: 20, window: 3600 },
  catalog: { limit: 300, window: 60 },
  admin: { limit: 600, window: 60 },
  adminUpload: { limit: 60, window: 3600 },
  adminExport: { limit: 5, window: 3600 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;
export type RateLimitScope = 'ip' | 'session' | 'user' | 'staff';

@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  /** Count one hit; throws 429 with Retry-After once the limit is passed. */
  async hit(name: RateLimitName, subject: string) {
    const { limit, window } = RATE_LIMITS[name];
    const key = `${name}:${subject}`;
    const rows = await this.prisma.$queryRaw<{ hits: number; expiresAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "hits", "expiresAt")
      VALUES (${key}, 1, now() + make_interval(secs => ${window}))
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE WHEN "RateLimit"."expiresAt" < now() THEN 1 ELSE "RateLimit"."hits" + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < now()
          THEN now() + make_interval(secs => ${window}) ELSE "RateLimit"."expiresAt" END
      RETURNING "hits", "expiresAt"`;
    const row = rows[0];
    if (row.hits > limit) {
      throw tooManyRequests(Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)));
    }
    return { remaining: limit - row.hits };
  }

  /** Throws if the counter is already at the limit, without counting a hit (used for failed-login limits). */
  async assertBelow(name: RateLimitName, subject: string) {
    const { limit } = RATE_LIMITS[name];
    const row = await this.prisma.rateLimit.findUnique({ where: { key: `${name}:${subject}` } });
    if (row && row.expiresAt > new Date() && row.hits >= limit) {
      throw tooManyRequests(Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)));
    }
  }

  async reset(name: RateLimitName, subject: string) {
    await this.prisma.rateLimit.deleteMany({ where: { key: `${name}:${subject}` } });
  }

  async purgeExpired() {
    await this.prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}

const RATE_LIMIT_KEY = 'rate-limit';

/** Applies a named limit to a route, counted per IP (default), session, user or staff member. */
export const RateLimit = (name: RateLimitName, scope: RateLimitScope = 'ip') =>
  SetMetadata(RATE_LIMIT_KEY, { name, scope });

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: RateLimitService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const meta = this.reflector.getAllAndOverride<{ name: RateLimitName; scope: RateLimitScope }>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!meta) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    // Server-side rendering calls from the storefront carry the shared secret and are not visitor traffic.
    const internal = req.headers['x-internal-secret'];
    if (typeof internal === 'string' && safeEqual(internal, config.INTERNAL_SECRET)) return true;
    let subject = clientIp(req);
    if (meta.scope === 'session') subject = req.cookies?.cart || req.cookies?.sid || subject;
    if (meta.scope === 'user') subject = req.user?.id ?? subject;
    if (meta.scope === 'staff') subject = req.staff?.id ?? subject;
    await this.limits.hit(meta.name, subject);
    return true;
  }
}
