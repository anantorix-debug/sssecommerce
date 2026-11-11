// Production: run scheduled jobs in their own PM2 process (RUN_JOBS=true here, false for the API).
process.env.RUN_JOBS = 'true';
import { config } from './config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JobsService } from './jobs/jobs.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  app.enableShutdownHooks();
  await app.get(JobsService).bootstrap();
  Logger.log(`Background jobs running (media root ${config.mediaRoot})`, 'Jobs');
}

bootstrap();
