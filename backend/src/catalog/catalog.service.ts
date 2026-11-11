import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { mediaUrl, productCardInclude, toImg, toProductCard } from './cards';

export interface ProductQuery {
  category?: string;
  room?: string;
  collection?: string;
  q?: string;
  material?: string[];
  finish?: string[];
  seating?: string[];
  style?: string[];
  minPrice?: number;
  maxPrice?: number;
  maxWidth?: number;
  inStock?: boolean;
  sort?: 'featured' | 'new' | 'price-asc' | 'price-desc' | 'rating' | 'bestselling' | 'relevance';
  page: number;
  pageSize: number;
}

// Words customers use that mean the same thing in our catalogue.
const SYNONYMS: Record<string, string> = {
  couch: 'sofa', settee: 'sofa', sectional: 'sofa', loveseat: 'sofa',
  almirah: 'wardrobe', cupboard: 'wardrobe', closet: 'wardrobe',
  cot: 'bed', charpai: 'bed', diwan: 'bed',
  desk: 'study table', workdesk: 'study table',
  credenza: 'sideboard', buffet: 'sideboard',
  lamp: 'lamp', light: 'lamp', armchair: 'accent chair',
};

function editDistance(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

@Injectable()
export class CatalogService {
  private vocabulary: { words: string[]; at: number } = { words: [], at: 0 };

  constructor(private readonly prisma: PrismaService) {}

  /** Words customers might search for, taken from the live catalogue. Refreshed every 10 minutes. */
  private async vocab() {
    if (Date.now() - this.vocabulary.at < 600_000 && this.vocabulary.words.length) return this.vocabulary.words;
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({ where: { status: 'ACTIVE' }, select: { name: true, materials: true, tagline: true } }),
      this.prisma.category.findMany({ select: { name: true } }),
    ]);
    const text = [...products.flatMap((p) => [p.name, p.materials ?? '', p.tagline ?? '']), ...categories.map((c) => c.name), ...Object.values(SYNONYMS)].join(' ');
    const words = [...new Set(text.toLowerCase().match(/[a-z]{3,}/g) ?? [])];
    this.vocabulary = { words, at: Date.now() };
    return words;
  }

  /** "teek bed" → "teak bed": each unknown word is swapped for the closest catalogue word (1–2 typos). */
  async correct(raw: string) {
    const words = await this.vocab();
    const known = new Set(words);
    let changed = false;
    const out = raw.toLowerCase().split(/\s+/).filter(Boolean).map((w) => {
      if (known.has(w) || SYNONYMS[w] || w.length < 3) return w;
      const limit = w.length <= 5 ? 1 : 2;
      let best: string | null = null;
      let bestD = limit + 1;
      for (const v of words) {
        if (Math.abs(v.length - w.length) > limit) continue;
        const d = editDistance(w, v);
        if (d < bestD) [best, bestD] = [v, d];
      }
      if (best) {
        changed = true;
        return best;
      }
      return w;
    });
    return changed ? out.join(' ') : null;
  }

  // ── Navigation ──
  async navigation() {
    const [categories, rooms, collections, products] = await Promise.all([
      this.prisma.category.findMany({
        where: { parentId: null },
        orderBy: { sort: 'asc' },
        include: { children: { orderBy: { sort: 'asc' }, select: { name: true, slug: true } } },
      }),
      this.prisma.room.findMany({ orderBy: { sort: 'asc' }, select: { name: true, slug: true, tagline: true, heroKey: true } }),
      this.prisma.collection.findMany({ where: { status: 'ACTIVE' }, orderBy: { sort: 'asc' }, select: { name: true, slug: true, tagline: true, heroKey: true } }),
      this.prisma.product.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, minPrice: true, soldCount: true, ratingCount: true, category: { select: { id: true, parentId: true } } },
      }),
    ]);

    // Per top-level category: "starting from" price, piece count and a bestseller for the menu's promo cards.
    const stats = new Map<string, { fromPrice: number | null; count: number; bestId: string | null; score: number }>();
    for (const p of products) {
      const top = p.category.parentId ?? p.category.id;
      const s = stats.get(top) ?? { fromPrice: null, count: 0, bestId: null, score: -1 };
      s.count++;
      if (p.minPrice > 0) s.fromPrice = s.fromPrice === null ? p.minPrice : Math.min(s.fromPrice, p.minPrice);
      const score = p.soldCount * 3 + p.ratingCount;
      if (score > s.score) Object.assign(s, { bestId: p.id, score });
      stats.set(top, s);
    }
    const bestIds = [...stats.values()].map((s) => s.bestId).filter((x): x is string => Boolean(x));
    const best = await this.prisma.product.findMany({ where: { id: { in: bestIds } }, include: productCardInclude });

    return {
      categories: categories.map((c) => {
        const s = stats.get(c.id);
        const top = s?.bestId ? best.find((b) => b.id === s.bestId) : undefined;
        return {
          name: c.name,
          slug: c.slug,
          image: mediaUrl(c.imageKey),
          children: c.children,
          fromPrice: s?.fromPrice ?? null,
          count: s?.count ?? 0,
          bestseller: top ? toProductCard(top) : null,
        };
      }),
      rooms: rooms.map((r) => ({ name: r.name, slug: r.slug, tagline: r.tagline, image: mediaUrl(r.heroKey) })),
      collections: collections.map((c) => ({ name: c.name, slug: c.slug, tagline: c.tagline, image: mediaUrl(c.heroKey) })),
    };
  }

  async categories() {
    const all = await this.prisma.category.findMany({
      orderBy: { sort: 'asc' },
      include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
    });
    const top = all.filter((c) => !c.parentId);
    return top.map((c) => {
      const children = all.filter((x) => x.parentId === c.id);
      return {
        name: c.name,
        slug: c.slug,
        description: c.description,
        image: mediaUrl(c.imageKey),
        productCount: c._count.products + children.reduce((s, x) => s + x._count.products, 0),
        children: children.map((x) => ({ name: x.name, slug: x.slug, productCount: x._count.products })),
      };
    });
  }

  async category(slug: string) {
    const c = await this.prisma.category.findUnique({
      where: { slug },
      include: { parent: true, children: { orderBy: { sort: 'asc' } } },
    });
    if (!c) throw notFound('Category');
    const siblings = c.parentId
      ? await this.prisma.category.findMany({ where: { parentId: c.parentId }, orderBy: { sort: 'asc' } })
      : c.children;
    return {
      name: c.name,
      slug: c.slug,
      description: c.description,
      image: mediaUrl(c.imageKey),
      seoTitle: c.seoTitle,
      seoDescription: c.seoDescription,
      parent: c.parent ? { name: c.parent.name, slug: c.parent.slug } : null,
      subcategories: siblings.map((s) => ({ name: s.name, slug: s.slug })),
    };
  }

  // ── Product listing with filters and facets ──
  async listProducts(q: ProductQuery) {
    const base: Prisma.ProductWhereInput[] = [{ status: 'ACTIVE' }];
    if (q.category) base.push({ category: { OR: [{ slug: q.category }, { parent: { slug: q.category } }] } });
    if (q.room) base.push({ rooms: { some: { room: { slug: q.room } } } });
    if (q.collection) base.push({ collections: { some: { collection: { slug: q.collection } } } });

    let rankedIds: string[] | null = null;
    let correctedQuery: string | null = null;
    if (q.q?.trim()) {
      rankedIds = await this.searchIds(q.q.trim(), 200);
      if (!rankedIds.length) {
        correctedQuery = await this.correct(q.q.trim());
        if (correctedQuery) rankedIds = await this.searchIds(correctedQuery, 200);
      }
      base.push({ id: { in: rankedIds } });
    }

    const filters: Prisma.ProductWhereInput[] = [];
    for (const key of ['material', 'seating', 'style'] as const) {
      const values = q[key];
      if (values?.length) filters.push({ attributes: { some: { key, value: { in: values } } } });
    }
    if (q.finish?.length) filters.push({ options: { some: { values: { some: { value: { in: q.finish } } } } } });
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      filters.push({ minPrice: { gte: q.minPrice ?? 0, lte: q.maxPrice ?? Number.MAX_SAFE_INTEGER } });
    }
    if (q.maxWidth) filters.push({ variants: { some: { active: true, widthCm: { lte: q.maxWidth } } } });
    if (q.inStock) filters.push({ id: { in: await this.inStockProductIds() } });

    const where: Prisma.ProductWhereInput = { AND: [...base, ...filters] };
    const sort = q.sort ?? (rankedIds ? 'relevance' : 'featured');
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      sort === 'new' ? [{ publishedAt: 'desc' }]
      : sort === 'price-asc' ? [{ minPrice: 'asc' }]
      : sort === 'price-desc' ? [{ minPrice: 'desc' }]
      : sort === 'rating' ? [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }]
      : sort === 'bestselling' ? [{ soldCount: 'desc' }]
      : [{ featured: 'desc' }, { soldCount: 'desc' }, { publishedAt: 'desc' }];

    const [total, facets] = await Promise.all([this.prisma.product.count({ where }), this.facets({ AND: base })]);

    let products;
    if (sort === 'relevance' && rankedIds) {
      // Keep search rank order: fetch the matching ids, then page in rank order.
      const matching = await this.prisma.product.findMany({ where, select: { id: true } });
      const set = new Set(matching.map((m) => m.id));
      const pageIds = rankedIds.filter((id) => set.has(id)).slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
      const rows = await this.prisma.product.findMany({ where: { id: { in: pageIds } }, include: productCardInclude });
      products = pageIds.map((id) => rows.find((r) => r.id === id)!).filter(Boolean);
    } else {
      products = await this.prisma.product.findMany({
        where,
        orderBy,
        include: productCardInclude,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      });
    }

    return {
      items: products.map(toProductCard),
      total,
      page: q.page,
      pageSize: q.pageSize,
      pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
      sort,
      facets,
      correctedQuery,
    };
  }

  private async facets(where: Prisma.ProductWhereInput) {
    const ids = (await this.prisma.product.findMany({ where, select: { id: true } })).map((p) => p.id);
    if (!ids.length) return { attributes: [], finishes: [], price: { min: 0, max: 0 } };
    const [attrs, finishes, price] = await Promise.all([
      this.prisma.productAttribute.groupBy({
        by: ['key', 'label', 'value'],
        where: { productId: { in: ids }, filterable: true },
        _count: { productId: true },
        orderBy: { value: 'asc' },
      }),
      this.prisma.optionValue.findMany({
        where: { swatchHex: { not: null }, option: { productId: { in: ids } } },
        select: { value: true, swatchHex: true, option: { select: { productId: true } } },
      }),
      this.prisma.product.aggregate({ where: { id: { in: ids } }, _min: { minPrice: true }, _max: { minPrice: true } }),
    ]);
    const grouped = new Map<string, { key: string; label: string; values: { value: string; count: number }[] }>();
    for (const a of attrs) {
      if (!grouped.has(a.key)) grouped.set(a.key, { key: a.key, label: a.label, values: [] });
      grouped.get(a.key)!.values.push({ value: a.value, count: a._count.productId });
    }
    const finishMap = new Map<string, { value: string; hex: string | null; products: Set<string> }>();
    for (const f of finishes) {
      if (!finishMap.has(f.value)) finishMap.set(f.value, { value: f.value, hex: f.swatchHex, products: new Set() });
      finishMap.get(f.value)!.products.add(f.option.productId);
    }
    return {
      attributes: [...grouped.values()],
      finishes: [...finishMap.values()].map((f) => ({ value: f.value, hex: f.hex, count: f.products.size })).sort((a, b) => b.count - a.count),
      price: { min: price._min.minPrice ?? 0, max: price._max.minPrice ?? 0 },
    };
  }

  private async inStockProductIds() {
    const rows = await this.prisma.$queryRaw<{ productId: string }[]>`
      SELECT DISTINCT v."productId" FROM "Variant" v
      JOIN "InventoryLevel" i ON i."variantId" = v.id
      WHERE v.active AND i."onHand" - i."reserved" > 0`;
    return rows.map((r) => r.productId);
  }

  /** Full-text match plus trigram similarity, so "sofaa" and "teek bed" still find things. */
  async searchIds(raw: string, limit = 50): Promise<string[]> {
    const words = raw.toLowerCase().split(/\s+/).filter(Boolean).map((w) => SYNONYMS[w] ?? w);
    const query = words.join(' ').slice(0, 100);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Product" p
      JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Category" pc ON pc.id = c."parentId"
      WHERE p.status = 'ACTIVE' AND (
        to_tsvector('english', coalesce(p."name", '') || ' ' || coalesce(p."tagline", '') || ' ' ||
          coalesce(p."materials", '') || ' ' || coalesce(p."description", ''))
          @@ websearch_to_tsquery('english', ${query})
        OR word_similarity(${query}, p."name") > 0.45
        OR word_similarity(${query}, coalesce(p."materials", '')) > 0.5
        OR word_similarity(${query}, coalesce(p."tagline", '')) > 0.55
        OR p."name" ILIKE ${'%' + query + '%'}
        OR c."name" ILIKE ${'%' + query + '%'}
        OR word_similarity(${query}, c."name") > 0.5
        OR coalesce(pc."name", '') ILIKE ${'%' + query + '%'}
      )
      ORDER BY
        ts_rank(to_tsvector('english', coalesce(p."name", '') || ' ' || coalesce(p."tagline", '')), websearch_to_tsquery('english', ${query})) DESC,
        word_similarity(${query}, p."name") DESC,
        p."soldCount" DESC
      LIMIT ${limit}`;
    return rows.map((r) => r.id);
  }

  async suggest(raw: string) {
    const q = raw.trim();
    if (q.length < 2) return { products: [], categories: [], rooms: [], guides: [], correctedQuery: null };
    let ids = await this.searchIds(q, 6);
    let correctedQuery: string | null = null;
    if (!ids.length) {
      const corrected = await this.correct(q);
      if (corrected) {
        ids = await this.searchIds(corrected, 6);
        if (ids.length) correctedQuery = corrected;
      }
    }
    const term = correctedQuery ?? q;
    const [products, categories, rooms, guides] = await Promise.all([
      this.prisma.product.findMany({ where: { id: { in: ids } }, include: productCardInclude }),
      this.prisma.category.findMany({ where: { name: { contains: term, mode: 'insensitive' } }, take: 4, select: { name: true, slug: true } }),
      this.prisma.room.findMany({ where: { name: { contains: term, mode: 'insensitive' } }, take: 3, select: { name: true, slug: true } }),
      this.prisma.contentPage.findMany({
        where: { type: 'GUIDE', status: 'ACTIVE', title: { contains: term, mode: 'insensitive' } },
        take: 3,
        select: { title: true, slug: true },
      }),
    ]);
    return {
      products: ids.map((id) => products.find((p) => p.id === id)).filter(Boolean).map((p) => toProductCard(p!)),
      categories,
      rooms,
      guides,
      correctedQuery,
    };
  }

  // ── Product detail ──
  async product(slug: string) {
    const p = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: { include: { parent: true } },
        options: { orderBy: { sort: 'asc' }, include: { values: { orderBy: { sort: 'asc' } } } },
        variants: { where: { active: true }, orderBy: { price: 'asc' }, include: { optionValues: true } },
        media: { where: { media: { deletedAt: null } }, orderBy: { sort: 'asc' }, include: { media: true } },
        attributes: { orderBy: { sort: 'asc' } },
        rooms: { include: { room: { select: { name: true, slug: true } } } },
        collections: { include: { collection: { select: { name: true, slug: true, status: true } } } },
        hotspots: { include: { look: { include: { hotspots: { include: { product: { include: productCardInclude } } } } } } },
      },
    });
    if (!p || p.status !== 'ACTIVE') {
      const redirect = await this.prisma.redirect.findUnique({ where: { fromPath: `/products/${slug}` } });
      if (redirect) return { redirect: redirect.toPath };
      throw notFound('Product');
    }

    const images = p.media.filter((m) => m.media.kind === 'IMAGE');
    const model = p.media.find((m) => m.role === 'MODEL_3D');
    const poster = p.media.find((m) => m.role === 'MODEL_POSTER');
    const breadcrumbs = [
      { label: 'Shop', href: '/shop' },
      ...(p.category.parent ? [{ label: p.category.parent.name, href: `/shop/${p.category.parent.slug}` }] : []),
      { label: p.category.name, href: p.category.parent ? `/shop/${p.category.parent.slug}/${p.category.slug}` : `/shop/${p.category.slug}` },
    ];

    // "Complete the look": other products placed in the same room scenes.
    const lookMates = new Map<string, ReturnType<typeof toProductCard>>();
    for (const h of p.hotspots) {
      for (const other of h.look.hotspots) {
        if (other.productId !== p.id && other.product.status === 'ACTIVE') lookMates.set(other.productId, toProductCard(other.product));
      }
    }
    const related = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', id: { not: p.id }, categoryId: p.categoryId },
      orderBy: [{ soldCount: 'desc' }, { featured: 'desc' }],
      take: 8,
      include: productCardInclude,
    });

    const [distribution, reviews] = await Promise.all([
      this.prisma.review.groupBy({ by: ['rating'], where: { productId: p.id, status: 'APPROVED' }, _count: { rating: true } }),
      this.prisma.review.findMany({
        where: { productId: p.id, status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: { user: { select: { name: true } } },
      }),
    ]);

    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      tagline: p.tagline,
      badge: p.badge,
      description: p.description,
      materials: p.materials,
      careInfo: p.careInfo,
      warrantyMonths: p.warrantyMonths,
      returnable: p.returnable,
      returnWindowDays: p.returnWindowDays,
      installationIncluded: p.installationIncluded,
      assemblyRequired: p.assemblyRequired,
      codAllowed: p.codAllowed,
      category: { name: p.category.name, slug: p.category.slug },
      breadcrumbs,
      seo: { title: p.seoTitle ?? `${p.name} | ${p.category.name}`, description: p.seoDescription ?? p.tagline ?? p.description.slice(0, 155) },
      options: p.options.map((o) => ({
        id: o.id,
        name: o.name,
        values: o.values.map((v) => ({ id: v.id, value: v.value, hex: v.swatchHex, modelVariant: v.modelVariant })),
      })),
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        title: v.title,
        price: v.price,
        mrp: v.mrp,
        optionValueIds: v.optionValues.map((o) => o.optionValueId),
        dimensions: { length: v.lengthCm, width: v.widthCm, height: v.heightCm },
        weightKg: v.weightKg,
        leadTimeDays: v.leadTimeDays,
        maxPerOrder: v.maxPerOrder,
        isDefault: v.isDefault,
      })),
      media: images.map((m) => ({ id: m.id, role: m.role, optionValueId: m.optionValueId, ...toImg(m.media, p.name)! })),
      model3d: model
        ? { url: mediaUrl(model.media.storageKey)!, poster: poster ? mediaUrl(poster.media.storageKey) : null, bytes: model.media.bytes }
        : null,
      attributes: p.attributes.map((a) => ({ key: a.key, label: a.label, value: a.value })),
      rooms: p.rooms.map((r) => r.room),
      collections: p.collections.filter((c) => c.collection.status === 'ACTIVE').map((c) => ({ name: c.collection.name, slug: c.collection.slug })),
      rating: {
        average: Math.round(p.ratingAvg * 10) / 10,
        count: p.ratingCount,
        distribution: [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: distribution.find((d) => d.rating === r)?._count.rating ?? 0 })),
      },
      reviews: reviews.map(publicReview),
      completeTheLook: [...lookMates.values()].slice(0, 6),
      related: related.map(toProductCard),
    };
  }

  async reviews(slug: string, page: number) {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (!product) throw notFound('Product');
    const where = { productId: product.id, status: 'APPROVED' as const };
    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 10,
        take: 10,
        include: { user: { select: { name: true } } },
      }),
    ]);
    return { items: rows.map(publicReview), total, page, pageCount: Math.max(1, Math.ceil(total / 10)) };
  }

  async compare(ids: string[]) {
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids.slice(0, 3) }, status: 'ACTIVE' },
      include: {
        ...productCardInclude,
        variants: { where: { active: true }, orderBy: { price: 'asc' } },
        attributes: { orderBy: { sort: 'asc' } },
      },
    });
    return ids
      .map((id) => products.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => {
        const v = p!.variants[0];
        return {
          ...toProductCard(p!),
          dimensions: v ? { length: v.lengthCm, width: v.widthCm, height: v.heightCm } : null,
          weightKg: v?.weightKg ?? null,
          materials: p!.materials,
          warrantyMonths: p!.warrantyMonths,
          returnWindowDays: p!.returnable ? p!.returnWindowDays : 0,
          installationIncluded: p!.installationIncluded,
          attributes: p!.attributes.map((a) => ({ label: a.label, value: a.value })),
          variantCount: p!.variants.length,
        };
      });
  }

  // ── Rooms, collections, looks ──
  async rooms() {
    const rooms = await this.prisma.room.findMany({
      orderBy: { sort: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return rooms.map((r) => ({ name: r.name, slug: r.slug, tagline: r.tagline, intro: r.intro, image: mediaUrl(r.heroKey), productCount: r._count.products }));
  }

  async room(slug: string) {
    const r = await this.prisma.room.findUnique({
      where: { slug },
      include: { looks: { where: { status: 'ACTIVE' }, orderBy: { sort: 'asc' }, select: { slug: true } } },
    });
    if (!r) throw notFound('Room');
    const looks = await Promise.all(r.looks.map((l) => this.look(l.slug)));
    const cats = await this.prisma.category.findMany({
      where: { products: { some: { status: 'ACTIVE', rooms: { some: { roomId: r.id } } } } },
      select: { name: true, slug: true, imageKey: true, parent: { select: { slug: true } } },
    });
    return {
      name: r.name,
      slug: r.slug,
      tagline: r.tagline,
      intro: r.intro,
      image: mediaUrl(r.heroKey),
      looks,
      categories: cats.map((c) => ({ name: c.name, slug: c.slug, href: c.parent ? `/shop/${c.parent.slug}/${c.slug}` : `/shop/${c.slug}`, image: mediaUrl(c.imageKey) })),
    };
  }

  async collections() {
    const rows = await this.prisma.collection.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sort: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return rows.map((c) => ({ name: c.name, slug: c.slug, tagline: c.tagline, intro: c.intro, image: mediaUrl(c.heroKey), productCount: c._count.products }));
  }

  async collection(slug: string) {
    const c = await this.prisma.collection.findUnique({ where: { slug } });
    if (!c || c.status !== 'ACTIVE') throw notFound('Collection');
    const story = (c.story as { title: string; body: string; imageKey?: string }[]).map((s) => ({
      title: s.title,
      body: s.body,
      image: mediaUrl(s.imageKey),
    }));
    return {
      name: c.name,
      slug: c.slug,
      tagline: c.tagline,
      intro: c.intro,
      image: mediaUrl(c.heroKey),
      story,
      seo: { title: c.seoTitle ?? `${c.name} collection`, description: c.seoDescription ?? c.tagline ?? '' },
    };
  }

  async look(slug: string) {
    const l = await this.prisma.look.findUnique({
      where: { slug },
      include: {
        room: { select: { name: true, slug: true } },
        hotspots: { include: { product: { include: productCardInclude } } },
      },
    });
    if (!l || l.status !== 'ACTIVE') throw notFound('Look');
    const media = await this.prisma.mediaAsset.findUnique({ where: { storageKey: l.imageKey } });
    const hotspots = l.hotspots
      .filter((h) => h.product.status === 'ACTIVE')
      .map((h) => ({ id: h.id, x: h.x, y: h.y, product: toProductCard(h.product) }));
    return {
      name: l.name,
      slug: l.slug,
      description: l.description,
      room: l.room,
      image: toImg(media, l.name) ?? { url: mediaUrl(l.imageKey)!, width: null, height: null, alt: l.name, placeholder: null },
      hotspots,
      totalPrice: hotspots.reduce((s, h) => s + h.product.price, 0),
    };
  }

  async cardsByIds(ids: string[]) {
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, include: productCardInclude });
    return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean).map((p) => toProductCard(p!));
  }

  async productRail(source: string, limit = 8, collectionSlug?: string) {
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };
    if (source === 'collection' && collectionSlug) where.collections = { some: { collection: { slug: collectionSlug } } };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      source === 'new' ? [{ publishedAt: 'desc' }]
      : source === 'featured' ? [{ featured: 'desc' }, { soldCount: 'desc' }]
      : [{ soldCount: 'desc' }, { ratingCount: 'desc' }, { featured: 'desc' }];
    const rows = await this.prisma.product.findMany({ where, orderBy, take: limit, include: productCardInclude });
    return rows.map(toProductCard);
  }
}

export function publicReview(r: {
  id: string;
  rating: number;
  title: string;
  body: string;
  photos: Prisma.JsonValue;
  reply: string | null;
  createdAt: Date;
  user: { name: string | null };
}) {
  const name = r.user.name?.trim() || 'Verified buyer';
  const [first, last] = name.split(/\s+/);
  return {
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    photos: ((r.photos as string[]) ?? []).map((k) => mediaUrl(k)!),
    reply: r.reply,
    author: last ? `${first} ${last[0]}.` : first,
    verified: true,
    createdAt: r.createdAt,
  };
}
