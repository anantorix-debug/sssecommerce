import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { email, zv } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';
import { ContentService } from './content.service';

@Controller('store')
@UseGuards(RateLimitGuard)
export class StoreContentController {
  constructor(
    private readonly content: ContentService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('home')
  @RateLimit('catalog')
  home() {
    return this.content.home();
  }

  @Get('settings')
  @RateLimit('catalog')
  settings() {
    return this.content.publicSettings();
  }

  @Get('pages/:slug')
  @RateLimit('catalog')
  page(@Param('slug') slug: string) {
    return this.content.page(slug);
  }

  @Get('pages')
  @RateLimit('catalog')
  pages(@Query('type') type: string) {
    return this.content.pagesOfType(type === 'STATIC' ? 'STATIC' : type === 'FAQ' ? 'FAQ' : 'POLICY');
  }

  @Get('guides')
  @RateLimit('catalog')
  guides() {
    return this.content.guides();
  }

  @Get('sitemap')
  sitemap() {
    return this.content.sitemap();
  }

  @Get('redirects/resolve')
  async redirect(@Query('path') path: string) {
    const r = path ? await this.prisma.redirect.findUnique({ where: { fromPath: path } }) : null;
    return r ? { to: r.toPath, code: r.code } : { to: null };
  }

  @Post('contact')
  @HttpCode(202)
  @RateLimit('contact')
  async contact(
    @Body(zv(z.object({
      name: z.string().trim().min(2).max(100),
      email,
      phone: z.string().trim().max(20).optional().nullable(),
      orderNumber: z.string().trim().max(40).optional().nullable(),
      message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters).').max(3000),
    })))
    body: { name: string; email: string; phone?: string | null; orderNumber?: string | null; message: string },
  ) {
    await this.prisma.contactMessage.create({ data: body });
    return { received: true };
  }

  @Post('newsletter')
  @HttpCode(202)
  @RateLimit('newsletter')
  async newsletter(@Body(zv(z.object({ email }))) body: { email: string }) {
    await this.prisma.newsletterSubscriber.upsert({ where: { email: body.email }, update: {}, create: { email: body.email } });
    return { subscribed: true };
  }
}
