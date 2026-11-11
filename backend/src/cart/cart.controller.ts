import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { AppRequest } from '../common/request';
import { id, pincode, zv } from '../common/zod';
import { CartService } from './cart.service';

@Controller('store/cart')
@UseGuards(RateLimitGuard)
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get()
  get(@Req() req: AppRequest) {
    return this.carts.priced(req);
  }

  @Post('items')
  @RateLimit('cart', 'session')
  async add(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(zv(z.object({ variantId: id, quantity: z.number().int().min(1).max(20).default(1) }))) body: { variantId: string; quantity: number },
  ) {
    await this.carts.addItem(req, res, body.variantId, body.quantity);
    return this.carts.priced(req);
  }

  @Patch('items/:id')
  @RateLimit('cart', 'session')
  async update(
    @Req() req: AppRequest,
    @Param('id', zv(id)) itemId: string,
    @Body(zv(z.object({ quantity: z.number().int().min(0).max(20) }))) body: { quantity: number },
  ) {
    await this.carts.updateItem(req, itemId, body.quantity);
    return this.carts.priced(req);
  }

  @Delete('items/:id')
  @RateLimit('cart', 'session')
  async remove(@Req() req: AppRequest, @Param('id', zv(id)) itemId: string) {
    await this.carts.updateItem(req, itemId, 0);
    return this.carts.priced(req);
  }

  @Post('coupon')
  @RateLimit('coupon', 'session')
  async coupon(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(zv(z.object({ code: z.string().trim().min(2).max(40) }))) body: { code: string },
  ) {
    await this.carts.setCoupon(req, res, body.code);
    return this.carts.priced(req);
  }

  @Delete('coupon')
  async removeCoupon(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.carts.setCoupon(req, res, null);
    return this.carts.priced(req);
  }

  @Put('pincode')
  @RateLimit('pincode')
  async setPincode(
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(zv(z.object({ pincode: pincode.nullable() }))) body: { pincode: string | null },
  ) {
    await this.carts.setPincode(req, res, body.pincode);
    return this.carts.priced(req);
  }
}
