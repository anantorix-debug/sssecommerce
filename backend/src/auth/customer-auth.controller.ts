import { Body, Controller, Get, HttpCode, Logger, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { CartService } from '../cart/cart.service';
import { config } from '../config';
import { hashPassword, otpCode, randomToken, safeEqual, sha256, verifyPassword } from '../common/crypto';
import { AppError, badRequest, conflict } from '../common/errors';
import { RateLimit, RateLimitGuard, RateLimitService } from '../common/rate-limit';
import { AppRequest, clientIp } from '../common/request';
import { email, password, zv } from '../common/zod';
import { MailService } from '../notifications/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CUSTOMER_COOKIE, SessionService } from './session.service';

const OTP_TTL_MS = 10 * 60 * 1000;
const GOOGLE_COOKIE = 'g_oauth';

const googleClient = () =>
  new OAuth2Client({ clientId: config.GOOGLE_CLIENT_ID, clientSecret: config.GOOGLE_CLIENT_SECRET, redirectUri: config.googleRedirectUri });

/** Only same-site paths, so the return address can't be used as an open redirect. */
const safeNext = (n?: string) => (n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/');

export const publicUser = (u: { id: string; email: string; name: string | null; phone: string | null; marketingOptIn: boolean; passwordHash?: string | null; googleId?: string | null }) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  phone: u.phone,
  marketingOptIn: u.marketingOptIn,
  hasPassword: Boolean(u.passwordHash),
  googleLinked: Boolean(u.googleId),
});

@Controller('store/auth')
@UseGuards(RateLimitGuard)
export class CustomerAuthController {
  private readonly logger = new Logger('CustomerAuth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly limits: RateLimitService,
    private readonly mail: MailService,
    private readonly carts: CartService,
  ) {}

  @Get('session')
  session(@Req() req: AppRequest) {
    return { user: req.user ? publicUser(req.user) : null, googleClientId: config.googleEnabled ? config.GOOGLE_CLIENT_ID : null };
  }

  @Post('otp/request')
  @HttpCode(202)
  async requestOtp(@Req() req: AppRequest, @Body(zv(z.object({ email }))) body: { email: string }) {
    await this.limits.hit('otpRequestIp', clientIp(req));
    await this.limits.hit('otpRequestEmail', body.email);
    await this.issueOtp(body.email, 'LOGIN');
    return { sent: true };
  }

