/**
 * Image import acceptance tests. They run against the API on 127.0.0.1:4000 (development
 * database) and serve test images from a small server on this machine, so the API must be
 * started with MEDIA_IMPORT_ALLOW_PRIVATE=true (refused in production anyway).
 *
 *   MEDIA_IMPORT_ALLOW_PRIVATE=true npm run dev     (in another terminal)
 *   npm test
 *
 * Everything the tests create (a draft test product, imports, files) is removed afterwards.
 */
import { PrismaClient } from '@prisma/client';
import AdmZip from 'adm-zip';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { hashPassword, newTotpSecret } from '../src/common/crypto';

if (existsSync(resolve('.env'))) process.loadEnvFile(resolve('.env'));
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run acceptance tests in production.');

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/v1';
const ORIGIN = new URL(API).origin;
const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? './storage');
const prisma = new PrismaClient();
const RUN = randomBytes(3).toString('hex');
const SKU = `TEST-IMPORT-${RUN}`.toUpperCase();
const SKU2 = `TEST-IMPORT-B-${RUN}`.toUpperCase();

// ── Staff sign-in (same QA bot as the MVP tests) ──
const QA_EMAIL = 'qa-bot@tests.local';
const QA_PASSWORD = 'Qa-Bot-Password-2026';
const QA_TOTP = newTotpSecret();
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret: string) {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of secret) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const d = createHmac('sha1', Buffer.from(bytes)).update(c).digest();
  const o = d[d.length - 1] & 15;
  return String((d.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

class Client {
  cookies = new Map<string, string>();
  async req<T = any>(method: string, path: string, body?: unknown) {
    const isForm = body instanceof FormData;
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'X-Requested-With': 'fetch',
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookies.size ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      redirect: 'manual',
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/.test(c) || !v) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data: data as T, headers: res.headers };
  }
}

async function staffClient() {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'Owner' } });
  const data = { name: 'QA bot (tests)', roleId: role.id, passwordHash: await hashPassword(QA_PASSWORD), totpSecret: QA_TOTP, totpEnabled: true, active: true, failedLogins: 0, lockedUntil: null };
  await prisma.staffUser.upsert({ where: { email: QA_EMAIL }, update: data, create: { email: QA_EMAIL, ...data } });
  const staff = new Client();
  const login = await staff.req('POST', '/admin/auth/login', { email: QA_EMAIL, password: QA_PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  if (login.data.next === 'verify') assert.equal((await staff.req('POST', '/admin/auth/2fa/verify', { code: totp(QA_TOTP) })).status, 200);
  return staff;
}

// ── A tiny image server on this machine ──
let server: Server;
let base = '';
let flakyHits = 0;
const images: Record<string, Buffer> = {};
// A per-run tint keeps each run's pictures unique, so old files never count as duplicates.
const TINT = parseInt(RUN, 16) % 40;
async function makeImages() {
  const img = (r: number, g: number, b: number, w = 1200, h = 900) => sharp({ create: { width: w, height: h, channels: 3, background: { r: (r + TINT) % 256, g, b } } });
  images['/a.jpg'] = await img(180, 60, 40).jpeg().toBuffer();
  images['/b.png'] = await img(30, 90, 160, 800, 800).png().toBuffer();
  images['/flaky.jpg'] = await img(20, 150, 60).jpeg().toBuffer();
  images['/zip1.jpg'] = await img(200, 200, 30).jpeg().toBuffer();
  images['/zip2.png'] = await img(90, 30, 120).png().toBuffer();
  images['/manual.jpg'] = await img(10, 10, 10, 640, 480).jpeg().toBuffer();
}

const licence = { name: `Test import ${RUN}`, licenceSource: 'Supplier XYZ (test)', licenceNote: 'Written permission, email of 1 Nov 2026 (test fixture).', licenceConfirmed: 'true' };
function form(fields: Record<string, string>, files: { field: string; name: string; data: Buffer; type: string }[]) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  for (const x of files) f.append(x.field, new Blob([new Uint8Array(x.data)], { type: x.type }), x.name);
  return f;
}

