import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaKind, Prisma } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { Perm, StaffGuard } from '../auth/guards';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import { badRequest, notFound } from '../common/errors';
import { RateLimit, RateLimitGuard, RateLimitService } from '../common/rate-limit';
import { AppRequest, clientIp } from '../common/request';
import { id, pincode, zv } from '../common/zod';
import { mediaUrl } from '../catalog/cards';
import { RevalidateService } from '../content/revalidate.service';
import { InventoryService } from '../inventory/inventory.service';
import { MediaService, UploadFile } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('admin')
@UseGuards(StaffGuard, RateLimitGuard)
@RateLimit('admin', 'staff')
export class AdminMediaInventoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
    private readonly limits: RateLimitService,
    private readonly revalidate: RevalidateService,
  ) {}

  // ── Media library ──
  @Get('media')
  @Perm('catalog.read')
  async list(@Query(zv(z.object({ kind: z.enum(['IMAGE', 'VIDEO', 'MODEL_3D']).optional(), q: z.string().max(100).optional(), page: z.coerce.number().int().min(1).default(1) }))) q: { kind?: MediaKind; q?: string; page: number }) {
    const where: Prisma.MediaAssetWhereInput = {
      deletedAt: null,
      visibility: 'PUBLIC',
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.q ? { OR: [{ altText: { contains: q.q, mode: 'insensitive' } }, { storageKey: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.mediaAsset.count({ where }),
      this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 48, take: 48, include: { _count: { select: { products: true } } } }),
    ]);
    return {
      total,
      page: q.page,
      pageCount: Math.max(1, Math.ceil(total / 48)),
      items: rows.map((m) => ({ ...m, url: mediaUrl(m.storageKey), usedBy: m._count.products })),
    };
  }

  @Post('media')
  @Perm('media.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024, files: 1 } }))
  async upload(@Req() req: AppRequest, @UploadedFile() file: UploadFile | undefined, @Query('alt') alt?: string) {
    await this.limits.hit('adminUpload', req.staff!.id);
    if (!file) throw badRequest('FILE_REQUIRED', 'Choose a file to upload.');
    const asset = await this.media.store(file, { alt: alt?.slice(0, 300), allowVideo: true, allowModel: true });
    await this.audit.log({ staff: req.staff, action: 'media.upload', entityType: 'MediaAsset', entityId: asset.id, after: { key: asset.storageKey, kind: asset.kind }, ip: clientIp(req) });
    const variants = asset.kind === 'MODEL_3D' ? await this.media.modelVariants(asset.storageKey) : [];
    return { ...asset, url: mediaUrl(asset.storageKey), modelVariants: variants };
  }

  @Get('media/:id/model-variants')
  @Perm('catalog.read')
  async modelVariants(@Param('id', zv(id)) mediaId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset || asset.kind !== 'MODEL_3D') throw notFound('3D model');
    return { variants: await this.media.modelVariants(asset.storageKey) };
  }

  @Patch('media/:id')
  @Perm('media.write')
  async update(
    @Req() req: AppRequest,
    @Param('id', zv(id)) mediaId: string,
    @Body(zv(z.object({ altText: z.string().trim().max(300).optional(), focalX: z.number().min(0).max(1).optional(), focalY: z.number().min(0).max(1).optional() }))) body: { altText?: string; focalX?: number; focalY?: number },
  ) {
    const m = await this.prisma.mediaAsset.update({ where: { id: mediaId }, data: body });
    await this.audit.log({ staff: req.staff, action: 'media.update', entityType: 'MediaAsset', entityId: m.id, after: body, ip: clientIp(req) });
    this.revalidate.tags(['products', 'home']);
    return { ...m, url: mediaUrl(m.storageKey) };
  }

  @Delete('media/:id')
  @HttpCode(204)
  @Perm('media.write')
  async remove(@Req() req: AppRequest, @Param('id', zv(id)) mediaId: string) {
    const used = await this.prisma.productMedia.count({ where: { mediaId } });
    if (used) throw badRequest('MEDIA_IN_USE', `This file is used by ${used} product${used > 1 ? 's' : ''}. Remove it from them first.`);
    await this.media.remove(mediaId);
    await this.audit.log({ staff: req.staff, action: 'media.delete', entityType: 'MediaAsset', entityId: mediaId, ip: clientIp(req) });
  }

  /** Private files (return photos, exports, invoices) for staff. Nginx streams them in production. */
  @Get('files/*key')
  @Perm('orders.read')
  async privateFile(@Req() req: AppRequest, @Res() res: Response, @Param('key') key: string | string[]) {
    const path = Array.isArray(key) ? key.join('/') : key;
    await this.audit.log({ staff: req.staff, action: 'file.view', entityType: 'File', entityId: path, ip: clientIp(req) });
    if (config.NGINX_ACCEL) {
      res.setHeader('X-Accel-Redirect', `/_private/${path}`);
      return res.end();
    }
    const data = await this.media.readPrivate(path);
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(path.split('.').pop() ?? 'bin').send(data);
  }

  // ── Inventory ──
  @Get('inventory')
  @Perm('inventory.read')
  async stock(@Query(zv(z.object({ q: z.string().max(100).optional(), low: z.enum(['1']).optional(), page: z.coerce.number().int().min(1).default(1) }))) q: { q?: string; low?: '1'; page: number }) {
    const where: Prisma.VariantWhereInput = {
      ...(q.q ? { OR: [{ sku: { contains: q.q, mode: 'insensitive' } }, { product: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const rows = await this.prisma.variant.findMany({
      where,
      orderBy: [{ product: { name: 'asc' } }, { title: 'asc' }],
      include: { product: { select: { name: true, status: true, id: true } }, inventory: { include: { location: { select: { name: true } } } } },
    });
    let items = rows.map((v) => {
      const onHand = v.inventory.reduce((s, i) => s + i.onHand, 0);
      const reserved = v.inventory.reduce((s, i) => s + i.reserved, 0);
      const threshold = v.inventory[0]?.lowStockThreshold ?? 3;
      return {
        variantId: v.id,
        productId: v.product.id,
        product: v.product.name,
        productStatus: v.product.status,
        sku: v.sku,
        title: v.title,
        active: v.active,
        onHand,
        reserved,
        available: onHand - reserved,
        low: onHand - reserved <= threshold,
        threshold,
        locations: v.inventory.map((i) => ({ locationId: i.locationId, name: i.location.name, onHand: i.onHand, reserved: i.reserved })),
      };
    });
    if (q.low) items = items.filter((i) => i.low && i.active);
    const total = items.length;
    return { total, page: q.page, pageCount: Math.max(1, Math.ceil(total / 50)), items: items.slice((q.page - 1) * 50, q.page * 50) };
  }

  @Post('stock-movements')
  @Perm('inventory.write')
  async move(
    @Req() req: AppRequest,
    @Body(zv(z.object({
      variantId: id,
      locationId: id,
      type: z.enum(['RECEIPT', 'ADJUSTMENT']),
      quantity: z.number().int().min(-10000).max(10000).refine((n) => n !== 0, 'Quantity cannot be zero.'),
      reason: z.string().trim().min(3, 'Give a reason for this change.').max(200),
      reference: z.string().trim().max(100).optional(),
    }).refine((m) => m.type !== 'RECEIPT' || m.quantity > 0, { message: 'A receipt adds stock, so the quantity must be positive.', path: ['quantity'] })))
    body: { variantId: string; locationId: string; type: 'RECEIPT' | 'ADJUSTMENT'; quantity: number; reason: string; reference?: string },
  ) {
    const movement = await this.prisma.$transaction(async (tx) => {
      const m = await this.inventory.move(tx, { ...body, actorId: req.staff!.id });
      await this.audit.log({ staff: req.staff, action: `stock.${body.type.toLowerCase()}`, entityType: 'Variant', entityId: body.variantId, after: body, ip: clientIp(req) }, tx);
      return m;
    });
    const v = await this.prisma.variant.findUnique({ where: { id: body.variantId }, include: { product: { select: { slug: true } } } });
    if (v) this.revalidate.tags([`product:${v.product.slug}`]);
    return movement;
  }

  @Get('stock-movements')
  @Perm('inventory.read')
  async movements(@Query(zv(z.object({ variantId: id.optional(), page: z.coerce.number().int().min(1).default(1) }))) q: { variantId?: string; page: number }) {
    const where = q.variantId ? { variantId: q.variantId } : {};
    const [total, rows] = await Promise.all([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * 50, take: 50 }),
    ]);
    const variants = await this.prisma.variant.findMany({ where: { id: { in: rows.map((r) => r.variantId) } }, include: { product: { select: { name: true } } } });
    const locations = await this.prisma.location.findMany();
    const staff = await this.prisma.staffUser.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
    return {
      total,
      page: q.page,
      pageCount: Math.max(1, Math.ceil(total / 50)),
      items: rows.map((r) => {
        const v = variants.find((x) => x.id === r.variantId);
        return { ...r, product: v?.product.name, sku: v?.sku, variant: v?.title, location: locations.find((l) => l.id === r.locationId)?.name, actor: staff.find((s) => s.id === r.actorId)?.name ?? (r.actorId ? 'Staff' : 'System') };
      }),
    };
  }

  // ── Locations ──
  @Get('locations')
  @Perm('inventory.read')
  locations() {
    return this.prisma.location.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { pincodes: true, inventory: true } } } });
  }

  @Post('locations')
  @Perm('inventory.write')
  async createLocation(@Req() req: AppRequest, @Body(zv(z.object({ name: z.string().trim().min(2).max(80), city: z.string().trim().min(2).max(80), isActive: z.boolean().default(true) }))) body: { name: string; city: string; isActive: boolean }) {
    const l = await this.prisma.location.create({ data: body });
    await this.audit.log({ staff: req.staff, action: 'location.create', entityType: 'Location', entityId: l.id, after: body, ip: clientIp(req) });
    return l;
  }

  @Patch('locations/:id')
  @Perm('inventory.write')
  async updateLocation(@Req() req: AppRequest, @Param('id', zv(id)) locationId: string, @Body(zv(z.object({ name: z.string().trim().min(2).max(80).optional(), city: z.string().trim().min(2).max(80).optional(), isActive: z.boolean().optional() }))) body: { name?: string; city?: string; isActive?: boolean }) {
    if (body.isActive === false) {
      const active = await this.prisma.location.count({ where: { isActive: true, id: { not: locationId } } });
      if (!active) throw badRequest('LAST_LOCATION', 'At least one location must stay active.');
    }
    const l = await this.prisma.location.update({ where: { id: locationId }, data: body });
    await this.audit.log({ staff: req.staff, action: 'location.update', entityType: 'Location', entityId: l.id, after: body, ip: clientIp(req) });
    return l;
  }

  // ── Pincodes ──
  @Get('pincodes')
  @Perm('inventory.read')
  async pincodes(@Query(zv(z.object({ q: z.string().max(40).optional(), page: z.coerce.number().int().min(1).default(1) }))) q: { q?: string; page: number }) {
    const where: Prisma.PincodeWhereInput = q.q ? { OR: [{ pincode: { startsWith: q.q } }, { city: { contains: q.q, mode: 'insensitive' } }] } : {};
    const [total, rows] = await Promise.all([
      this.prisma.pincode.count({ where }),
      this.prisma.pincode.findMany({ where, orderBy: { pincode: 'asc' }, skip: (q.page - 1) * 100, take: 100, include: { location: { select: { name: true } } } }),
    ]);
    return { total, page: q.page, pageCount: Math.max(1, Math.ceil(total / 100)), items: rows };
  }

  @Patch('pincodes/:id')
  @Perm('inventory.write')
  async updatePincode(
    @Req() req: AppRequest,
    @Param('id', zv(id)) pincodeId: string,
    @Body(zv(z.object({ leadDays: z.number().int().min(0).max(60).optional(), deliveryFee: z.number().int().min(0).optional(), codAvailable: z.boolean().optional(), installationAvailable: z.boolean().optional(), active: z.boolean().optional() }))) body: Prisma.PincodeUpdateInput,
  ) {
    const p = await this.prisma.pincode.update({ where: { id: pincodeId }, data: body });
    await this.audit.log({ staff: req.staff, action: 'pincode.update', entityType: 'Pincode', entityId: p.id, after: body, ip: clientIp(req) });
    return p;
  }

  /**
   * CSV upload: pincode,city,state,leadDays,deliveryFeeRupees,cod(yes/no),installation(yes/no)
   * With dryRun=true nothing is saved; every row is checked and errors are listed by line.
   */
  @Post('pincodes/import')
  @HttpCode(200)
  @Perm('inventory.write')
  async importPincodes(@Req() req: AppRequest, @Body(zv(z.object({ csv: z.string().max(2_000_000), locationId: id, dryRun: z.boolean().default(true) }))) body: { csv: string; locationId: string; dryRun: boolean }) {
    const lines = body.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (/pincode/i.test(lines[0] ?? '')) lines.shift();
    const yes = (s: string | undefined) => !s || /^(y|yes|true|1)$/i.test(s.trim());
    const rows: Prisma.PincodeCreateManyInput[] = [];
    const errors: { line: number; message: string }[] = [];
    lines.forEach((line, i) => {
      const [pin, city, state, lead, fee, cod, install] = line.split(',').map((c) => c?.trim());
      if (!pincode.safeParse(pin).success) return errors.push({ line: i + 2, message: `"${pin}" is not a valid 6-digit pincode` });
      if (!city || !state) return errors.push({ line: i + 2, message: 'City and state are required' });
      const leadDays = Number(lead || 5);
      const feeRupees = Number(fee || 0);
      if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 60) return errors.push({ line: i + 2, message: 'Lead days must be 0 to 60' });
      if (!Number.isFinite(feeRupees) || feeRupees < 0) return errors.push({ line: i + 2, message: 'Delivery fee must be zero or more' });
      rows.push({ pincode: pin, city, state, leadDays, deliveryFee: Math.round(feeRupees * 100), codAvailable: yes(cod), installationAvailable: yes(install), locationId: body.locationId });
    });
    if (body.dryRun || errors.length) return { dryRun: true, valid: rows.length, errors, saved: 0 };
    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) await tx.pincode.upsert({ where: { pincode: r.pincode }, update: r, create: r });
      await this.audit.log({ staff: req.staff, action: 'pincode.import', entityType: 'Pincode', after: { count: rows.length }, ip: clientIp(req) }, tx);
    });
    return { dryRun: false, valid: rows.length, errors: [], saved: rows.length };
  }
}
