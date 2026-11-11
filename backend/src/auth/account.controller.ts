import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../common/crypto';
import { badRequest, notFound } from '../common/errors';
import { CurrentUser } from '../common/request';
import { AddressInput, addressSchema, id, password, phone, zv } from '../common/zod';
import { PrismaService } from '../prisma/prisma.service';
import { productCardInclude, toProductCard } from '../catalog/cards';
import { publicUser } from './customer-auth.controller';
import { CustomerGuard } from './guards';

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: phone.optional().nullable(),
  marketingOptIn: z.boolean().optional(),
});

@Controller('me')
@UseGuards(CustomerGuard)
export class AccountController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@CurrentUser() user: User) {
    const [orders, wishlist, addresses] = await Promise.all([
      this.prisma.order.count({ where: { userId: user.id, status: { notIn: ['EXPIRED'] } } }),
      this.prisma.wishlistItem.count({ where: { userId: user.id } }),
      this.prisma.address.count({ where: { userId: user.id } }),
    ]);
    return { user: publicUser(user), counts: { orders, wishlist, addresses } };
  }

  @Patch('profile')
  async updateProfile(@CurrentUser() user: User, @Body(zv(profileSchema)) body: z.infer<typeof profileSchema>) {
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: body });
    return { user: publicUser(updated) };
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: User,
    @Body(zv(z.object({ current: z.string().optional(), password }))) body: { current?: string; password: string },
  ) {
    if (user.passwordHash) {
      const ok = body.current ? await verifyPassword(user.passwordHash, body.current) : false;
      if (!ok) throw badRequest('INVALID_CREDENTIALS', 'Your current password is not right.');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password) } });
  }

  // ── Addresses ──
  @Get('addresses')
  addresses(@CurrentUser() user: User) {
    return this.prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
  }

  @Post('addresses')
  async addAddress(@CurrentUser() user: User, @Body(zv(addressSchema.extend({ isDefault: z.boolean().optional() }))) body: AddressInput & { isDefault?: boolean }) {
    const count = await this.prisma.address.count({ where: { userId: user.id } });
    if (count >= 20) throw badRequest('ADDRESS_LIMIT', 'You can save up to 20 addresses.');
    const isDefault = body.isDefault || count === 0;
    return this.prisma.$transaction(async (tx) => {
      if (isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...body, isDefault, userId: user.id } });
    });
  }

  @Patch('addresses/:id')
  async updateAddress(
    @CurrentUser() user: User,
    @Param('id', zv(id)) addressId: string,
    @Body(zv(addressSchema.partial().extend({ isDefault: z.boolean().optional() }))) body: Partial<AddressInput> & { isDefault?: boolean },
  ) {
    const existing = await this.prisma.address.findFirst({ where: { id: addressId, userId: user.id } });
    if (!existing) throw notFound('Address');
    return this.prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return tx.address.update({ where: { id: addressId }, data: body });
    });
  }

  @Delete('addresses/:id')
  @HttpCode(204)
  async deleteAddress(@CurrentUser() user: User, @Param('id', zv(id)) addressId: string) {
    await this.prisma.address.deleteMany({ where: { id: addressId, userId: user.id } });
  }

  // ── Wishlist ──
  @Get('wishlist')
  async wishlist(@CurrentUser() user: User) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { product: { include: productCardInclude } },
    });
    return items.filter((i) => i.product.status === 'ACTIVE').map((i) => toProductCard(i.product));
  }

  @Post('wishlist')
  @HttpCode(204)
  async addWishlist(@CurrentUser() user: User, @Body(zv(z.object({ productIds: z.array(id).min(1).max(100) }))) body: { productIds: string[] }) {
    await this.prisma.wishlistItem.createMany({
      data: body.productIds.map((productId) => ({ userId: user.id, productId })),
      skipDuplicates: true,
    });
  }

  @Delete('wishlist/:productId')
  @HttpCode(204)
  async removeWishlist(@CurrentUser() user: User, @Param('productId', zv(id)) productId: string) {
    await this.prisma.wishlistItem.deleteMany({ where: { userId: user.id, productId } });
  }
}
