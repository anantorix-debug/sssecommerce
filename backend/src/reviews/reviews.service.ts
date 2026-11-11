import { Injectable } from '@nestjs/common';
import { conflict, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

/** Only customers with a delivered item can review it, once; reviews show after moderation. */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async eligibleItem(userId: string, orderItemId: string) {
    const item = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { order: { select: { userId: true, status: true, orderNumber: true } }, review: true },
    });
    if (!item || item.order.userId !== userId) throw notFound('Order item');
    if (item.order.status !== 'DELIVERED') throw conflict('REVIEW_NOT_ALLOWED', 'You can review this item once it has been delivered.');
    if (item.review) throw conflict('REVIEW_EXISTS', 'You have already reviewed this item.');
    const product = await this.prisma.product.findUnique({
      where: { id: item.productId },
      select: { slug: true, name: true },
    });
    return {
      orderItemId: item.id,
      orderNumber: item.order.orderNumber,
      productId: item.productId,
      productName: item.productName,
      productSlug: product?.slug ?? item.productSlug,
      variantTitle: item.variantTitle,
      image: item.imageKey ? `/media/${item.imageKey}` : null,
    };
  }

  async create(userId: string, body: { orderItemId: string; rating: number; title: string; body: string; photos: string[] }) {
    const item = await this.eligibleItem(userId, body.orderItemId);
    return this.prisma.review.create({
      data: { productId: item.productId, userId, orderItemId: item.orderItemId, rating: body.rating, title: body.title, body: body.body, photos: body.photos },
    });
  }

  async moderate(id: string, staffId: string, action: { status: 'APPROVED' | 'REJECTED'; reply?: string | null }) {
    const review = await this.prisma.review.update({
      where: { id },
      data: { status: action.status, reply: action.reply ?? undefined, moderatedBy: staffId },
    });
    await this.recompute(review.productId);
    return review;
  }

  async recompute(productId: string) {
    const agg = await this.prisma.review.aggregate({ where: { productId, status: 'APPROVED' }, _avg: { rating: true }, _count: { rating: true } });
    await this.prisma.product.update({ where: { id: productId }, data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count.rating } });
  }
}
