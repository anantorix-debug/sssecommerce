import { Injectable, Logger } from '@nestjs/common';
import { MediaImportItem, MediaImportItemStatus, MediaImportJobStatus, MediaImportSource, MediaRole, Prisma } from '@prisma/client';
import AdmZip from 'adm-zip';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { config } from '../config';
import { AuditService } from '../common/audit.service';
import { badRequest, notFound } from '../common/errors';
import { mediaUrl } from '../catalog/cards';
import { RevalidateService } from '../content/revalidate.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { downloadImage, MAX_DOWNLOAD_BYTES, PermanentError } from './fetch-image';
import { csvCell, IMAGE_EXTENSIONS, type ImportRole, MAX_ATTEMPTS, MIME_BY_EXT, readImportCsv, readZipFileName, retryDelayMs } from './parse';

export interface Licence {
  name: string;
  licenceSource: string;
  licenceNote: string;
  licenceConfirmed: boolean;
}

export interface Staff {
  id: string;
  email: string;
}

interface NewItem {
  rowNumber: number;
  sku: string | null;
  productId: string | null;
  sourceUrl?: string;
  fileName?: string;
  stagedKey?: string;
  role: ImportRole;
  position: number | null;
  altText?: string;
  status: MediaImportItemStatus;
  lastError?: string;
}

const MAX_ZIP_FILES = 500;
const MAX_ZIP_TOTAL = 1024 * 1024 * 1024;
const OPEN: MediaImportItemStatus[] = ['PENDING', 'DOWNLOADING'];
const REVIEWABLE: MediaImportItemStatus[] = ['READY', 'DUPLICATE'];

/** PROCESSING while anything is queued, REVIEW while anything waits for approval, then COMPLETED. */
export function jobStatusFrom(stored: MediaImportJobStatus, counts: { status: MediaImportItemStatus; _count: number }[]): MediaImportJobStatus {
  if (stored === 'CANCELLED') return stored;
  const n = (s: MediaImportItemStatus[]) => counts.filter((c) => s.includes(c.status)).reduce((t, c) => t + c._count, 0);
  return n(OPEN) ? 'PROCESSING' : n(REVIEWABLE) ? 'REVIEW' : 'COMPLETED';
}

/**
 * Bulk image intake. Every file ends up in our own media storage (never hot-linked),
 * kept private until a staff member approves it, then linked to the product.
 * The work queue is the MediaImportItem table itself: the jobs process claims rows
 * with FOR UPDATE SKIP LOCKED, so no Redis is needed and restarts lose nothing.
 */
