import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountController } from './auth/account.controller';
import { AuthMiddleware, CustomerGuard, StaffGuard } from './auth/guards';
import { CustomerAuthController } from './auth/customer-auth.controller';
import { SessionService } from './auth/session.service';
import { AdminAuthController } from './admin/admin-auth.controller';
import { AdminCatalogController } from './admin/admin-catalog.controller';
import { AdminMediaInventoryController } from './admin/admin-media-inventory.controller';
import { AdminOpsController } from './admin/admin-ops.controller';
import { AdminOrdersController } from './admin/admin-orders.controller';
import { AdminSystemController } from './admin/admin-system.controller';
import { CartController } from './cart/cart.controller';
import { CartService } from './cart/cart.service';
import { PricingService } from './cart/pricing.service';
import { CatalogService } from './catalog/catalog.service';
import { StoreCatalogController } from './catalog/store-catalog.controller';
import { CheckoutController } from './checkout/checkout.controller';
import { CheckoutService } from './checkout/checkout.service';
import { AuditService } from './common/audit.service';
import { RateLimitGuard, RateLimitService } from './common/rate-limit';
import { SettingsService } from './common/settings.service';
import { StoreContentController } from './content/content.controller';
import { ContentService } from './content/content.service';
import { RevalidateService } from './content/revalidate.service';
import { LogisticsService } from './delivery/logistics.service';
import { SchedulingService } from './delivery/scheduling.service';
import { InventoryService } from './inventory/inventory.service';
import { InvoiceService } from './invoices/invoice.service';
import { JobsService } from './jobs/jobs.service';
import { MediaService } from './media/media.service';
import { MailService } from './notifications/mail.service';
import { CustomerOrdersController } from './orders/customer-orders.controller';
import { OrderService } from './orders/order.service';
import { RazorpayService } from './payments/razorpay.service';
import { RefundService } from './payments/refund.service';
import { WebhookController } from './payments/webhook.controller';
import { PrismaModule, PrismaService } from './prisma/prisma.service';
import { ReturnsService } from './returns/returns.service';
import { ReviewsService } from './reviews/reviews.service';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', time: new Date().toISOString() };
  }
}

export const SERVICES = [
  SessionService,
  SettingsService,
  AuditService,
  RateLimitService,
  RateLimitGuard,
  CustomerGuard,
  StaffGuard,
  MailService,
  MediaService,
  CatalogService,
  LogisticsService,
  SchedulingService,
  InventoryService,
  PricingService,
  CartService,
  RazorpayService,
  RefundService,
  InvoiceService,
  OrderService,
  CheckoutService,
  ReturnsService,
  ReviewsService,
  ContentService,
  RevalidateService,
  JobsService,
];

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  controllers: [
    HealthController,
    StoreCatalogController,
    StoreContentController,
    CustomerAuthController,
    AccountController,
    CartController,
    CheckoutController,
    CustomerOrdersController,
    WebhookController,
    AdminAuthController,
    AdminCatalogController,
    AdminMediaInventoryController,
    AdminOrdersController,
    AdminOpsController,
    AdminSystemController,
  ],
  providers: SERVICES,
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes('{*path}');
  }
}
