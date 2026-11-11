import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';
import { AllowUnverified, Perm, StaffGuard } from '../auth/guards';
import { SessionService, STAFF_COOKIE } from '../auth/session.service';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import { hashPassword, newTotpSecret, verifyPassword, verifyTotp } from '../common/crypto';
import { AppError, badRequest } from '../common/errors';
import { PERMISSIONS } from '../common/permissions';
import { RateLimitService } from '../common/rate-limit';
import { AppRequest, clientIp } from '../common/request';
import { SettingsService } from '../common/settings.service';
import { email, password, zv } from '../common/zod';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const LOCK_MINUTES = 15;

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly limits: RateLimitService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(zv(z.object({ email, password: z.string().min(1).max(200) }))) body: { email: string; password: string },
  ) {
    const ip = clientIp(req);
    await this.limits.hit('loginIp', `staff:${ip}`);
    const staff = await this.prisma.staffUser.findUnique({ where: { email: body.email } });
    if (staff?.lockedUntil && staff.lockedUntil > new Date()) {
      const minutes = Math.ceil((staff.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppError(423, 'ACCOUNT_LOCKED', `This account is locked after too many failed attempts. Try again in ${minutes} minutes.`);
    }
    const ok = staff && staff.active ? await verifyPassword(staff.passwordHash, body.password) : false;
    if (!staff || !ok) {
      if (staff) {
        const failed = staff.failedLogins + 1;
        const lock = failed >= 5;
        await this.prisma.staffUser.update({
          where: { id: staff.id },
          data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined },
        });
        await this.audit.log({ staff, action: lock ? 'staff.locked' : 'staff.login_failed', entityType: 'StaffUser', entityId: staff.id, ip });
        if (lock) {
          const owners = await this.prisma.staffUser.findMany({ where: { role: { permissions: { has: '*' } }, active: true } });
          for (const o of new Set([staff.email, ...owners.map((x) => x.email)])) {
            await this.mail.queue(o, 'staffLocked', { email: staff.email, minutes: LOCK_MINUTES });
          }
        }
      }
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    await this.prisma.staffUser.update({ where: { id: staff.id }, data: { failedLogins: 0, lockedUntil: null } });
    const needsTwoFactor = config.STAFF_2FA_REQUIRED || staff.totpEnabled;
    const old = req.cookies?.[STAFF_COOKIE];
    if (old) await this.sessions.destroy(res, 'STAFF', old);
    await this.sessions.create(req, res, 'STAFF', { staffId: staff.id }, !needsTwoFactor);
    if (!needsTwoFactor) await this.finishLogin(staff.id, ip);
    return { next: !needsTwoFactor ? 'done' : staff.totpEnabled ? 'verify' : 'setup' };
  }

  @Get('2fa/setup')
  @UseGuards(StaffGuard)
  @AllowUnverified()
  async setup(@Req() req: AppRequest) {
    const staff = req.staff!;
    if (staff.totpEnabled) throw badRequest('TWO_FACTOR_ACTIVE', 'Two-factor authentication is already set up.');
    const secret = staff.totpSecret ?? newTotpSecret();
    if (!staff.totpSecret) await this.prisma.staffUser.update({ where: { id: staff.id }, data: { totpSecret: secret } });
    const store = (await this.settings.get('store')).name;
    const uri = `otpauth://totp/${encodeURIComponent(`${store} Admin`)}:${encodeURIComponent(staff.email)}?secret=${secret}&issuer=${encodeURIComponent(store)}&period=30&digits=6`;
    return { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  @AllowUnverified()
  async enable(@Req() req: AppRequest, @Body(zv(z.object({ code: z.string().trim() }))) body: { code: string }) {
    const staff = req.staff!;
    await this.limits.hit('otpVerify', `staff:${staff.id}`);
    if (!staff.totpSecret || !verifyTotp(staff.totpSecret, body.code)) throw badRequest('CODE_INVALID', 'That code is not right. Check your authenticator app and try again.');
    await this.prisma.staffUser.update({ where: { id: staff.id }, data: { totpEnabled: true } });
    await this.sessions.markVerified(req.staffSession!.id);
    await this.audit.log({ staff, action: 'staff.2fa_enabled', entityType: 'StaffUser', entityId: staff.id, ip: clientIp(req) });
    await this.finishLogin(staff.id, clientIp(req));
    return { next: 'done' };
  }

  @Post('2fa/verify')
  @HttpCode(200)
  @UseGuards(StaffGuard)
  @AllowUnverified()
  async verify(@Req() req: AppRequest, @Body(zv(z.object({ code: z.string().trim() }))) body: { code: string }) {
    const staff = req.staff!;
    await this.limits.hit('otpVerify', `staff:${staff.id}`);
    if (!staff.totpEnabled || !staff.totpSecret || !verifyTotp(staff.totpSecret, body.code)) {
      throw badRequest('CODE_INVALID', 'That code is not right. Check your authenticator app and try again.');
    }
    await this.sessions.markVerified(req.staffSession!.id);
    await this.finishLogin(staff.id, clientIp(req));
    return { next: 'done' };
  }

  @Get('me')
  @UseGuards(StaffGuard)
  @AllowUnverified()
  me(@Req() req: AppRequest) {
    const s = req.staff!;
    return {
      id: s.id,
      email: s.email,
      name: s.name,
      role: s.role.name,
      permissions: s.role.permissions.includes('*') ? Object.keys(PERMISSIONS) : s.role.permissions,
      verified: req.staffSession!.verified,
      totpEnabled: s.totpEnabled,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(res, 'STAFF', req.cookies?.[STAFF_COOKIE]);
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(StaffGuard)
  @Perm('any')
  async changePassword(@Req() req: AppRequest, @Body(zv(z.object({ current: z.string(), password }))) body: { current: string; password: string }) {
    const staff = req.staff!;
    if (!(await verifyPassword(staff.passwordHash, body.current))) throw badRequest('INVALID_CREDENTIALS', 'Your current password is not right.');
    await this.prisma.staffUser.update({ where: { id: staff.id }, data: { passwordHash: await hashPassword(body.password) } });
    await this.prisma.session.deleteMany({ where: { staffId: staff.id, id: { not: req.staffSession!.id } } });
    await this.audit.log({ staff, action: 'staff.password_changed', entityType: 'StaffUser', entityId: staff.id, ip: clientIp(req) });
  }

  private async finishLogin(staffId: string, ip: string) {
    const staff = await this.prisma.staffUser.update({ where: { id: staffId }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ staff, action: 'staff.login', entityType: 'StaffUser', entityId: staffId, ip });
  }
}
