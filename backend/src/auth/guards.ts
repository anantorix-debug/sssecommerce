import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NestMiddleware,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppError, forbidden, unauthorized } from '../common/errors';
import { hasPermission, Permission } from '../common/permissions';
import { AppRequest } from '../common/request';
import { CUSTOMER_COOKIE, SessionService, STAFF_COOKIE } from './session.service';

/**
 * Runs on every request: assigns a request id, enforces the CSRF header on writes,
 * and attaches the signed-in customer and staff member when their cookies are valid.
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly sessions: SessionService) {}

  async use(req: AppRequest, res: Response, next: NextFunction) {
    req.id = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', req.id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // originalUrl, not path: inside mounted middleware req.path is relative to the mount point.
    const url = req.originalUrl.split('?')[0];
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const isWebhook = url.includes('/webhooks/');
    // Browsers cannot add custom headers to cross-site form posts, so this blocks CSRF.
    if (isWrite && !isWebhook && req.headers['x-requested-with'] !== 'fetch') {
      return next(new AppError(403, 'CSRF_HEADER_MISSING', 'This request is missing a required header.'));
    }

    try {
      const sid = req.cookies?.[CUSTOMER_COOKIE];
      if (sid) {
        const session = await this.sessions.resolveCustomer(sid);
        if (session) {
          req.user = session.user!;
          req.customerSession = session;
        }
      }
      const asid = req.cookies?.[STAFF_COOKIE];
      if (asid && url.startsWith('/v1/admin/')) {
        const session = await this.sessions.resolveStaff(asid);
        if (session) {
          req.staff = session.staff!;
          req.staffSession = session;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  }
}

@Injectable()
export class CustomerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    if (!ctx.switchToHttp().getRequest<AppRequest>().user) throw unauthorized();
    return true;
  }
}

const PERM_KEY = 'staff-permission';
const ALLOW_UNVERIFIED_KEY = 'staff-allow-unverified';

/** Requires a signed-in, 2FA-verified staff member holding the permission. */
export const Perm = (permission: Permission | 'any') => SetMetadata(PERM_KEY, permission);
/** For the two-factor setup and verify endpoints, which run before the session is verified. */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const permission = this.reflector.getAllAndOverride<string>(PERM_KEY, targets);
    const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_KEY, targets);
    if (!req.staff || !req.staffSession) throw new AppError(401, 'STAFF_UNAUTHENTICATED', 'Please sign in to the admin.');
    if (!req.staffSession.verified && !allowUnverified) {
      throw new AppError(401, 'TWO_FACTOR_REQUIRED', 'Enter your two-factor code to continue.');
    }
    if (permission && permission !== 'any' && !hasPermission(req.staff.role.permissions, permission)) {
      throw forbidden();
    }
    return true;
  }
}
