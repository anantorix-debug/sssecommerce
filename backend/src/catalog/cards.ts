import { Prisma } from '@prisma/client';

export const mediaUrl = (key: string | null | undefined) => (key ? `/media/${key}` : null);

export interface Img {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  placeholder: string | null;
}

export function toImg(
  m: { storageKey: string; width: number | null; height: number | null; altText: string | null; placeholder: string | null } | null | undefined,
  fallbackAlt = '',
): Img | null {
  if (!m) return null;
  return { url: `/media/${m.storageKey}`, width: m.width, height: m.height, alt: m.altText ?? fallbackAlt, placeholder: m.placeholder };
}

export const productCardInclude = {
  category: { select: { name: true, slug: true } },
  variants: { where: { active: true }, orderBy: { price: 'asc' }, select: { id: true, price: true, mrp: true, leadTimeDays: true, isDefault: true } },
  media: {
    where: { media: { kind: 'IMAGE', deletedAt: null }, role: { in: ['GALLERY', 'LIFESTYLE'] } },
    orderBy: { sort: 'asc' },
    include: { media: true },
  },
  options: { orderBy: { sort: 'asc' }, include: { values: { orderBy: { sort: 'asc' } } } },
  attributes: { where: { key: 'material' }, take: 1 },
  _count: { select: { media: { where: { role: 'MODEL_3D' } } } },
} satisfies Prisma.ProductInclude;

export type CardProduct = Prisma.ProductGetPayload<{ include: typeof productCardInclude }>;

export function toProductCard(p: CardProduct) {
  const cheapest = p.variants[0];
  const general = p.media.filter((m) => !m.optionValueId);
  const pool = general.length ? general : p.media;
  const finish = p.options.find((o) => o.values.some((v) => v.swatchHex)) ?? null;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    badge: p.badge,
    category: p.category,
    price: cheapest?.price ?? 0,
    mrp: cheapest?.mrp ?? null,
    image: toImg(pool[0]?.media, p.name),
    hoverImage: toImg(pool.find((m) => m.role === 'LIFESTYLE' && m !== pool[0])?.media ?? pool[1]?.media, p.name),
    swatches: finish
      ? finish.values.map((v) => ({
          id: v.id,
          value: v.value,
          hex: v.swatchHex,
          image: toImg(p.media.find((m) => m.optionValueId === v.id)?.media, `${p.name} in ${v.value}`),
        }))
      : [],
    material: p.attributes[0]?.value ?? p.materials ?? null,
    ratingAvg: Math.round(p.ratingAvg * 10) / 10,
    ratingCount: p.ratingCount,
    has3d: p._count.media > 0,
    leadTimeDays: Math.min(...p.variants.map((v) => v.leadTimeDays), 99),
    defaultVariantId: (p.variants.find((v) => v.isDefault) ?? cheapest)?.id ?? null,
  };
}

export type ProductCard = ReturnType<typeof toProductCard>;
