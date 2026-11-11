import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { existsSync } from 'node:fs';
import { readdir, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
import { RateLimitService } from '../common/rate-limit';
import { SessionService } from '../auth/session.service';
import { SchedulingService } from '../delivery/scheduling.service';
import { MailService } from '../notifications/mail.service';
import { OrderService } from '../orders/order.service';
import { RazorpayService } from '../payments/razorpay.service';
import { PrismaService } from '../prisma/prisma.service';

/** Scheduled work. Runs only where RUN_JOBS=true (one process in production). */
@Injectable()
export class JobsService {
  private readonly logger = new Logger('Jobs');
  private busy = new Set<string>();
  private diskAlert = { level: 0, at: 0 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly orders: OrderService,
    private readonly razorpay: RazorpayService,
    private readonly scheduling: SchedulingService,
    private readonly limits: RateLimitService,
    private readonly sessions: SessionService,
  ) {}

  /** Prevents a slow run from overlapping the next one. */
  private async once(name: string, fn: () => Promise<void>) {
    if (!config.RUN_JOBS || this.busy.has(name)) return;
    this.busy.add(name);
    try {
      await fn();
    } catch (err) {
      this.logger.error(`${name} failed: ${(err as Error).message}`);
    } finally {
      this.busy.delete(name);
    }
  }

  @Interval(10_000)
  sendEmails() {
    return this.once('emails', () => this.mail.flush());
  }

  /** Online orders whose stock hold ran out. Checks Razorpay first, so a late payment is never lost. */
  @Cron(CronExpression.EVERY_MINUTE)
  expireUnpaid() {
    return this.once('expire', async () => {
      const due = await this.prisma.order.findMany({
        where: { status: 'PENDING_PAYMENT', reservationExpiresAt: { lt: new Date() } },
        include: { payments: true },
        take: 50,
      });
      for (const order of due) {
        if (await this.reconcileOne(order.id)) continue;
        await this.orders.expire(order.id);
        this.logger.log(`Expired unpaid order ${order.orderNumber}; stock released`);
      }
    });
  }

  /** Catches payments whose callback and webhook both went missing. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  reconcile() {
    return this.once('reconcile', async () => {
      if (!this.razorpay.enabled) return;
      const pending = await this.prisma.order.findMany({
        where: { status: 'PENDING_PAYMENT', placedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
        select: { id: true },
        take: 50,
      });
      for (const o of pending) await this.reconcileOne(o.id);
    });
  }

  private async reconcileOne(orderId: string) {
    if (!this.razorpay.enabled) return false;
    const payment = await this.prisma.payment.findFirst({ where: { orderId, method: 'ONLINE', providerOrderId: { not: null } } });
    if (!payment?.providerOrderId) return false;
    try {
      const attempts = await this.razorpay.orderPayments(payment.providerOrderId);
      const captured = attempts.find((p) => p.status === 'captured');
      if (!captured) return false;
      await this.orders.confirmPaid(orderId, { providerPaymentId: captured.id, amount: captured.amount, method: captured.method, raw: captured });
      this.logger.log(`Reconciled payment ${captured.id}`);
      return true;
    } catch (err) {
      this.logger.warn(`Reconcile check failed: ${(err as Error).message}`);
      return false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  housekeeping() {
    return this.once('housekeeping', async () => {
      await this.limits.purgeExpired();
      await this.sessions.purgeExpired();
      await this.prisma.otpChallenge.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } });
      await this.checkDisk();
    });
  }

  /** Emails the owners when the media disk passes 70% or 85%; repeats at most once a day per level. */
  private async checkDisk() {
    const fs = await statfs(config.mediaRoot);
    const percent = Math.round((1 - fs.bavail / fs.blocks) * 100);
    const level = percent >= 85 ? 85 : percent >= 70 ? 70 : 0;
    if (!level) {
      this.diskAlert = { level: 0, at: 0 };
      return;
    }
    if (level <= this.diskAlert.level && Date.now() - this.diskAlert.at < 86_400_000) return;
    this.diskAlert = { level, at: Date.now() };
    const freeGb = Math.round(((fs.bavail * fs.bsize) / 1024 ** 3) * 10) / 10;
    const owners = await this.prisma.staffUser.findMany({ where: { active: true, role: { name: 'Owner' } }, select: { email: true } });
    for (const o of owners) await this.mail.queue(o.email, 'diskSpace', { percent, freeGb, level });
    this.logger.warn(`Disk ${percent}% full (${freeGb} GB free)`);
  }

  @Cron('0 15 2 * * *')
  nightly() {
    return this.once('nightly', async () => {
      const created = await this.scheduling.generate();
      if (created) this.logger.log(`Opened ${created} new delivery slots`);
      await this.purgeTrash();
    });
  }

  /** Deleted media is kept in trash/ for 30 days, then removed for good. */
  private async purgeTrash() {
    const root = join(config.mediaRoot, 'trash');
    if (!existsSync(root)) return;
    const cutoff = Date.now() - 30 * 86_400_000;
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if ((await stat(full)).mtimeMs < cutoff) await rm(full);
      }
    };
    await walk(root);
  }

  /** Runs once at startup so slots exist on a fresh install. */
  async bootstrap() {
    if (!config.RUN_JOBS) return;
    await this.scheduling.generate().catch(() => undefined);
  }
}
