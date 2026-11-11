import { config } from './config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { ProblemFilter } from './common/errors';
import { JobsService } from './jobs/jobs.service';

async function bootstrap() {
  for (const dir of ['public', 'private', 'trash']) mkdirSync(join(config.mediaRoot, dir), { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // webhooks verify signatures against the exact bytes received
    logger: config.isProd ? ['log', 'warn', 'error'] : ['log', 'warn', 'error', 'debug'],
  });

  // Trust X-Forwarded-For only from local proxies (Nginx, and Next.js rewrites in development).
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '2mb' });
  app.setGlobalPrefix('v1', { exclude: ['media/*path'] });
  app.useGlobalFilters(new ProblemFilter());
  app.enableCors({ origin: [config.STOREFRONT_URL, config.ADMIN_URL], credentials: true });

  // In production Nginx serves /media straight from disk; this keeps development simple.
  app.useStaticAssets(join(config.mediaRoot, 'public'), {
    prefix: '/media/',
    maxAge: '365d',
    immutable: true,
    index: false,
    dotfiles: 'deny',
  });

  app.enableShutdownHooks();
  await app.listen(config.PORT, '127.0.0.1');
  Logger.log(`API ready on http://127.0.0.1:${config.PORT}/v1 (payments: ${config.PAYMENTS_MODE}${config.onlinePaymentsEnabled ? '' : ', online disabled: no Razorpay keys'})`, 'Bootstrap');

  if (config.RUN_JOBS) await app.get(JobsService).bootstrap();
}

bootstrap();
