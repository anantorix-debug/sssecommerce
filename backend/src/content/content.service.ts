import { Injectable } from '@nestjs/common';
import { config } from '../config';
import { notFound } from '../common/errors';
import { SettingsService } from '../common/settings.service';
import { CatalogService } from '../catalog/catalog.service';
import { mediaUrl, toImg } from '../catalog/cards';
import { PrismaService } from '../prisma/prisma.service';

export interface Block {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

const IMAGE_FIELDS = ['imageKey', 'secondaryImageKey', 'posterKey'];

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
  ) {}

  /** Swaps every image key inside blocks for a full image object (size, alt, blurred placeholder). */
  private async resolveImages(blocks: Block[]) {
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v)) {
          if (IMAGE_FIELDS.includes(k) && typeof val === 'string') keys.add(val);
          else walk(val);
        }
      }
    };
    walk(blocks);
    const assets = await this.prisma.mediaAsset.findMany({ where: { storageKey: { in: [...keys] } } });
    const byKey = new Map(assets.map((a) => [a.storageKey, a]));
    const swap = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(swap);
      if (v && typeof v === 'object') {
        return Object.fromEntries(
          Object.entries(v).map(([k, val]) => {
            if (IMAGE_FIELDS.includes(k) && typeof val === 'string') {
              const name = k.replace(/Key$/, '');
              return [name, toImg(byKey.get(val)) ?? { url: mediaUrl(val), width: null, height: null, alt: '', placeholder: null }];
            }
            return [k, swap(val)];
          }),
        );
      }
      return v;
    };
    return blocks.map((b) => ({ ...b, data: swap(b.data) as Record<string, unknown> }));
  }

  async home() {
    const page = await this.prisma.contentPage.findUnique({ where: { slug: 'home' } });
    const blocks = await this.resolveImages(((page?.blocks as unknown as Block[]) ?? []).filter((b) => !(b.data as { hidden?: boolean }).hidden));
    const resolved = await Promise.all(
      blocks.map(async (b) => {
        const d = b.data as Record<string, any>;
        try {
          switch (b.type) {
            case 'HERO': {
              const video = d.videoKey ? await this.prisma.mediaAsset.findUnique({ where: { storageKey: d.videoKey } }) : null;
              return { ...b, data: { ...d, video: video ? { url: mediaUrl(video.storageKey), type: video.mimeType } : null } };
            }
            case 'ROOMS':
              return { ...b, data: { ...d, rooms: await this.catalog.rooms() } };
            case 'COLLECTION_STORY': {
              const c = d.collectionSlug ? await this.catalog.collection(d.collectionSlug) : null;
              return { ...b, data: { ...d, collection: c ? { name: c.name, slug: c.slug, tagline: c.tagline } : null } };
            }
            case 'LOOK':
              return { ...b, data: { ...d, look: await this.catalog.look(d.lookSlug) } };
            case 'PRODUCT_RAIL':
              return { ...b, data: { ...d, products: await this.catalog.productRail(d.source ?? 'bestsellers', d.limit ?? 8, d.collectionSlug) } };
            case 'GUIDES':
              return { ...b, data: { ...d, guides: (await this.guides()).slice(0, d.limit ?? 3) } };
            case 'REVIEWS':
              return { ...b, data: { ...d, reviews: await this.featuredReviews(6) } };
            default:
              return b;
          }
        } catch {
          return null; // a block whose source was removed is skipped, not shown broken
        }
      }),
    );
    return {
      title: page?.seoTitle ?? null,
      description: page?.seoDescription ?? null,
      blocks: resolved.filter(Boolean),
    };
  }

  async featuredReviews(limit: number) {
    const rows = await this.prisma.review.findMany({
      where: { status: 'APPROVED', rating: { gte: 4 } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { name: true } }, product: { select: { name: true, slug: true } } },
    });
    return rows.map((r) => {
      const [first, last] = (r.user.name ?? 'Verified buyer').split(/\s+/);
      return { id: r.id, rating: r.rating, title: r.title, body: r.body, author: last ? `${first} ${last[0]}.` : first, product: r.product, createdAt: r.createdAt };
    });
  }

  async page(slug: string) {
    const page = await this.prisma.contentPage.findUnique({ where: { slug } });
    if (!page || page.status !== 'ACTIVE' || page.type === 'HOME') throw notFound('Page');
    return {
      type: page.type,
      slug: page.slug,
      title: page.title,
      excerpt: page.excerpt,
      cover: page.coverKey ? toImg(await this.prisma.mediaAsset.findUnique({ where: { storageKey: page.coverKey } }), page.title) : null,
      author: page.authorName,
      publishedAt: page.publishedAt,
      updatedAt: page.updatedAt,
      seo: { title: page.seoTitle ?? page.title, description: page.seoDescription ?? page.excerpt ?? '' },
      blocks: await this.resolveImages(page.blocks as unknown as Block[]),
    };
  }

  async pagesOfType(type: 'POLICY' | 'STATIC' | 'FAQ') {
    return this.prisma.contentPage.findMany({ where: { type, status: 'ACTIVE' }, orderBy: { title: 'asc' }, select: { slug: true, title: true, updatedAt: true } });
  }

  async guides() {
    const rows = await this.prisma.contentPage.findMany({
      where: { type: 'GUIDE', status: 'ACTIVE' },
      orderBy: { publishedAt: 'desc' },
    });
    const covers = await this.prisma.mediaAsset.findMany({ where: { storageKey: { in: rows.map((r) => r.coverKey).filter(Boolean) as string[] } } });
    return rows.map((g) => ({
      slug: g.slug,
      title: g.title,
      excerpt: g.excerpt,
      author: g.authorName,
      publishedAt: g.publishedAt,
      cover: toImg(covers.find((c) => c.storageKey === g.coverKey), g.title),
      readMinutes: Math.max(2, Math.round(JSON.stringify(g.blocks).split(/\s+/).length / 220)),
    }));
  }

  async footer() {
    const menu = await this.prisma.navigationMenu.findUnique({ where: { location: 'footer' } });
    return menu?.items ?? [];
  }

  /** Settings the storefront needs on every page. */
  async publicSettings() {
    const [store, announcement, cod, checkout, methods, delivery, served] = await Promise.all([
      this.settings.get('store'),
      this.settings.get('announcement'),
      this.settings.get('cod'),
      this.settings.get('checkout'),
      this.settings.paymentMethods(),
      this.settings.get('delivery'),
      // Cities we deliver to, busiest first, for "we currently deliver in …" messages.
      this.prisma.pincode.groupBy({ by: ['city'], where: { active: true }, _count: { city: true }, orderBy: { _count: { city: 'desc' } }, take: 8 }),
    ]);
    return {
      store: { name: store.name, email: store.email, phone: store.phone, supportHours: store.supportHours, address: store.address, legalName: store.legalName, gstin: store.gstin },
      announcement: announcement.enabled ? { text: announcement.text, href: announcement.href } : null,
      payments: {
        online: methods.online,
        mode: config.PAYMENTS_MODE,
        cod: methods.cod,
        codLimit: cod.maxOrderValue,
        emi: config.FEATURE_EMI,
      },
      freeDeliveryAbove: checkout.freeDeliveryAbove,
      // The store's own city first (it appears in the store address), then the rest.
      deliveryCities: served.map((s) => s.city).sort((a, b) => Number(store.address.includes(b)) - Number(store.address.includes(a))),
      deliversAllIndia: delivery.allIndia,
      googleClientId: config.googleEnabled ? config.GOOGLE_CLIENT_ID : null,
      footer: await this.footer(),
    };
  }

  async sitemap() {
    const [products, categories, rooms, collections, pages, looks] = await Promise.all([
      this.prisma.product.findMany({ where: { status: 'ACTIVE' }, select: { slug: true, updatedAt: true } }),
      this.prisma.category.findMany({ select: { slug: true, updatedAt: true, parent: { select: { slug: true } } } }),
      this.prisma.room.findMany({ select: { slug: true, updatedAt: true } }),
      this.prisma.collection.findMany({ where: { status: 'ACTIVE' }, select: { slug: true, updatedAt: true } }),
      this.prisma.contentPage.findMany({ where: { status: 'ACTIVE', type: { not: 'HOME' } }, select: { slug: true, type: true, updatedAt: true } }),
      this.prisma.look.findMany({ where: { status: 'ACTIVE' }, select: { slug: true, updatedAt: true } }),
    ]);
    return {
      products: products.map((p) => ({ path: `/products/${p.slug}`, updatedAt: p.updatedAt })),
      categories: categories.map((c) => ({ path: c.parent ? `/shop/${c.parent.slug}/${c.slug}` : `/shop/${c.slug}`, updatedAt: c.updatedAt })),
      rooms: rooms.map((r) => ({ path: `/rooms/${r.slug}`, updatedAt: r.updatedAt })),
      collections: collections.map((c) => ({ path: `/collections/${c.slug}`, updatedAt: c.updatedAt })),
      looks: looks.map((l) => ({ path: `/looks/${l.slug}`, updatedAt: l.updatedAt })),
      pages: pages.map((p) => ({
        path: p.type === 'GUIDE' ? `/guides/${p.slug}` : p.type === 'POLICY' ? `/policies/${p.slug}` : `/${p.slug}`,
        updatedAt: p.updatedAt,
      })),
    };
  }
}