  @Post('otp/verify')
  async verifyOtp(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(zv(z.object({ email, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.') }))) body: { email: string; code: string },
  ) {
    await this.limits.hit('otpVerify', body.email);
    await this.consumeOtp(body.email, 'LOGIN', body.code);
    const user = await this.prisma.user.upsert({
      where: { email: body.email },
      update: { emailVerifiedAt: new Date() },
      create: { email: body.email, emailVerifiedAt: new Date() },
    });
    await this.signIn(req, res, user.id);
    return { user: publicUser(user) };
  }

  @Post('register')
  @RateLimit('register')
  async register(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(zv(z.object({ name: z.string().trim().min(2).max(100), email, password, marketingOptIn: z.boolean().optional() })))
    body: { name: string; email: string; password: string; marketingOptIn?: boolean },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (existing?.passwordHash) throw conflict('ACCOUNT_EXISTS', 'An account with this email already exists. Sign in instead.');
    const passwordHash = await hashPassword(body.password);
    const user = existing
      ? await this.prisma.user.update({ where: { id: existing.id }, data: { name: existing.name ?? body.name, passwordHash } })
      : await this.prisma.user.create({ data: { email: body.email, name: body.name, passwordHash, marketingOptIn: body.marketingOptIn ?? false } });
    await this.signIn(req, res, user.id);
    return { user: publicUser(user) };
  }

  @Post('login')
  async login(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(zv(z.object({ email, password: z.string().min(1).max(200) }))) body: { email: string; password: string },
  ) {
    await this.limits.hit('loginIp', clientIp(req));
    await this.limits.assertBelow('loginFailAccount', body.email);
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, body.password) : false;
    if (!user || !ok) {
      await this.limits.hit('loginFailAccount', body.email).catch(() => undefined);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }
    await this.limits.reset('loginFailAccount', body.email);
    await this.signIn(req, res, user.id);
    return { user: publicUser(user) };
  }

  /**
   * "Continue with Google", step 1: remember a one-time state, PKCE verifier and nonce in a
   * short-lived httpOnly cookie, then send the shopper to Google's account chooser.
   */
  @Get('google/start')
  @RateLimit('loginIp')
  async googleStart(@Res() res: Response, @Query(zv(z.object({ next: z.string().max(500).optional() }))) q: { next?: string }) {
    if (!config.googleEnabled) return res.redirect(303, `${config.STOREFRONT_URL}/login?error=google_disabled`);
    const client = googleClient();
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    const state = randomToken(24);
    const nonce = randomToken(16);
    res.cookie(GOOGLE_COOKIE, JSON.stringify({ state, nonce, verifier: codeVerifier, next: safeNext(q.next) }), {
      httpOnly: true,
      secure: config.isProd,
      sameSite: 'lax', // sent on the top-level return from accounts.google.com
      path: '/',
      maxAge: 10 * 60 * 1000,
    });
    const url = client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
      prompt: 'select_account',
      access_type: 'online',
    });
    return res.redirect(302, url);
  }

  /** Step 2: Google returns here. Exchange the code (with the client secret), verify the ID token, sign in. */
  @Get('google/callback')
  @RateLimit('loginIp')
  async googleCallback(
    @Req() req: AppRequest,
    @Res() res: Response,
    @Query(zv(z.object({ code: z.string().max(2000).optional(), state: z.string().max(200).optional(), error: z.string().max(200).optional() })))
    q: { code?: string; state?: string; error?: string },
  ) {
    let saved: { state: string; nonce: string; verifier: string; next: string } | null = null;
    try {
      saved = JSON.parse(req.cookies?.[GOOGLE_COOKIE] ?? 'null');
    } catch {}
    res.clearCookie(GOOGLE_COOKIE, { path: '/' });
    const fail = (reason: string) =>
      res.redirect(303, `${config.STOREFRONT_URL}/login?error=${reason}${saved?.next && saved.next !== '/' ? `&next=${encodeURIComponent(saved.next)}` : ''}`);

    if (q.error) return fail(q.error === 'access_denied' ? 'google_cancelled' : 'google_failed');
    if (!config.googleEnabled) return fail('google_disabled');
    if (!saved || !q.code || !q.state || !safeEqual(q.state, saved.state)) return fail('google_expired');

    try {
      const client = googleClient();
      const { tokens } = await client.getToken({ code: q.code, codeVerifier: saved.verifier });
      if (!tokens.id_token) return fail('google_failed');
      const payload = (await client.verifyIdToken({ idToken: tokens.id_token, audience: config.GOOGLE_CLIENT_ID })).getPayload();
      if (!payload || payload.nonce !== saved.nonce) return fail('google_failed');
      if (!payload.email || !payload.email_verified || !payload.sub) return fail('google_unverified');

      const mail = payload.email.toLowerCase();
      // Same Google account → same customer; otherwise link to the existing account with this verified email, or create one.
      const byGoogle = await this.prisma.user.findUnique({ where: { googleId: payload.sub } });
      const existing = byGoogle ?? (await this.prisma.user.findUnique({ where: { email: mail } }));
      const user = existing
        ? await this.prisma.user.update({
            where: { id: existing.id },
            data: { googleId: payload.sub, emailVerifiedAt: existing.emailVerifiedAt ?? new Date(), ...(existing.name ? {} : { name: payload.name ?? null }) },
          })
        : await this.prisma.user.create({ data: { email: mail, name: payload.name ?? null, googleId: payload.sub, emailVerifiedAt: new Date() } });

      await this.signIn(req, res, user.id);
      return res.redirect(303, `${config.STOREFRONT_URL}${saved.next}`);
    } catch (err) {
      this.logger.warn(`Google sign-in failed: ${(err as Error).message}`);
      return fail('google_failed');
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(res, 'CUSTOMER', req.cookies?.[CUSTOMER_COOKIE]);
  }

  @Post('password/forgot')
  @HttpCode(202)
  async forgot(@Body(zv(z.object({ email }))) body: { email: string }) {
    await this.limits.hit('forgotPassword', body.email);
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    // Same response whether or not the account exists.
    if (user) await this.issueOtp(body.email, 'RESET');
    return { sent: true };
  }

  @Post('password/reset')
  async reset(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(zv(z.object({ email, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'), password })))
    body: { email: string; code: string; password: string },
  ) {
    await this.limits.hit('otpVerify', `reset:${body.email}`);
    await this.consumeOtp(body.email, 'RESET', body.code);
    const user = await this.prisma.user.update({
      where: { email: body.email },
      data: { passwordHash: await hashPassword(body.password), emailVerifiedAt: new Date() },
    });
    await this.prisma.session.deleteMany({ where: { userId: user.id } });
    await this.signIn(req, res, user.id);
    return { user: publicUser(user) };
  }

  private async issueOtp(mail: string, purpose: 'LOGIN' | 'RESET') {
    const code = otpCode();
    await this.prisma.$transaction(async (tx) => {
      await tx.otpChallenge.updateMany({ where: { email: mail, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
      await tx.otpChallenge.create({ data: { email: mail, purpose, codeHash: sha256(`${mail}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });
      await this.mail.queue(mail, 'otp', { code, purpose }, tx);
    });
  }

  private async consumeOtp(mail: string, purpose: 'LOGIN' | 'RESET', code: string) {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { email: mail, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) throw badRequest('OTP_EXPIRED', 'This code has expired. Request a new one.');
    if (challenge.attempts >= 5) throw badRequest('OTP_LOCKED', 'Too many wrong codes. Request a new one.');
    if (challenge.codeHash !== sha256(`${mail}:${code}`)) {
      await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw badRequest('OTP_INVALID', 'That code is not right. Check the email and try again.');
    }
    await this.prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  }

  private async signIn(req: AppRequest, res: Response, userId: string) {
    const old = req.cookies?.[CUSTOMER_COOKIE];
    if (old) await this.sessions.destroy(res, 'CUSTOMER', old);
    await this.sessions.create(req, res, 'CUSTOMER', { userId });
    await this.carts.mergeOnLogin(req, res, userId);
  }
}
