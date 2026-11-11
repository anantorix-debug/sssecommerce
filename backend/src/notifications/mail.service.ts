import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';
import { SettingsService } from '../common/settings.service';
import { Db, PrismaService } from '../prisma/prisma.service';
import { templates, TemplateName } from './templates';

type TemplateData<T extends TemplateName> = Parameters<(typeof templates)[T]>[1];

/**
 * Emails are written to an outbox table in the same transaction as the change that
 * triggers them, then sent by a background job. Nothing is lost if SMTP is down.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private transporter?: Transporter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {
    if (config.mailEnabled) {
      this.transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
      });
    }
  }

  async queue<T extends TemplateName>(to: string, template: T, data: TemplateData<T>, db: Db = this.prisma) {
    const store = (await this.settings.get('store')).name;
    const render = templates[template] as (s: string, d: TemplateData<T>) => { subject: string; html: string; text: string };
    const { subject, html, text } = render(store, data);
    await db.emailOutbox.create({ data: { to, subject, html, text, template } });
  }

  /** Sends due emails. Retries with backoff up to 6 attempts. */
  async flush(batch = 20) {
    const due = await this.prisma.emailOutbox.findMany({
      where: { status: 'PENDING', sendAfter: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: batch,
    });
    for (const mail of due) {
      try {
        if (this.transporter) {
          await this.transporter.sendMail({ from: config.MAIL_FROM, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
        } else {
          await this.writeDevMail(mail.id, mail.to, mail.subject, mail.html, mail.text);
        }
        await this.prisma.emailOutbox.update({ where: { id: mail.id }, data: { status: 'SENT', sentAt: new Date(), attempts: { increment: 1 } } });
      } catch (err) {
        const attempts = mail.attempts + 1;
        await this.prisma.emailOutbox.update({
          where: { id: mail.id },
          data: {
            attempts,
            lastError: (err as Error).message.slice(0, 500),
            status: attempts >= 6 ? 'FAILED' : 'PENDING',
            sendAfter: new Date(Date.now() + 2 ** attempts * 30_000),
          },
        });
        this.logger.warn(`Email to ${mail.to} failed (attempt ${attempts}): ${(err as Error).message}`);
      }
    }
  }

  /** Development mailbox: emails land in storage/mail/ and the subject is logged. */
  private async writeDevMail(id: string, to: string, subject: string, html: string, text: string) {
    const dir = join(config.mediaRoot, 'mail');
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(join(dir, `${stamp}-${id.slice(0, 8)}.html`), html);
    this.logger.log(`[dev mail] to ${to}: ${subject}`);
    if (/code/i.test(subject)) this.logger.log(`[dev mail] ${text}`);
  }
}