async function waitSettled(admin: Client, jobId: string, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const job = (await admin.req('GET', `/admin/media-imports/${jobId}`)).data;
    const busy = job.items.some((i: any) => i.status === 'DOWNLOADING' || (i.status === 'PENDING' && (!i.nextAttemptAt || new Date(i.nextAttemptAt) <= new Date())));
    if (!busy) return job;
    if (Date.now() > end) throw new Error(`Import did not settle: ${JSON.stringify(job.counts)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
const row = (job: any, n: number) => job.items.find((i: any) => i.rowNumber === n);

let productId = '';
let product2Id = '';
let admin: Client;
const jobIds: string[] = [];

before(async () => {
  const health = await fetch(`${API}/health`).catch(() => null);
  assert.ok(health?.ok, `API is not running at ${API}. Start it with MEDIA_IMPORT_ALLOW_PRIVATE=true npm run dev.`);
  await makeImages();
  server = createServer((req, res) => {
    if (req.url === '/flaky.jpg' && ++flakyHits === 1) return res.writeHead(503).end();
    if (req.url === '/page.html') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<p>not an image</p>');
    const body = images[req.url ?? ''];
    if (!body) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': req.url!.endsWith('.png') ? 'image/png' : 'image/jpeg' }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { startsWith: 'loginIp' } }, { key: { startsWith: 'staffLogin' } }, { key: { startsWith: 'otpVerify' } }, { key: { startsWith: 'mediaImport' } }] } });

  const category = await prisma.category.findFirstOrThrow();
  const mk = (sku: string) =>
    prisma.product.create({
      data: { name: `Import test ${sku}`, slug: sku.toLowerCase(), categoryId: category.id, description: 'Temporary product for image import tests.', status: 'DRAFT', variants: { create: { sku, title: 'Default', price: 100000, isDefault: true } } },
    });
  productId = (await mk(SKU)).id;
  product2Id = (await mk(SKU2)).id;
  admin = await staffClient();
});

after(async () => {
  server?.close();
  // Remove every file and record the tests made.
  const items = await prisma.mediaImportItem.findMany({ where: { jobId: { in: jobIds } }, select: { mediaId: true, duplicateOfMediaId: true } });
  const mediaIds = [...new Set(items.map((i) => i.mediaId).filter(Boolean) as string[])];
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: mediaIds } } });
  await prisma.mediaImportJob.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.product.deleteMany({ where: { id: { in: [productId, product2Id].filter(Boolean) } } });
  for (const a of assets) for (const dir of ['public', 'private', 'trash']) await rm(join(MEDIA_ROOT, dir, a.storageKey), { force: true });
  await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } });
  for (const id of jobIds) await rm(join(MEDIA_ROOT, 'private', 'imports', id), { recursive: true, force: true });
  await prisma.staffUser.update({ where: { email: QA_EMAIL }, data: { active: false } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('image imports', () => {
  let csvJob: any;

  it('refuses an import without permission or licence details', async () => {
    const csv = Buffer.from(`sku,image_url\n${SKU},${base}/a.jpg\n`);
    const r = await admin.req('POST', '/admin/media-imports/csv', form({ name: 'No licence', licenceSource: '', licenceNote: '', licenceConfirmed: 'false' }, [{ field: 'file', name: 'x.csv', data: csv, type: 'text/csv' }]));
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'LICENCE_REQUIRED');
    assert.equal(await prisma.mediaImportJob.count({ where: { name: 'No licence' } }), 0);
  });

  it('needs a staff login', async () => {
    const r = await new Client().req('GET', '/admin/media-imports');
    assert.equal(r.status, 401);
  });

  it('imports a CSV: downloads to our disk as WebP, flags duplicates, explains failures, retries a busy server', async () => {
    const csv = [
      'sku,image_url,role,position,alt_text',
      `${SKU},${base}/a.jpg,gallery,1,Front view`, // row 2: good
      `${SKU},${base}/b.png,lifestyle,2,`, // row 3: good, PNG
      `${SKU2},${base}/a.jpg,gallery,1,`, // row 4: same picture as row 2 -> duplicate
      `NO-SUCH-SKU,${base}/a.jpg,,,`, // row 5: unknown SKU
      `${SKU},ftp://x.test/a.jpg,,,`, // row 6: bad link
      `${SKU},${base}/page.html,,,`, // row 7: not an image
      `${SKU},${base}/missing.jpg,,,`, // row 8: 404
      `${SKU},${base}/flaky.jpg,detail,3,`, // row 9: first answer 503, then fine
      `${SKU},${base}/a.jpg,gallery,1,`, // row 10: same row twice in one file
    ].join('\n');
    const r = await admin.req('POST', '/admin/media-imports/csv', form(licence, [{ field: 'file', name: 'images.csv', data: Buffer.from(csv), type: 'text/csv' }]));
    assert.equal(r.status, 201, JSON.stringify(r.data));
    jobIds.push(r.data.id);
    csvJob = await waitSettled(admin, r.data.id);

    assert.equal(row(csvJob, 2).status, 'READY');
    assert.equal(row(csvJob, 3).status, 'READY');
    assert.equal(row(csvJob, 4).status, 'DUPLICATE');
    assert.equal(row(csvJob, 4).duplicateOfMediaId, row(csvJob, 2).mediaId);
    assert.match(row(csvJob, 5).lastError, /No product has the SKU/);
    assert.match(row(csvJob, 6).lastError, /http/);
    assert.match(row(csvJob, 7).lastError, /not an image/);
    assert.match(row(csvJob, 8).lastError, /404/);
    assert.equal(row(csvJob, 8).attempts, 1, 'a 404 is not retried');
    assert.equal(row(csvJob, 9).status, 'PENDING', 'busy server is queued again');
    assert.match(row(csvJob, 9).lastError, /Try 1 of 3/);
    assert.ok(new Date(row(csvJob, 9).nextAttemptAt) > new Date());
    assert.match(row(csvJob, 10).lastError, /already listed on row 2/);
    assert.equal(csvJob.status, 'PROCESSING');

    // The file is real image data on our disk, private until approved, and WebP.
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: row(csvJob, 2).mediaId } });
    assert.equal(asset.visibility, 'PRIVATE');
    assert.equal(asset.mimeType, 'image/webp');
    assert.match(asset.storageKey, /\.webp$/);
    assert.equal(asset.contentHash?.length, 64);
    assert.equal(asset.altText, 'Front view');
    const onDisk = join(MEDIA_ROOT, 'private', asset.storageKey);
    assert.ok(existsSync(onDisk), 'file saved on disk');
    assert.equal((await sharp(await readFile(onDisk)).metadata()).format, 'webp');
    assert.ok(!existsSync(join(MEDIA_ROOT, 'public', asset.storageKey)), 'not public before approval');
    assert.equal((await fetch(`${ORIGIN}/media/${asset.storageKey}`)).status, 404, 'storefront cannot load it yet');
    assert.equal(await prisma.productMedia.count({ where: { productId } }), 0, 'nothing linked before approval');

    // Staff can preview it.
    const pv = await admin.req('GET', `/admin/media-imports/items/${row(csvJob, 2).id}/preview`);
    assert.equal(pv.status, 200);
    assert.equal(pv.headers.get('content-type'), 'image/webp');

    // Retry window reached: the busy image now downloads.
    await prisma.mediaImportItem.update({ where: { id: row(csvJob, 9).id }, data: { nextAttemptAt: new Date() } });
    csvJob = await waitSettled(admin, csvJob.id);
    assert.equal(row(csvJob, 9).status, 'READY');
    assert.equal(row(csvJob, 9).attempts, 2);
    assert.equal(csvJob.status, 'REVIEW');
  });

  it('retries failed rows on request, and keeps rows that cannot be fixed failed', async () => {
    const r = await admin.req('POST', `/admin/media-imports/${csvJob.id}/retry`, { itemIds: 'all' });
    assert.equal(r.status, 201);
    assert.equal(r.data.notRetryable, 2, 'unknown SKU and same-row-twice have no product to retry for');
    csvJob = await waitSettled(admin, csvJob.id);
    assert.equal(row(csvJob, 8).status, 'FAILED');
    assert.equal(row(csvJob, 8).attempts, 1);
  });

  it('approves: files move to public storage, link to the product in position, and load from our own server', async () => {
    const r = await admin.req('POST', `/admin/media-imports/${csvJob.id}/approve`, { itemIds: 'all' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.approved, 4);
    const links = await prisma.productMedia.findMany({ where: { productId }, orderBy: { sort: 'asc' }, include: { media: true } });
    assert.deepEqual(
      links.map((l) => [l.mediaId, l.role, l.sort]),
      [
        [row(csvJob, 2).mediaId, 'GALLERY', 0],
        [row(csvJob, 3).mediaId, 'LIFESTYLE', 1],
        [row(csvJob, 9).mediaId, 'DETAIL', 2],
      ],
    );
    // The duplicate links the existing picture to the second product, no second copy stored.
    const links2 = await prisma.productMedia.findMany({ where: { productId: product2Id } });
    assert.deepEqual(links2.map((l) => l.mediaId), [row(csvJob, 2).mediaId]);
    assert.equal(row(csvJob, 4).mediaId, null);

    for (const l of links) {
      assert.equal(l.media.visibility, 'PUBLIC');
      assert.ok(existsSync(join(MEDIA_ROOT, 'public', l.media.storageKey)));
      assert.ok(!existsSync(join(MEDIA_ROOT, 'private', l.media.storageKey)));
      const res = await fetch(`${ORIGIN}/media/${l.media.storageKey}`);
      assert.equal(res.status, 200, `served from our server: /media/${l.media.storageKey}`);
      assert.equal(res.headers.get('content-type'), 'image/webp');
    }
    const job = (await admin.req('GET', `/admin/media-imports/${csvJob.id}`)).data;
    assert.equal(job.status, 'COMPLETED');

    // Approving again changes nothing.
    const again = await admin.req('POST', `/admin/media-imports/${csvJob.id}/approve`, { itemIds: 'all' });
    assert.equal(again.data.approved, 0);
    assert.equal(await prisma.productMedia.count({ where: { productId } }), 3);
  });

  it('imports a ZIP by file name, and a rejected image goes to trash', async () => {
    const zip = new AdmZip();
    zip.addFile(`${SKU}__2.jpg`, images['/zip1.jpg']);
    zip.addFile(`photos/${SKU}__DETAIL__1.png`, images['/zip2.png']);
    zip.addFile('UNKNOWN-SKU__1.jpg', images['/zip1.jpg']);
    zip.addFile('readme.txt', Buffer.from('ignored'));
    const r = await admin.req('POST', '/admin/media-imports/zip', form(licence, [{ field: 'file', name: 'photos.zip', data: zip.toBuffer(), type: 'application/zip' }]));
    assert.equal(r.status, 201, JSON.stringify(r.data));
    jobIds.push(r.data.id);
    assert.equal(r.data.items.length, 3, 'the text file is skipped');
    const job = await waitSettled(admin, r.data.id);
    const byName = (n: string) => job.items.find((i: any) => i.fileName === n);
    assert.equal(byName(`${SKU}__2.jpg`).status, 'READY');
    assert.equal(byName(`${SKU}__2.jpg`).position, 2);
    assert.equal(byName(`${SKU}__DETAIL__1.png`).role, 'DETAIL');
    assert.match(byName('UNKNOWN-SKU__1.jpg').lastError, /No product has the SKU/);
    assert.ok(!existsSync(join(MEDIA_ROOT, 'private', 'imports', r.data.id, '0001-' + `${SKU}__2.jpg`)), 'staged file removed after processing');

    const rejected = byName(`${SKU}__DETAIL__1.png`);
    const rj = await admin.req('POST', `/admin/media-imports/${job.id}/reject`, { itemIds: [rejected.id] });
    assert.equal(rj.data.rejected, 1);
    const trashed = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: rejected.mediaId } });
    assert.ok(trashed.deletedAt, 'rejected image is deleted');
    assert.ok(existsSync(join(MEDIA_ROOT, 'trash', trashed.storageKey)), 'kept in trash for 30 days');

    const ap = await admin.req('POST', `/admin/media-imports/${job.id}/approve`, { itemIds: [byName(`${SKU}__2.jpg`).id] });
    assert.equal(ap.data.linked, 1);
    const order = await prisma.productMedia.findMany({ where: { productId }, orderBy: { sort: 'asc' } });
    assert.equal(order[1].mediaId, byName(`${SKU}__2.jpg`).mediaId, 'inserted at position 2');
    assert.deepEqual(order.map((o) => o.sort), [0, 1, 2, 3]);
  });

  it('imports images uploaded by hand for one SKU', async () => {
    const r = await admin.req('POST', '/admin/media-imports/manual', form({ ...licence, sku: SKU2, role: 'LIFESTYLE' }, [{ field: 'files', name: 'room.jpg', data: images['/manual.jpg'], type: 'image/jpeg' }]));
    assert.equal(r.status, 201, JSON.stringify(r.data));
    jobIds.push(r.data.id);
    const job = await waitSettled(admin, r.data.id);
    assert.equal(job.items[0].status, 'READY');
    const bad = await admin.req('POST', '/admin/media-imports/manual', form({ ...licence, sku: 'NOPE-404', role: 'GALLERY' }, [{ field: 'files', name: 'x.jpg', data: images['/manual.jpg'], type: 'image/jpeg' }]));
    assert.equal(bad.status, 400);
    assert.equal(bad.data.code, 'SKU_NOT_FOUND');
  });

  it('gives a CSV report with the licence and every row', async () => {
    const r = await admin.req('GET', `/admin/media-imports/${csvJob.id}/report.csv`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /text\/csv/);
    const text = (r.data as Buffer).toString('utf8');
    assert.match(text, /Licence source: Supplier XYZ/);
    assert.match(text, /row,sku,product,source,role,position,status/);
    for (const s of ['APPROVED', 'FAILED']) assert.ok(text.includes(s), s);
    assert.equal(text.trim().split('\r\n').length, 4 + 1 + 9, 'notes, header, 9 rows');
  });

  it('lists imports with counts', async () => {
    const r = await admin.req('GET', '/admin/media-imports');
    assert.equal(r.status, 200);
    const mine = r.data.items.find((j: any) => j.id === csvJob.id);
    assert.equal(mine.counts.APPROVED, 4);
  });
});