@Injectable()
export class MediaImportsService {
  private readonly logger = new Logger('MediaImports');

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly revalidate: RevalidateService,
  ) {}

  // ── Creating imports ──

  private checkLicence(l: Licence) {
    const errors: { path: string; message: string }[] = [];
    if (!l.name.trim() || l.name.length > 120) errors.push({ path: 'name', message: 'Give the import a name (up to 120 characters).' });
    if (l.licenceSource.trim().length < 2) errors.push({ path: 'licenceSource', message: 'Say who owns the images or granted permission.' });
    if (l.licenceNote.trim().length < 10) errors.push({ path: 'licenceNote', message: 'Describe the licence or permission (for example the agreement or email reference).' });
    if (!l.licenceConfirmed) errors.push({ path: 'licenceConfirmed', message: 'Confirm that you own these images or have permission to use them.' });
    if (errors.length) throw badRequest('LICENCE_REQUIRED', 'Images can only be imported with permission or a valid licence.', errors);
  }

  /** SKU → product. SKUs live on variants; an image belongs to the variant's product. */
  private async productsBySku(skus: string[]) {
    const unique = [...new Set(skus.filter(Boolean))];
    const variants = unique.length ? await this.prisma.variant.findMany({ where: { sku: { in: unique } }, select: { sku: true, productId: true } }) : [];
    return new Map(variants.map((v) => [v.sku.toLowerCase(), v.productId]));
  }

  private createJob(staff: Staff, source: MediaImportSource, licence: Licence) {
    return this.prisma.mediaImportJob.create({
      data: {
        name: licence.name.trim(),
        source,
        licenceSource: licence.licenceSource.trim(),
        licenceNote: licence.licenceNote.trim(),
        licenceConfirmed: true,
        createdById: staff.id,
        createdByEmail: staff.email,
      },
    });
  }

  private async saveItems(jobId: string, items: NewItem[]) {
    await this.prisma.mediaImportItem.createMany({
      data: items.map((i) => ({
        jobId,
        rowNumber: i.rowNumber,
        sku: i.sku,
        productId: i.productId,
        sourceUrl: i.sourceUrl,
        fileName: i.fileName,
        stagedKey: i.stagedKey,
        role: i.role as MediaRole,
        position: i.position,
        altText: i.altText,
        status: i.status,
        lastError: i.lastError,
      })),
    });
    await this.refreshJob(jobId);
  }

  /** CSV columns: sku, image_url, role, position (alt_text optional). */
  async createFromCsv(staff: Staff, licence: Licence, csv: Buffer, ip?: string) {
    this.checkLicence(licence);
    const { rows, error } = readImportCsv(csv.toString('utf8'), 'url');
    if (error) throw badRequest('CSV_INVALID', error);
    const products = await this.productsBySku(rows.map((r) => r.sku));
    const seen = new Map<string, number>();
    const items: NewItem[] = rows.map((r) => {
      const productId = products.get(r.sku.toLowerCase()) ?? null;
      const key = `${r.sku.toLowerCase()}|${r.url}`;
      let lastError = r.error;
      if (!lastError && !productId) lastError = `No product has the SKU "${r.sku}".`;
      if (!lastError && seen.has(key)) lastError = `Same image already listed on row ${seen.get(key)}.`;
      if (!lastError) seen.set(key, r.rowNumber);
      return {
        rowNumber: r.rowNumber,
        sku: r.sku || null,
        productId,
        sourceUrl: r.url,
        role: r.role,
        position: r.position,
        altText: r.alt,
        status: lastError ? 'FAILED' : 'PENDING',
        lastError,
      };
    });
    if (!items.length) throw badRequest('IMPORT_EMPTY', 'There is nothing to import.');
    const job = await this.createJob(staff, 'CSV', licence);
    await this.saveItems(job.id, items);
    await this.audit.log({ staff, action: 'media.import.create', entityType: 'MediaImportJob', entityId: job.id, after: { source: 'CSV', rows: items.length, licenceSource: job.licenceSource }, ip });
    return this.get(job.id);
  }

  /**
   * ZIP of images. With a manifest.csv (sku, file, role, position) inside, that decides
   * where each file goes; otherwise file names do (SKU__2.jpg, SKU__LIFESTYLE__1.jpg).
   */
  async createFromZip(staff: Staff, licence: Licence, zipBuffer: Buffer, ip?: string) {
    this.checkLicence(licence);
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipBuffer);
    } catch {
      throw badRequest('ZIP_INVALID', 'This is not a valid ZIP file.');
    }
    const entries = zip.getEntries().filter((e) => !e.isDirectory && !/(^|\/)(__MACOSX|\.)/.test(e.entryName));
    const images = entries.filter((e) => IMAGE_EXTENSIONS.includes(e.entryName.split('.').pop()?.toLowerCase() ?? ''));
    if (images.length > MAX_ZIP_FILES) throw badRequest('ZIP_TOO_MANY', `A ZIP can hold up to ${MAX_ZIP_FILES} images. Split it.`);
    // Sizes from the ZIP directory, checked before anything is unpacked (ZIP bomb guard).
    const total = images.reduce((s, e) => s + e.header.size, 0);
    if (total > MAX_ZIP_TOTAL) throw badRequest('ZIP_TOO_LARGE', 'The unpacked images add up to more than 1 GB. Split the ZIP.');

    const manifestEntry = entries.find((e) => /(^|\/)manifest\.csv$/i.test(e.entryName));
    const manifest = new Map<string, { sku: string; role: ImportRole; position: number | null; alt?: string; error?: string }>();
    if (manifestEntry) {
      const { rows, error } = readImportCsv(manifestEntry.getData().toString('utf8'), 'file');
      if (error) throw badRequest('MANIFEST_INVALID', error);
      for (const r of rows) manifest.set(r.file!.split('/').pop()!.toLowerCase(), { sku: r.sku, role: r.role, position: r.position, alt: r.alt, error: r.error });
    }

    const planned = images.map((e, i) => {
      const base = e.entryName.split('/').pop()!;
      const fromManifest = manifest.get(base.toLowerCase());
      const fromName = readZipFileName(base);
      if (manifestEntry && !fromManifest) return { e, i, base, sku: '', role: 'GALLERY' as ImportRole, position: null, error: 'Not listed in manifest.csv.' };
      if (fromManifest) return { e, i, base, ...fromManifest };
      if ('error' in fromName) return { e, i, base, sku: '', role: 'GALLERY' as ImportRole, position: null, error: fromName.error };
      return { e, i, base, ...fromName, error: undefined as string | undefined, alt: undefined as string | undefined };
    });
    if (!planned.length) throw badRequest('ZIP_EMPTY', 'The ZIP has no JPG, PNG, WebP or AVIF images.');
    const products = await this.productsBySku(planned.map((p) => p.sku));

    const job = await this.createJob(staff, 'ZIP', licence);
    const items: NewItem[] = [];
    for (const p of planned) {
      const productId = products.get(p.sku.toLowerCase()) ?? null;
      let lastError = p.error ?? (!productId ? `No product has the SKU "${p.sku}".` : undefined);
      let stagedKey: string | undefined;
      if (!lastError) {
        if (p.e.header.size > MAX_DOWNLOAD_BYTES) lastError = 'The image is larger than 25 MB.';
        else {
          stagedKey = `imports/${job.id}/${String(p.i + 1).padStart(4, '0')}-${p.base.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)}`;
          await this.media.writePrivate(stagedKey, p.e.getData());
        }
      }
      items.push({ rowNumber: p.i + 1, sku: p.sku || null, productId, fileName: p.base, stagedKey, role: p.role, position: p.position, altText: p.alt, status: lastError ? 'FAILED' : 'PENDING', lastError });
    }
    await this.saveItems(job.id, items);
    await this.audit.log({ staff, action: 'media.import.create', entityType: 'MediaImportJob', entityId: job.id, after: { source: 'ZIP', files: items.length, licenceSource: job.licenceSource }, ip });
    return this.get(job.id);
  }

  /** Files picked by hand for one product (by SKU). */
  async createManual(staff: Staff, licence: Licence, sku: string, role: ImportRole, files: { buffer: Buffer; originalname: string; size: number }[], ip?: string) {
    this.checkLicence(licence);
    if (!files.length) throw badRequest('FILE_REQUIRED', 'Choose at least one image.');
    const productId = (await this.productsBySku([sku])).get(sku.toLowerCase());
    if (!productId) throw badRequest('SKU_NOT_FOUND', `No product has the SKU "${sku}".`);
    const job = await this.createJob(staff, 'MANUAL', licence);
    const items: NewItem[] = [];
    for (const [i, f] of files.entries()) {
      const ext = f.originalname.split('.').pop()?.toLowerCase() ?? '';
      let lastError: string | undefined;
      let stagedKey: string | undefined;
      if (!IMAGE_EXTENSIONS.includes(ext)) lastError = 'Not an image file (use JPG, PNG, WebP or AVIF).';
      else if (f.size > MAX_DOWNLOAD_BYTES) lastError = 'The image is larger than 25 MB.';
      else {
        stagedKey = `imports/${job.id}/${String(i + 1).padStart(4, '0')}-${f.originalname.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)}`;
        await this.media.writePrivate(stagedKey, f.buffer);
      }
      items.push({ rowNumber: i + 1, sku, productId, fileName: f.originalname, stagedKey, role, position: null, status: lastError ? 'FAILED' : 'PENDING', lastError });
    }
    await this.saveItems(job.id, items);
    await this.audit.log({ staff, action: 'media.import.create', entityType: 'MediaImportJob', entityId: job.id, after: { source: 'MANUAL', files: items.length, sku, licenceSource: job.licenceSource }, ip });
    return this.get(job.id);
  }

  // ── Background work ──

  /** Called every few seconds by the jobs process. Returns how many items it handled. */
  async processDue(limit = 4) {
    // An item left DOWNLOADING by a crash or restart goes back in the queue.
    await this.prisma.mediaImportItem.updateMany({
      where: { status: 'DOWNLOADING', updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
      data: { status: 'PENDING' },
    });
    // Prisma stores times as UTC with no zone, while now() follows the server's zone (IST here).
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "MediaImportItem" SET status = 'DOWNLOADING', attempts = attempts + 1, "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE id IN (
        SELECT id FROM "MediaImportItem"
        WHERE status = 'PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= (now() AT TIME ZONE 'UTC'))
        ORDER BY "createdAt", "rowNumber"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id`;
    for (const { id } of claimed) {
      const item = await this.prisma.mediaImportItem.findUnique({ where: { id } });
      if (!item) continue;
      await this.processItem(item);
      // Straight after each item, so the job never says "processing" once its last item is done.
      await this.refreshJob(item.jobId);
    }
    return claimed.length;
  }

  private async processItem(item: MediaImportItem) {
    let buffer: Buffer;
    let mimeType: string;
    try {
      if (item.sourceUrl) {
        const d = await downloadImage(item.sourceUrl, { allowedHosts: config.mediaImportAllowedHosts, allowPrivate: config.mediaImportAllowPrivate });
        buffer = d.buffer;
        mimeType = d.mimeType;
      } else if (item.stagedKey) {
        buffer = await this.media.readPrivate(item.stagedKey);
        mimeType = MIME_BY_EXT[item.stagedKey.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
      } else throw new PermanentError('Nothing to import for this row.');
    } catch (err) {
      return this.fail(item, err);
    }

    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const existing = await this.prisma.mediaAsset.findFirst({ where: { contentHash, deletedAt: null }, select: { id: true } });
    if (existing) {
      await this.prisma.mediaImportItem.update({
        where: { id: item.id },
        data: { status: 'DUPLICATE', contentHash, duplicateOfMediaId: existing.id, lastError: null, nextAttemptAt: null },
      });
      await this.dropStaged(item);
      return;
    }

    try {
      const asset = await this.media.store(
        { buffer, mimetype: mimeType, size: buffer.length, originalname: item.fileName ?? `${item.sku ?? 'image'}-${item.rowNumber}` },
        { visibility: 'PRIVATE', format: 'webp', contentHash, alt: item.altText ?? undefined, maxImageMb: MAX_DOWNLOAD_BYTES / 1024 / 1024 },
      );
      await this.prisma.mediaImportItem.update({ where: { id: item.id }, data: { status: 'READY', mediaId: asset.id, contentHash, lastError: null, nextAttemptAt: null } });
      await this.dropStaged(item);
    } catch (err) {
      // Sharp or type checks failed: the file itself is the problem, so no retry.
      return this.fail(item, new PermanentError((err as Error).message || 'This file is not a valid image.'));
    }
  }

  private async fail(item: MediaImportItem, err: unknown) {
    const msg = (err as Error)?.message || 'Unknown error';
    const permanent = err instanceof PermanentError || (err as { cause?: unknown })?.cause instanceof PermanentError;
    if (!permanent && item.attempts < MAX_ATTEMPTS) {
      const wait = retryDelayMs(item.attempts);
      await this.prisma.mediaImportItem.update({
        where: { id: item.id },
        data: { status: 'PENDING', lastError: `Try ${item.attempts} of ${MAX_ATTEMPTS} failed: ${msg}`, nextAttemptAt: new Date(Date.now() + wait) },
      });
      return;
    }
    await this.prisma.mediaImportItem.update({
      where: { id: item.id },
      data: { status: 'FAILED', lastError: permanent ? msg : `Gave up after ${item.attempts} tries: ${msg}`, nextAttemptAt: null },
    });
  }

  private async dropStaged(item: Pick<MediaImportItem, 'stagedKey'>) {
    if (item.stagedKey) await this.media.deletePrivate(item.stagedKey).catch(() => undefined);
  }

  /** Stores the job's status (used for sorting and listing); reads always recompute it from the items. */
  async refreshJob(jobId: string) {
    const job = await this.prisma.mediaImportJob.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job || job.status === 'CANCELLED') return;
    const counts = await this.prisma.mediaImportItem.groupBy({ by: ['status'], where: { jobId }, _count: true });
    const status = jobStatusFrom(job.status, counts);
    await this.prisma.mediaImportJob.update({ where: { id: jobId }, data: { status, finishedAt: status === 'COMPLETED' ? new Date() : null } });
  }

  // ── Review ──

  /**
   * Links approved images to their products. A new image is moved to public storage first;
   * a duplicate links the asset we already have instead of storing a second copy.
   */
  async approve(staff: Staff, jobId: string, itemIds: string[] | 'all', ip?: string) {
    const items = await this.prisma.mediaImportItem.findMany({
      where: { jobId, status: { in: REVIEWABLE }, productId: { not: null }, ...(itemIds === 'all' ? {} : { id: { in: itemIds } }) },
      orderBy: [{ productId: 'asc' }, { position: 'asc' }, { rowNumber: 'asc' }],
    });
    let linked = 0;
    let alreadyOnProduct = 0;
    for (const item of items) {
      const mediaId = item.mediaId ?? item.duplicateOfMediaId;
      if (!mediaId) continue;
      const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
      if (!asset || asset.deletedAt) {
        await this.prisma.mediaImportItem.update({ where: { id: item.id }, data: { status: 'FAILED', lastError: 'The image was deleted before approval. Retry to fetch it again.' } });
        continue;
      }
      await this.media.publish(mediaId);
      const added = await this.prisma.$transaction(async (tx) => {
        const current = await tx.productMedia.findMany({ where: { productId: item.productId! }, orderBy: { sort: 'asc' } });
        if (current.some((m) => m.mediaId === mediaId && m.role === item.role)) return false;
        const at = item.position ? Math.min(item.position - 1, current.length) : current.length;
        // Make room at the requested position, then insert.
        for (const [i, m] of current.entries()) {
          const sort = i < at ? i : i + 1;
          if (m.sort !== sort) await tx.productMedia.update({ where: { id: m.id }, data: { sort } });
        }
        await tx.productMedia.create({ data: { productId: item.productId!, mediaId, role: item.role, sort: at } });
        return true;
      });
      if (added) linked++;
      else alreadyOnProduct++;
      await this.prisma.mediaImportItem.update({ where: { id: item.id }, data: { status: 'APPROVED', reviewedByEmail: staff.email, reviewedAt: new Date() } });
    }
    await this.refreshJob(jobId);
    if (items.length) {
      await this.audit.log({ staff, action: 'media.import.approve', entityType: 'MediaImportJob', entityId: jobId, after: { approved: items.length, linked, alreadyOnProduct }, ip });
      this.revalidate.tags(['products', 'home']);
    }
    return { approved: items.length, linked, alreadyOnProduct };
  }

  /** Rejected images that nothing else uses go to trash (kept 30 days, like other deletions). */
  async reject(staff: Staff, jobId: string, itemIds: string[], ip?: string) {
    const items = await this.prisma.mediaImportItem.findMany({ where: { jobId, id: { in: itemIds }, status: { in: ['PENDING', 'READY', 'DUPLICATE', 'FAILED'] } } });
    for (const item of items) {
      await this.prisma.mediaImportItem.update({ where: { id: item.id }, data: { status: 'REJECTED', reviewedByEmail: staff.email, reviewedAt: new Date(), nextAttemptAt: null } });
      await this.dropStaged(item);
      if (item.mediaId) {
        const asset = await this.prisma.mediaAsset.findUnique({ where: { id: item.mediaId }, include: { _count: { select: { products: true, importItems: { where: { status: 'APPROVED' } } } } } });
        if (asset && !asset.deletedAt && asset.visibility === 'PRIVATE' && !asset._count.products && !asset._count.importItems) await this.media.remove(asset.id);
      }
    }
    await this.refreshJob(jobId);
    if (items.length) await this.audit.log({ staff, action: 'media.import.reject', entityType: 'MediaImportJob', entityId: jobId, after: { rejected: items.length }, ip });
    return { rejected: items.length };
  }

  /** Puts failed rows back in the queue (only rows that still have a link or a staged file). */
  async retry(staff: Staff, jobId: string, itemIds: string[] | 'all', ip?: string) {
    const failed = await this.prisma.mediaImportItem.findMany({ where: { jobId, status: 'FAILED', ...(itemIds === 'all' ? {} : { id: { in: itemIds } }) } });
    // Rows without a product (unknown SKU) or repeated in the same file cannot succeed on a retry.
    const ok = failed.filter(
      (i) => i.productId && !/already listed on row/.test(i.lastError ?? '') && (i.sourceUrl || (i.stagedKey && existsSync(this.media.path(i.stagedKey, 'PRIVATE')))),
    );
    if (ok.length) {
      await this.prisma.mediaImportItem.updateMany({ where: { id: { in: ok.map((i) => i.id) } }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: null, lastError: null } });
      await this.refreshJob(jobId);
      await this.audit.log({ staff, action: 'media.import.retry', entityType: 'MediaImportJob', entityId: jobId, after: { retried: ok.length }, ip });
    }
    return { retried: ok.length, notRetryable: failed.length - ok.length };
  }

  // ── Reading ──

  async list(page: number) {
    const [total, jobs] = await Promise.all([
      this.prisma.mediaImportJob.count(),
      this.prisma.mediaImportJob.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * 25, take: 25 }),
    ]);
    const counts = jobs.length
      ? await this.prisma.mediaImportItem.groupBy({ by: ['jobId', 'status'], where: { jobId: { in: jobs.map((j) => j.id) } }, _count: true })
      : [];
    return {
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / 25)),
      items: jobs.map((j) => {
        const mine = counts.filter((c) => c.jobId === j.id);
        return { ...j, status: jobStatusFrom(j.status, mine), counts: Object.fromEntries(mine.map((c) => [c.status, c._count])) };
      }),
    };
  }

  async get(jobId: string, status?: MediaImportItemStatus) {
    // One snapshot, so the job, its counts and its items always agree even while the worker runs.
    const [job, statuses, items] = await this.prisma.$transaction(
      [
        this.prisma.mediaImportJob.findUnique({ where: { id: jobId } }),
        this.prisma.mediaImportItem.findMany({ where: { jobId }, select: { status: true } }),
        this.prisma.mediaImportItem.findMany({
          where: { jobId, ...(status ? { status } : {}) },
          orderBy: { rowNumber: 'asc' },
          take: 1000,
          include: { product: { select: { id: true, name: true, slug: true } }, media: { select: { width: true, height: true, bytes: true, visibility: true, storageKey: true } } },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    if (!job) throw notFound('Import');
    const tally = new Map<MediaImportItemStatus, number>();
    for (const s of statuses) tally.set(s.status, (tally.get(s.status) ?? 0) + 1);
    const counts = [...tally].map(([status, _count]) => ({ status, _count }));
    return {
      ...job,
      status: jobStatusFrom(job.status, counts),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      items: items.map((i) => ({
        ...i,
        stagedKey: undefined,
        preview: i.mediaId || i.duplicateOfMediaId ? `/media-imports/items/${i.id}/preview` : null,
        publicUrl: i.media?.visibility === 'PUBLIC' ? mediaUrl(i.media.storageKey) : null,
      })),
    };
  }

  /** The image file for the review grid (private until approved). */
  async preview(itemId: string) {
    const item = await this.prisma.mediaImportItem.findUnique({ where: { id: itemId } });
    const mediaId = item?.mediaId ?? item?.duplicateOfMediaId;
    if (!mediaId) throw notFound('Preview');
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaId } });
    if (!asset || asset.deletedAt) throw notFound('Preview');
    return { asset, data: asset.visibility === 'PRIVATE' ? await this.media.readPrivate(asset.storageKey) : null, url: mediaUrl(asset.storageKey) };
  }

  /** One line per row: what happened and why. */
  async reportCsv(jobId: string) {
    const job = await this.prisma.mediaImportJob.findUnique({ where: { id: jobId } });
    if (!job) throw notFound('Import');
    const items = await this.prisma.mediaImportItem.findMany({ where: { jobId }, orderBy: { rowNumber: 'asc' }, include: { product: { select: { name: true } } } });
    const head = ['row', 'sku', 'product', 'source', 'role', 'position', 'status', 'tries', 'error', 'media_id', 'duplicate_of', 'reviewed_by', 'reviewed_at'];
    const lines = items.map((i) =>
      [i.rowNumber, i.sku, i.product?.name, i.sourceUrl ?? i.fileName, i.role, i.position, i.status, i.attempts, i.lastError, i.mediaId, i.duplicateOfMediaId, i.reviewedByEmail, i.reviewedAt?.toISOString()]
        .map(csvCell)
        .join(','),
    );
    const meta = [`# Import: ${job.name}`, `# Licence source: ${job.licenceSource}`, `# Licence: ${job.licenceNote.replace(/\r?\n/g, ' ')}`, `# Created by ${job.createdByEmail} on ${job.createdAt.toISOString()}`];
    return { name: job.name, csv: [...meta.map(csvCell), head.join(','), ...lines].join('\r\n') + '\r\n' };
  }
}
