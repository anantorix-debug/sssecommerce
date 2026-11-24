import { Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { MediaImportItemStatus } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { Perm, StaffGuard } from '../auth/guards';
import { badRequest } from '../common/errors';
import { RateLimit, RateLimitGuard, RateLimitService } from '../common/rate-limit';
import { AppRequest, clientIp } from '../common/request';
import { id, zv } from '../common/zod';
import type { UploadFile } from '../media/media.service';
import { MediaImportsService, type Licence } from './media-imports.service';
import { IMPORT_ROLES, type ImportRole } from './parse';

// Multipart fields arrive as text, so the licence tick box is "true" or "on".
const licenceFields = z.object({
  name: z.string().trim().max(120).default(''),
  licenceSource: z.string().trim().max(200).default(''),
  licenceNote: z.string().trim().max(2000).default(''),
  licenceConfirmed: z.string().optional().transform((v) => v === 'true' || v === 'on' || v === '1'),
});
const manualFields = licenceFields.extend({
  sku: z.string().trim().min(1, 'Enter the product SKU.').max(80),
  role: z.enum(IMPORT_ROLES).default('GALLERY'),
});
const itemsBody = z.object({ itemIds: z.union([z.literal('all'), z.array(id).min(1).max(1000)]) });
const STATUSES = ['PENDING', 'DOWNLOADING', 'READY', 'DUPLICATE', 'FAILED', 'APPROVED', 'REJECTED'] as const;

@Controller('admin/media-imports')
@UseGuards(StaffGuard, RateLimitGuard)
@RateLimit('admin', 'staff')
export class AdminMediaImportsController {
  constructor(
    private readonly imports: MediaImportsService,
    private readonly limits: RateLimitService,
  ) {}

  @Get()
  @Perm('catalog.read')
  list(@Query(zv(z.object({ page: z.coerce.number().int().min(1).default(1) }))) q: { page: number }) {
    return this.imports.list(q.page);
  }

  @Post('csv')
  @Perm('media.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async csv(@Req() req: AppRequest, @UploadedFile() file: UploadFile | undefined, @Body(zv(licenceFields)) body: Licence) {
    await this.limits.hit('mediaImport', req.staff!.id);
    if (!file) throw badRequest('FILE_REQUIRED', 'Choose a CSV file.');
    return this.imports.createFromCsv(req.staff!, body, file.buffer, clientIp(req));
  }

  @Post('zip')
  @Perm('media.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 200 * 1024 * 1024, files: 1 } }))
  async zip(@Req() req: AppRequest, @UploadedFile() file: UploadFile | undefined, @Body(zv(licenceFields)) body: Licence) {
    await this.limits.hit('mediaImport', req.staff!.id);
    if (!file) throw badRequest('FILE_REQUIRED', 'Choose a ZIP file.');
    return this.imports.createFromZip(req.staff!, body, file.buffer, clientIp(req));
  }

  @Post('manual')
  @Perm('media.write')
  @UseInterceptors(FilesInterceptor('files', 50, { limits: { fileSize: 25 * 1024 * 1024 } }))
  async manual(@Req() req: AppRequest, @UploadedFiles() files: UploadFile[] | undefined, @Body(zv(manualFields)) body: Licence & { sku: string; role: ImportRole }) {
    await this.limits.hit('mediaImport', req.staff!.id);
    return this.imports.createManual(req.staff!, body, body.sku, body.role, files ?? [], clientIp(req));
  }

  @Get(':id')
  @Perm('catalog.read')
  get(@Param('id', zv(id)) jobId: string, @Query(zv(z.object({ status: z.enum(STATUSES).optional() }))) q: { status?: MediaImportItemStatus }) {
    return this.imports.get(jobId, q.status);
  }

  @Get(':id/report.csv')
  @Perm('catalog.read')
  async report(@Param('id', zv(id)) jobId: string, @Res() res: Response) {
    const { name, csv } = await this.imports.reportCsv(jobId);
    const file = `import-report-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60) || jobId}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send('﻿' + csv);
  }

  @Get('items/:itemId/preview')
  @Perm('catalog.read')
  async preview(@Param('itemId', zv(id)) itemId: string, @Res() res: Response) {
    const { asset, data, url } = await this.imports.preview(itemId);
    if (!data) return res.redirect(url!);
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(data);
  }

  @Post(':id/approve')
  @Perm('catalog.write')
  approve(@Req() req: AppRequest, @Param('id', zv(id)) jobId: string, @Body(zv(itemsBody)) body: { itemIds: string[] | 'all' }) {
    return this.imports.approve(req.staff!, jobId, body.itemIds, clientIp(req));
  }

  @Post(':id/reject')
  @Perm('media.write')
  reject(@Req() req: AppRequest, @Param('id', zv(id)) jobId: string, @Body(zv(z.object({ itemIds: z.array(id).min(1).max(1000) }))) body: { itemIds: string[] }) {
    return this.imports.reject(req.staff!, jobId, body.itemIds, clientIp(req));
  }

  @Post(':id/retry')
  @Perm('media.write')
  retry(@Req() req: AppRequest, @Param('id', zv(id)) jobId: string, @Body(zv(itemsBody)) body: { itemIds: string[] | 'all' }) {
    return this.imports.retry(req.staff!, jobId, body.itemIds, clientIp(req));
  }
}
