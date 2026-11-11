import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { z } from 'zod';
import { Perm, StaffGuard } from '../auth/guards';
import { AuditService } from '../common/audit.service';
import { badRequest, conflict, notFound, unprocessable } from '../common/errors';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { AppRequest, clientIp } from '../common/request';
import { SettingsService } from '../common/settings.service';
import { id, zv } from '../common/zod';
import { mediaUrl, toImg } from '../catalog/cards';
import { RevalidateService } from '../content/revalidate.service';
import { PrismaService } from '../prisma/prisma.service';
import { slugify, uniqueSlug } from './slug';

const money = z.number().int().min(0);
const slug = z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.').max(80);

const productSchema = z.object({
  name: z.string().trim().min(2).max(140),
  slug,
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  categoryId: id,
  brand: z.string().trim().max(60).default('SSS Furniture'),
  tagline: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(10000),
  materials: z.string().trim().max(2000).nullable().optional(),
  careInfo: z.string().trim().max(4000).nullable().optional(),
  warrantyMonths: z.number().int().min(0).max(120),
  returnable: z.boolean(),
  returnWindowDays: z.number().int().min(0).max(60),
  installationIncluded: z.boolean(),
  assemblyRequired: z.boolean(),
  hsnCode: z.string().trim().regex(/^\d{4,8}$/, 'HSN codes have 4 to 8 digits.'),
  gstRate: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]),
  codAllowed: z.boolean(),
  featured: z.boolean(),
  badge: z.string().trim().max(30).nullable().optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(170).nullable().optional(),
  options: z.array(z.object({
    id: z.string().optional(),
    ref: z.string(),
    name: z.string().trim().min(1).max(40),
    values: z.array(z.object({
      id: z.string().optional(),
      ref: z.string(),
      value: z.string().trim().min(1).max(60),
      swatchHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      modelVariant: z.string().trim().max(80).nullable().optional(),
    })).min(1),
  })).max(3),
  variants: z.array(z.object({
    id: z.string().optional(),
    sku: z.string().trim().min(2).max(60).regex(/^[A-Z0-9-]+$/, 'SKUs use capital letters, numbers and hyphens.'),
    title: z.string().trim().min(1).max(120),
    price: money.min(100),
    mrp: money.nullable().optional(),
    lengthCm: z.number().int().min(1).max(1000).nullable().optional(),
    widthCm: z.number().int().min(1).max(1000).nullable().optional(),
    heightCm: z.number().int().min(1).max(1000).nullable().optional(),
    weightKg: z.number().min(0).max(2000).nullable().optional(),
    leadTimeDays: z.number().int().min(0).max(120),
    maxPerOrder: z.number().int().min(1).max(50),
    isDefault: z.boolean(),
    active: z.boolean(),
    optionRefs: z.array(z.string()),
  }).refine((v) => v.mrp == null || v.price <= v.mrp, { message: 'Price cannot be above MRP.', path: ['price'] })).min(1),
  media: z.array(z.object({
    mediaId: id,
    role: z.enum(['GALLERY', 'LIFESTYLE', 'DIMENSION', 'DETAIL', 'MODEL_3D', 'MODEL_POSTER']),
    optionRef: z.string().nullable().optional(),
  })).max(60),
  attributes: z.array(z.object({ key: z.string().trim().min(1).max(40), label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(200), filterable: z.boolean() })).max(30),
  roomIds: z.array(id).max(10),
  collectionIds: z.array(id).max(10),
});
type ProductInput = z.infer<typeof productSchema>;

const categorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  parentId: id.nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  imageKey: z.string().max(200).nullable().optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(170).nullable().optional(),
  sort: z.number().int().min(0).max(999).optional(),
});

const roomSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  intro: z.string().trim().max(3000).nullable().optional(),
  heroKey: z.string().max(200).nullable().optional(),
  sort: z.number().int().min(0).max(999).optional(),
});

const collectionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  intro: z.string().trim().max(3000).nullable().optional(),
  heroKey: z.string().max(200).nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  sort: z.number().int().min(0).max(999).optional(),
  seoTitle: z.string().trim().max(70).nullable().optional(),
  seoDescription: z.string().trim().max(170).nullable().optional(),
  story: z.array(z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(2000), imageKey: z.string().max(200).optional().nullable() })).max(8).optional(),
  productIds: z.array(id).max(200).optional(),
});

const lookSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: slug.optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  imageKey: z.string().max(200),
  roomId: id.nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  sort: z.number().int().min(0).max(999).optional(),
  hotspots: z.array(z.object({ productId: id, x: z.number().min(0).max(100), y: z.number().min(0).max(100) })).max(12).optional(),
});

@Controller('admin')
@UseGuards(StaffGuard, RateLimitGuard)
@RateLimit('admin', 'staff')
export class AdminCatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
    private readonly settings: SettingsService,
  ) {}

  // ── Products ──
  @Get('products')
  @Perm('catalog.read')
  async products(@Query(zv(z.object({
    q: z.string().max(100).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
    categoryId: id.optional(),
    page: z.coerce.number().int().min(1).default(1),
  }))) q: { q?: string; status?: ProductStatus; categoryId?: string; page: number }) {
    const where: Prisma.ProductWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { variants: { some: { sku: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (q.page - 1) * 25,
        take: 25,
        include: {
          category: { select: { name: true } },
          variants: { select: { id: true, inventory: { select: { onHand: true, reserved: true } } } },
          media: { where: { role: { in: ['GALLERY', 'LIFESTYLE'] } }, orderBy: { sort: 'asc' }, take: 1, include: { media: true } },
          _count: { select: { media: { where: { role: 'MODEL_3D' } } } },
        },
      }),
    ]);
    return {
      total,
      page: q.page,
      pageCount: Math.max(1, Math.ceil(total / 25)),
      items: rows.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        category: p.category.name,
        minPrice: p.minPrice,
        variantCount: p.variants.length,
        available: p.variants.reduce((s, v) => s + v.inventory.reduce((a, i) => a + i.onHand - i.reserved, 0), 0),
        image: p.media[0] ? mediaUrl(p.media[0].media.storageKey) : null,
        has3d: p._count.media > 0,
        featured: p.featured,
        ratingAvg: p.ratingAvg,
        updatedAt: p.updatedAt,
      })),
    };
  }

  @Post('products')
  @Perm('catalog.write')
  async createProduct(@Req() req: AppRequest, @Body(zv(z.object({ name: z.string().trim().min(2).max(140), categoryId: id }))) body: { name: string; categoryId: string }) {
    const s = await uniqueSlug(body.name, async (x) => Boolean(await this.prisma.product.findUnique({ where: { slug: x } })));
    const product = await this.prisma.product.create({
      data: {
        name: body.name,
        slug: s,
        categoryId: body.categoryId,
        description: '',
        variants: { create: { sku: `SKU-${Date.now().toString(36).toUpperCase()}`, title: 'Standard', price: 100000, isDefault: true } },
      },
    });
    await this.audit.log({ staff: req.staff, action: 'product.create', entityType: 'Product', entityId: product.id, after: { name: body.name }, ip: clientIp(req) });
    return { id: product.id };
  }

  @Get('products/:id')
  @Perm('catalog.read')
  async product(@Param('id', zv(id)) productId: string) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        options: { orderBy: { sort: 'asc' }, include: { values: { orderBy: { sort: 'asc' } } } },
        variants: { orderBy: { createdAt: 'asc' }, include: { optionValues: true, inventory: true, _count: { select: { orderItems: true } } } },
        media: { orderBy: { sort: 'asc' }, include: { media: true } },
        attributes: { orderBy: { sort: 'asc' } },
        rooms: true,
        collections: true,
      },
    });
    if (!p) throw notFound('Product');
    return {
      ...p,
      options: p.options.map((o) => ({ id: o.id, ref: o.id, name: o.name, values: o.values.map((v) => ({ id: v.id, ref: v.id, value: v.value, swatchHex: v.swatchHex, modelVariant: v.modelVariant })) })),
      variants: p.variants.map((v) => ({
        id: v.id, sku: v.sku, title: v.title, price: v.price, mrp: v.mrp, lengthCm: v.lengthCm, widthCm: v.widthCm, heightCm: v.heightCm,
        weightKg: v.weightKg, leadTimeDays: v.leadTimeDays, maxPerOrder: v.maxPerOrder, isDefault: v.isDefault, active: v.active,
        optionRefs: v.optionValues.map((o) => o.optionValueId),
        onHand: v.inventory.reduce((s, i) => s + i.onHand, 0),
        reserved: v.inventory.reduce((s, i) => s + i.reserved, 0),
        hasOrders: v._count.orderItems > 0,
      })),
      media: p.media.map((m) => ({
        mediaId: m.mediaId, role: m.role, optionRef: m.optionValueId,
        kind: m.media.kind, url: mediaUrl(m.media.storageKey), altText: m.media.altText, width: m.media.width, height: m.media.height, bytes: m.media.bytes,
      })),
      attributes: p.attributes.map((a) => ({ key: a.key, label: a.label, value: a.value, filterable: a.filterable })),
      roomIds: p.rooms.map((r) => r.roomId),
      collectionIds: p.collections.map((c) => c.collectionId),
    };
  }

  @Put('products/:id')
  @Perm('catalog.write')
  async saveProduct(@Req() req: AppRequest, @Param('id', zv(id)) productId: string, @Body(zv(productSchema)) body: ProductInput) {
    const before = await this.prisma.product.findUnique({ where: { id: productId }, include: { variants: true } });
    if (!before) throw notFound('Product');
    if (body.slug !== before.slug && (await this.prisma.product.findUnique({ where: { slug: body.slug } }))) {
      throw conflict('SLUG_TAKEN', 'Another product already uses this URL.');
    }
    const skus = body.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) throw badRequest('SKU_DUPLICATE', 'Each variant needs its own SKU.');
    if (body.status === 'ACTIVE') await this.assertPublishable(body);

    await this.prisma.$transaction(async (tx) => {
      // Options and values (refs let new variants point at new values before they have ids)
      const refToId = new Map<string, string>();
      const keepOptionIds = body.options.map((o) => o.id).filter(Boolean) as string[];
      await tx.productOption.deleteMany({ where: { productId, id: { notIn: keepOptionIds } } });
      for (const [oi, o] of body.options.entries()) {
        const option = o.id
          ? await tx.productOption.update({ where: { id: o.id }, data: { name: o.name, sort: oi } })
          : await tx.productOption.create({ data: { productId, name: o.name, sort: oi } });
        const keepValueIds = o.values.map((v) => v.id).filter(Boolean) as string[];
        await tx.optionValue.deleteMany({ where: { optionId: option.id, id: { notIn: keepValueIds } } });
        for (const [vi, v] of o.values.entries()) {
          const data = { value: v.value, swatchHex: v.swatchHex ?? null, modelVariant: v.modelVariant ?? null, sort: vi };
          const row = v.id ? await tx.optionValue.update({ where: { id: v.id }, data }) : await tx.optionValue.create({ data: { ...data, optionId: option.id } });
          refToId.set(v.ref, row.id);
          if (v.id) refToId.set(v.id, row.id);
        }
      }

      // Variants: removed ones with order history are deactivated, never deleted
      const keepVariantIds = body.variants.map((v) => v.id).filter(Boolean) as string[];
      for (const old of before.variants.filter((v) => !keepVariantIds.includes(v.id))) {
        const used = await tx.orderItem.count({ where: { variantId: old.id } });
        if (used) await tx.variant.update({ where: { id: old.id }, data: { active: false } });
        else await tx.variant.delete({ where: { id: old.id } });
      }
      for (const v of body.variants) {
        const { id: vid, optionRefs, ...data } = v;
        const clash = await tx.variant.findUnique({ where: { sku: v.sku } });
        if (clash && clash.id !== vid) throw conflict('SKU_TAKEN', `SKU ${v.sku} is already used by another product.`);
        const row = vid ? await tx.variant.update({ where: { id: vid }, data }) : await tx.variant.create({ data: { ...data, productId } });
        await tx.variantOptionValue.deleteMany({ where: { variantId: row.id } });
        const ids = optionRefs.map((r) => refToId.get(r)).filter(Boolean) as string[];
        if (ids.length) await tx.variantOptionValue.createMany({ data: ids.map((optionValueId) => ({ variantId: row.id, optionValueId })) });
      }

      await tx.productMedia.deleteMany({ where: { productId } });
      if (body.media.length) {
        await tx.productMedia.createMany({
          data: body.media.map((m, i) => ({ productId, mediaId: m.mediaId, role: m.role, sort: i, optionValueId: m.optionRef ? refToId.get(m.optionRef) ?? null : null })),
        });
      }
      await tx.productAttribute.deleteMany({ where: { productId } });
      if (body.attributes.length) await tx.productAttribute.createMany({ data: body.attributes.map((a, i) => ({ ...a, productId, sort: i })) });
      await tx.productRoom.deleteMany({ where: { productId } });
      if (body.roomIds.length) await tx.productRoom.createMany({ data: body.roomIds.map((roomId) => ({ productId, roomId })) });
      await tx.collectionProduct.deleteMany({ where: { productId } });
      if (body.collectionIds.length) await tx.collectionProduct.createMany({ data: body.collectionIds.map((collectionId) => ({ productId, collectionId })) });

      const active = body.variants.filter((v) => v.active);
      const { options, variants, media, attributes, roomIds, collectionIds, ...fields } = body;
      void options; void variants; void media; void attributes; void roomIds; void collectionIds;
      await tx.product.update({
        where: { id: productId },
        data: {
          ...fields,
          minPrice: active.length ? Math.min(...active.map((v) => v.price)) : 0,
          publishedAt: body.status === 'ACTIVE' && !before.publishedAt ? new Date() : undefined,
        },
      });
      if (body.slug !== before.slug) {
        await tx.redirect.upsert({ where: { fromPath: `/products/${before.slug}` }, update: { toPath: `/products/${body.slug}` }, create: { fromPath: `/products/${before.slug}`, toPath: `/products/${body.slug}` } });
        await tx.redirect.deleteMany({ where: { fromPath: `/products/${body.slug}` } });
      }
      await this.audit.log({ staff: req.staff, action: 'product.update', entityType: 'Product', entityId: productId, before, after: body, ip: clientIp(req) }, tx);
    });
    this.revalidate.tags(['products', `product:${body.slug}`, `product:${before.slug}`, 'home', 'nav']);
    return this.product(productId);
  }

  private async assertPublishable(body: ProductInput) {
    const problems: string[] = [];
    if (body.description.length < 40) problems.push('Write a description of at least 40 characters.');
    if (!body.variants.some((v) => v.active)) problems.push('At least one variant must be active.');
    const images = body.media.filter((m) => ['GALLERY', 'LIFESTYLE', 'DETAIL', 'DIMENSION'].includes(m.role));
    if (!images.length) problems.push('Add at least one image.');
    const assets = await this.prisma.mediaAsset.findMany({ where: { id: { in: body.media.map((m) => m.mediaId) } } });
    if (assets.some((a) => a.kind === 'IMAGE' && !a.altText?.trim())) problems.push('Every image needs alt text before publishing.');
    if (body.media.some((m) => m.role === 'MODEL_3D') && !body.media.some((m) => m.role === 'MODEL_POSTER')) problems.push('Add a poster image for the 3D model.');
    if (problems.length) throw unprocessable('NOT_PUBLISHABLE', 'This product is not ready to publish.', problems.map((message) => ({ path: 'status', message })));
  }

  @Post('products/:id/status')
  @HttpCode(200)
  @Perm('catalog.write')
  async setStatus(@Req() req: AppRequest, @Param('id', zv(id)) productId: string, @Body(zv(z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']) }))) body: { status: ProductStatus }) {
    const full = await this.product(productId);
    if (body.status === 'ACTIVE') {
      await this.assertPublishable({ ...full, status: 'ACTIVE', media: full.media, variants: full.variants } as unknown as ProductInput);
    }
    const p = await this.prisma.product.update({ where: { id: productId }, data: { status: body.status, publishedAt: body.status === 'ACTIVE' && !full.publishedAt ? new Date() : undefined } });
    await this.audit.log({ staff: req.staff, action: `product.${body.status.toLowerCase()}`, entityType: 'Product', entityId: productId, ip: clientIp(req) });
    this.revalidate.tags(['products', `product:${p.slug}`, 'home', 'nav']);
    return { status: p.status };
  }

  // ── Categories ──
  @Get('categories')
  @Perm('catalog.read')
  async categories() {
    const rows = await this.prisma.category.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }], include: { _count: { select: { products: true, children: true } } } });
    return rows.map((c) => ({ ...c, image: mediaUrl(c.imageKey), productCount: c._count.products, childCount: c._count.children }));
  }

  @Post('categories')
  @Perm('catalog.write')
  async createCategory(@Req() req: AppRequest, @Body(zv(categorySchema)) body: z.infer<typeof categorySchema>) {
    const s = body.slug ?? (await uniqueSlug(body.name, async (x) => Boolean(await this.prisma.category.findUnique({ where: { slug: x } }))));
    if (body.parentId) await this.assertDepth(body.parentId);
    const c = await this.prisma.category.create({ data: { ...body, slug: s } });
    await this.audit.log({ staff: req.staff, action: 'category.create', entityType: 'Category', entityId: c.id, after: c, ip: clientIp(req) });
    this.revalidate.tags(['nav', 'categories']);
    return c;
  }

  @Patch('categories/:id')
  @Perm('catalog.write')
  async updateCategory(@Req() req: AppRequest, @Param('id', zv(id)) categoryId: string, @Body(zv(categorySchema.partial())) body: Partial<z.infer<typeof categorySchema>>) {
    if (body.parentId === categoryId) throw badRequest('CATEGORY_CYCLE', 'A category cannot be its own parent.');
    if (body.parentId) await this.assertDepth(body.parentId, categoryId);
    const before = await this.prisma.category.findUnique({ where: { id: categoryId } });
    const c = await this.prisma.category.update({ where: { id: categoryId }, data: body });
    await this.audit.log({ staff: req.staff, action: 'category.update', entityType: 'Category', entityId: c.id, before, after: c, ip: clientIp(req) });
    this.revalidate.tags(['nav', 'categories', `category:${c.slug}`]);
    return c;
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @Perm('catalog.write')
  async deleteCategory(@Req() req: AppRequest, @Param('id', zv(id)) categoryId: string) {
    const c = await this.prisma.category.findUnique({ where: { id: categoryId }, include: { _count: { select: { products: true, children: true } } } });
    if (!c) throw notFound('Category');
    if (c._count.products || c._count.children) throw conflict('CATEGORY_IN_USE', 'Move its products and sub-categories first.');
    await this.prisma.category.delete({ where: { id: categoryId } });
    await this.audit.log({ staff: req.staff, action: 'category.delete', entityType: 'Category', entityId: categoryId, before: c, ip: clientIp(req) });
    this.revalidate.tags(['nav', 'categories']);
  }

  /** Category trees are at most three levels deep and never loop. */
  private async assertDepth(parentId: string, selfId?: string) {
    let depth = 1;
    let current = await this.prisma.category.findUnique({ where: { id: parentId } });
    while (current?.parentId) {
      if (current.parentId === selfId) throw badRequest('CATEGORY_CYCLE', 'That would put the category inside itself.');
      depth++;
      current = await this.prisma.category.findUnique({ where: { id: current.parentId } });
    }
    if (depth >= 3) throw badRequest('CATEGORY_TOO_DEEP', 'Categories can be at most three levels deep.');
  }

  // ── Rooms ──
  @Get('rooms')
  @Perm('catalog.read')
  async rooms() {
    const rows = await this.prisma.room.findMany({ orderBy: { sort: 'asc' }, include: { _count: { select: { products: true, looks: true } } } });
    return rows.map((r) => ({ ...r, image: mediaUrl(r.heroKey), productCount: r._count.products, lookCount: r._count.looks }));
  }

  @Get('rooms/:id')
  @Perm('catalog.read')
  async room(@Param('id', zv(id)) roomId: string) {
    const r = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!r) throw notFound('Room');
    return { ...r, image: mediaUrl(r.heroKey) };
  }

  @Post('rooms')
  @Perm('catalog.write')
  async createRoom(@Req() req: AppRequest, @Body(zv(roomSchema)) body: z.infer<typeof roomSchema>) {
    const s = body.slug ?? (await uniqueSlug(body.name, async (x) => Boolean(await this.prisma.room.findUnique({ where: { slug: x } }))));
    const r = await this.prisma.room.create({ data: { ...body, slug: s } });
    await this.audit.log({ staff: req.staff, action: 'room.create', entityType: 'Room', entityId: r.id, after: r, ip: clientIp(req) });
    this.revalidate.tags(['nav', 'rooms', 'home']);
    return r;
  }

  @Patch('rooms/:id')
  @Perm('catalog.write')
  async updateRoom(@Req() req: AppRequest, @Param('id', zv(id)) roomId: string, @Body(zv(roomSchema.partial())) body: Partial<z.infer<typeof roomSchema>>) {
    const r = await this.prisma.room.update({ where: { id: roomId }, data: body });
    await this.audit.log({ staff: req.staff, action: 'room.update', entityType: 'Room', entityId: r.id, after: r, ip: clientIp(req) });
    this.revalidate.tags(['nav', 'rooms', `room:${r.slug}`, 'home']);
    return r;
  }

  @Delete('rooms/:id')
  @HttpCode(204)
  @Perm('catalog.write')
  async deleteRoom(@Req() req: AppRequest, @Param('id', zv(id)) roomId: string) {
    const looks = await this.prisma.look.count({ where: { roomId } });
    if (looks) throw conflict('ROOM_IN_USE', 'Move or delete the looks in this room first.');
    await this.prisma.room.delete({ where: { id: roomId } });
    await this.audit.log({ staff: req.staff, action: 'room.delete', entityType: 'Room', entityId: roomId, ip: clientIp(req) });
    this.revalidate.tags(['nav', 'rooms', 'home']);
  }

  // ── Collections ──
  @Get('collections')
  @Perm('catalog.read')
  async collections() {
    const rows = await this.prisma.collection.findMany({ orderBy: { sort: 'asc' }, include: { _count: { select: { products: true } } } });
    return rows.map((c) => ({ ...c, image: mediaUrl(c.heroKey), productCount: c._count.products }));
  }

  @Get('collections/:id')
  @Perm('catalog.read')
  async collection(@Param('id', zv(id)) collectionId: string) {
    const c = await this.prisma.collection.findUnique({ where: { id: collectionId }, include: { products: { orderBy: { sort: 'asc' }, include: { product: { select: { id: true, name: true, status: true } } } } } });
    if (!c) throw notFound('Collection');
    return { ...c, image: mediaUrl(c.heroKey), products: c.products.map((p) => p.product) };
  }

  @Post('collections')
  @Perm('catalog.write')
  async createCollection(@Req() req: AppRequest, @Body(zv(collectionSchema)) body: z.infer<typeof collectionSchema>) {
    const { productIds, story, ...data } = body;
    const s = body.slug ?? (await uniqueSlug(body.name, async (x) => Boolean(await this.prisma.collection.findUnique({ where: { slug: x } }))));
    const c = await this.prisma.collection.create({
      data: { ...data, slug: s, story: (story ?? []) as Prisma.InputJsonValue, products: productIds ? { create: productIds.map((productId, sort) => ({ productId, sort })) } : undefined },
    });
    await this.audit.log({ staff: req.staff, action: 'collection.create', entityType: 'Collection', entityId: c.id, after: body, ip: clientIp(req) });
    this.revalidate.tags(['nav', 'collections', 'home']);
    return c;
  }

  @Patch('collections/:id')
  @Perm('catalog.write')
  async updateCollection(@Req() req: AppRequest, @Param('id', zv(id)) collectionId: string, @Body(zv(collectionSchema.partial())) body: Partial<z.infer<typeof collectionSchema>>) {
    const { productIds, story, ...data } = body;
    const c = await this.prisma.$transaction(async (tx) => {
      if (productIds) {
        await tx.collectionProduct.deleteMany({ where: { collectionId } });
        await tx.collectionProduct.createMany({ data: productIds.map((productId, sort) => ({ collectionId, productId, sort })) });
      }
      return tx.collection.update({ where: { id: collectionId }, data: { ...data, ...(story ? { story: story as Prisma.InputJsonValue } : {}) } });
    });
    await this.audit.log({ staff: req.staff, action: 'collection.update', entityType: 'Collection', entityId: c.id, after: body, ip: clientIp(req) });
    this.revalidate.tags(['nav', 'collections', `collection:${c.slug}`, 'home', 'products']);
    return c;
  }

  @Delete('collections/:id')
  @HttpCode(204)
  @Perm('catalog.write')
  async deleteCollection(@Req() req: AppRequest, @Param('id', zv(id)) collectionId: string) {
    await this.prisma.collection.delete({ where: { id: collectionId } });
    await this.audit.log({ staff: req.staff, action: 'collection.delete', entityType: 'Collection', entityId: collectionId, ip: clientIp(req) });
    this.revalidate.tags(['nav', 'collections', 'home']);
  }

  // ── Looks (shop-the-room scenes with hotspots) ──
  @Get('looks')
  @Perm('catalog.read')
  async looks() {
    const rows = await this.prisma.look.findMany({ orderBy: { sort: 'asc' }, include: { room: { select: { name: true } }, _count: { select: { hotspots: true } } } });
    return rows.map((l) => ({ ...l, image: mediaUrl(l.imageKey), hotspotCount: l._count.hotspots }));
  }

  @Get('looks/:id')
  @Perm('catalog.read')
  async look(@Param('id', zv(id)) lookId: string) {
    const l = await this.prisma.look.findUnique({ where: { id: lookId }, include: { hotspots: { include: { product: { select: { id: true, name: true } } } } } });
    if (!l) throw notFound('Look');
    const media = await this.prisma.mediaAsset.findUnique({ where: { storageKey: l.imageKey } });
    return { ...l, image: toImg(media, l.name) ?? { url: mediaUrl(l.imageKey) } };
  }

  @Post('looks')
  @Perm('catalog.write')
  async createLook(@Req() req: AppRequest, @Body(zv(lookSchema)) body: z.infer<typeof lookSchema>) {
    const { hotspots, ...data } = body;
    const s = body.slug ?? (await uniqueSlug(body.name, async (x) => Boolean(await this.prisma.look.findUnique({ where: { slug: x } }))));
    const l = await this.prisma.look.create({ data: { ...data, slug: s, hotspots: hotspots ? { create: hotspots } : undefined } });
    await this.audit.log({ staff: req.staff, action: 'look.create', entityType: 'Look', entityId: l.id, after: body, ip: clientIp(req) });
    this.revalidate.tags(['looks', 'home', 'rooms']);
    return l;
  }

  @Patch('looks/:id')
  @Perm('catalog.write')
  async updateLook(@Req() req: AppRequest, @Param('id', zv(id)) lookId: string, @Body(zv(lookSchema.partial())) body: Partial<z.infer<typeof lookSchema>>) {
    const { hotspots, ...data } = body;
    const l = await this.prisma.$transaction(async (tx) => {
      if (hotspots) {
        await tx.lookHotspot.deleteMany({ where: { lookId } });
        await tx.lookHotspot.createMany({ data: hotspots.map((h) => ({ ...h, lookId })) });
      }
      return tx.look.update({ where: { id: lookId }, data });
    });
    await this.audit.log({ staff: req.staff, action: 'look.update', entityType: 'Look', entityId: l.id, after: body, ip: clientIp(req) });
    this.revalidate.tags(['looks', `look:${l.slug}`, 'home', 'rooms']);
    return l;
  }

  @Delete('looks/:id')
  @HttpCode(204)
  @Perm('catalog.write')
  async deleteLook(@Req() req: AppRequest, @Param('id', zv(id)) lookId: string) {
    await this.prisma.look.delete({ where: { id: lookId } });
    await this.audit.log({ staff: req.staff, action: 'look.delete', entityType: 'Look', entityId: lookId, ip: clientIp(req) });
    this.revalidate.tags(['looks', 'home', 'rooms']);
  }

  // ── Finish swatch library and specification keys ──
  @Get('catalog/library')
  @Perm('catalog.read')
  async library() {
    return { finishLibrary: await this.settings.get('finishLibrary'), attributeKeys: await this.settings.get('attributeKeys') };
  }

  @Put('catalog/library')
  @Perm('catalog.write')
  async saveLibrary(
    @Req() req: AppRequest,
    @Body(zv(z.object({
      finishLibrary: z.array(z.object({ name: z.string().trim().min(1).max(60), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(100),
      attributeKeys: z.array(z.object({ key: z.string().trim().regex(/^[a-z][a-z0-9_]*$/).max(40), label: z.string().trim().min(1).max(60), filterable: z.boolean() })).max(40),
    }))) body: { finishLibrary: { name: string; hex: string }[]; attributeKeys: { key: string; label: string; filterable: boolean }[] },
  ) {
    await this.settings.set('finishLibrary', body.finishLibrary, req.staff!.id);
    await this.settings.set('attributeKeys', body.attributeKeys, req.staff!.id);
    // keep product attributes in sync with the filterable flag
    for (const k of body.attributeKeys) {
      await this.prisma.productAttribute.updateMany({ where: { key: k.key }, data: { filterable: k.filterable, label: k.label } });
    }
    await this.audit.log({ staff: req.staff, action: 'catalog.library_update', entityType: 'Setting', entityId: 'finishLibrary', after: body, ip: clientIp(req) });
    this.revalidate.tags(['products']);
    return this.library();
  }

  @Get('catalog/slug-preview')
  @Perm('catalog.read')
  slugPreview(@Query('name') name: string) {
    return { slug: slugify(name ?? '') };
  }
}
