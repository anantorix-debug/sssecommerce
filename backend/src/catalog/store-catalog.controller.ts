import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { notFound } from '../common/errors';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { id, pincode, zv } from '../common/zod';
import { LogisticsService } from '../delivery/logistics.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService, ProductQuery } from './catalog.service';

const list = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? undefined : (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean)));

const productQuery = z.object({
  category: z.string().max(80).optional(),
  room: z.string().max(80).optional(),
  collection: z.string().max(80).optional(),
  q: z.string().max(100).optional(),
  material: list,
  finish: list,
  seating: list,
  style: list,
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  maxWidth: z.coerce.number().int().min(10).max(1000).optional(),
  inStock: z.enum(['1', 'true']).optional().transform((v) => Boolean(v)),
  sort: z.enum(['featured', 'new', 'price-asc', 'price-desc', 'rating', 'bestselling', 'relevance']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});

@Controller('store')
@UseGuards(RateLimitGuard)
@RateLimit('catalog')
export class StoreCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly logistics: LogisticsService,
    private readonly inventory: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('navigation')
  navigation() {
    return this.catalog.navigation();
  }

  @Get('categories')
  categories() {
    return this.catalog.categories();
  }

  @Get('categories/:slug')
  category(@Param('slug') slug: string) {
    return this.catalog.category(slug);
  }

  @Get('products')
  products(@Query(zv(productQuery)) query: ProductQuery) {
    return this.catalog.listProducts(query);
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.catalog.product(slug);
  }

  @Get('products/:slug/reviews')
  reviews(@Param('slug') slug: string, @Query(zv(z.object({ page: z.coerce.number().int().min(1).default(1) }))) q: { page: number }) {
    return this.catalog.reviews(slug, q.page);
  }

  /** Live stock and delivery date for one variant. Never cached. */
  @Get('variants/:id/availability')
  async availability(@Param('id', zv(id)) variantId: string, @Query(zv(z.object({ pincode: pincode.optional() }))) q: { pincode?: string }) {
    const variant = await this.prisma.variant.findUnique({ where: { id: variantId }, include: { product: { select: { codAllowed: true, installationIncluded: true } } } });
    if (!variant || !variant.active) throw notFound('Variant');
    const available = await this.inventory.available(variantId);
    const delivery = q.pincode ? await this.logistics.describe(q.pincode, variant.leadTimeDays) : null;
    return {
      variantId,
      available,
      inStock: available > 0,
      lowStock: available > 0 && available <= 3,
      maxQuantity: Math.min(available, variant.maxPerOrder),
      delivery: delivery && delivery.serviceable
        ? { ...delivery, codAvailable: delivery.codAvailable && variant.product.codAllowed, installationIncluded: variant.product.installationIncluded && delivery.installationAvailable }
        : delivery,
    };
  }

  @Get('pincodes/:pincode')
  @RateLimit('pincode')
  pincode(@Param('pincode', zv(pincode)) pin: string) {
    return this.logistics.describe(pin);
  }

  @Get('compare')
  compare(@Query(zv(z.object({ ids: list }))) q: { ids?: string[] }) {
    return this.catalog.compare((q.ids ?? []).filter((x) => z.string().uuid().safeParse(x).success));
  }

  @Get('cards')
  cards(@Query(zv(z.object({ ids: list }))) q: { ids?: string[] }) {
    return this.catalog.cardsByIds((q.ids ?? []).filter((x) => z.string().uuid().safeParse(x).success).slice(0, 48));
  }

  @Get('rooms')
  rooms() {
    return this.catalog.rooms();
  }

  @Get('rooms/:slug')
  room(@Param('slug') slug: string) {
    return this.catalog.room(slug);
  }

  @Get('collections')
  collections() {
    return this.catalog.collections();
  }

  @Get('collections/:slug')
  collection(@Param('slug') slug: string) {
    return this.catalog.collection(slug);
  }

  @Get('looks/:slug')
  look(@Param('slug') slug: string) {
    return this.catalog.look(slug);
  }

  @Get('search/suggest')
  @RateLimit('search')
  suggest(@Query(zv(z.object({ q: z.string().max(100).default('') }))) q: { q: string }) {
    return this.catalog.suggest(q.q);
  }
}
