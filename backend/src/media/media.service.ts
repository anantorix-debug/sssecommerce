import { Injectable } from '@nestjs/common';
import { MediaVisibility } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import sharp from 'sharp';
import { config } from '../config';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

export interface UploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const MB = 1024 * 1024;

const slugify = (s: string) =>
  s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';

/**
 * Files live on the VPS disk under MEDIA_ROOT:
 *   public/  served by Nginx at /media (resized on demand by the Next.js image optimiser)
 *   private/ invoices, exports, return photos (only via authorised API routes)
 *   trash/   deleted media, kept 30 days so mistakes can be undone
 */
@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  path(key: string, visibility: MediaVisibility = 'PUBLIC') {
    const base = join(config.mediaRoot, visibility === 'PUBLIC' ? 'public' : 'private');
    const full = normalize(join(base, key));
    if (!full.startsWith(base)) throw badRequest('INVALID_PATH', 'Invalid file path.');
    return full;
  }

  async store(file: UploadFile, opts: { visibility?: MediaVisibility; alt?: string; maxImageMb?: number; allowVideo?: boolean; allowModel?: boolean } = {}) {
    const visibility = opts.visibility ?? 'PUBLIC';
    const now = new Date();
    const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const base = `${folder}/${randomUUID().slice(0, 8)}-${slugify(file.originalname)}`;
    const isGlb = file.buffer.subarray(0, 4).toString('ascii') === 'glTF';

    if (IMAGE_TYPES.includes(file.mimetype)) {
      if (file.size > (opts.maxImageMb ?? 25) * MB) throw badRequest('FILE_TOO_LARGE', `Images can be up to ${opts.maxImageMb ?? 25} MB.`);
      return this.storeImage(file, base, visibility, opts.alt);
    }
    if (VIDEO_TYPES.includes(file.mimetype) && opts.allowVideo) {
      if (file.size > 100 * MB) throw badRequest('FILE_TOO_LARGE', 'Videos can be up to 100 MB.');
      const ext = file.mimetype === 'video/webm' ? 'webm' : 'mp4';
      const key = `${base}.${ext}`;
      await this.write(this.path(key, visibility), file.buffer);
      return this.prisma.mediaAsset.create({ data: { kind: 'VIDEO', visibility, storageKey: key, mimeType: file.mimetype, bytes: file.size, altText: opts.alt } });
    }
    if (isGlb && opts.allowModel) {
      if (file.size > 50 * MB) throw badRequest('FILE_TOO_LARGE', '3D models can be up to 50 MB (aim for 3 to 5 MB).');
      const key = `${base}.glb`;
      await this.write(this.path(key, visibility), file.buffer);
      return this.prisma.mediaAsset.create({ data: { kind: 'MODEL_3D', visibility, storageKey: key, mimeType: 'model/gltf-binary', bytes: file.size, altText: opts.alt } });
    }
    throw badRequest('FILE_TYPE_NOT_ALLOWED', 'This file type is not allowed. Use JPG, PNG, WebP or AVIF images' + (opts.allowVideo ? ', MP4 or WebM video' : '') + (opts.allowModel ? ', or GLB 3D models' : '') + '.');
  }

  private async storeImage(file: UploadFile, base: string, visibility: MediaVisibility, alt?: string) {
    let image = sharp(file.buffer, { failOn: 'error' });
    let meta;
    try {
      meta = await image.metadata();
    } catch {
      throw badRequest('IMAGE_INVALID', 'This file is not a valid image.');
    }
    if (!meta.width || !meta.height) throw badRequest('IMAGE_INVALID', 'This file is not a valid image.');
    // Normalise: apply orientation, cap the long edge at 3,000 px, sRGB, and drop all metadata (EXIF, GPS).
    image = image.rotate().resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb');
    const alpha = meta.hasAlpha;
    const out = alpha ? await image.webp({ quality: 90 }).toBuffer({ resolveWithObject: true }) : await image.jpeg({ quality: 86, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    const key = `${base}.${alpha ? 'webp' : 'jpg'}`;
    await this.write(this.path(key, visibility), out.data);
    const tiny = await sharp(out.data).resize(24).blur(1.2).webp({ quality: 40 }).toBuffer();
    return this.prisma.mediaAsset.create({
      data: {
        kind: 'IMAGE',
        visibility,
        storageKey: key,
        mimeType: alpha ? 'image/webp' : 'image/jpeg',
        width: out.info.width,
        height: out.info.height,
        bytes: out.data.length,
        altText: alt,
        placeholder: `data:image/webp;base64,${tiny.toString('base64')}`,
      },
    });
  }

  private async write(path: string, data: Buffer) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  /** Soft delete: the file moves to trash/ and the record is hidden; a job purges after 30 days. */
  async remove(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) throw notFound('Media');
    const from = this.path(asset.storageKey, asset.visibility);
    if (existsSync(from)) {
      const to = join(config.mediaRoot, 'trash', asset.storageKey);
      await mkdir(dirname(to), { recursive: true });
      await rename(from, to);
    }
    await this.prisma.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async readPrivate(key: string) {
    const full = this.path(key, 'PRIVATE');
    if (!existsSync(full)) throw notFound('File');
    return readFile(full);
  }

  /** Names of the material variants (KHR_materials_variants) inside a GLB, used to map finish swatches. */
  async modelVariants(storageKey: string) {
    const full = this.path(storageKey);
    if (!existsSync(full)) return [];
    return glbVariantNames(await readFile(full));
  }
}

export function glbVariantNames(buf: Buffer): string[] {
  if (buf.subarray(0, 4).toString('ascii') !== 'glTF') return [];
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as {
    extensions?: { KHR_materials_variants?: { variants?: { name: string }[] } };
  };
  return json.extensions?.KHR_materials_variants?.variants?.map((v) => v.name) ?? [];
}
