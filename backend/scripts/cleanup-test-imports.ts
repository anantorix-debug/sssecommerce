/**
 * Removes leftovers from interrupted image-import test runs (development database only).
 *   npx tsx scripts/cleanup-test-imports.ts          dry run: lists what would be removed
 *   npx tsx scripts/cleanup-test-imports.ts --apply  removes it
 * Matches: products with slug test-import-* / test-*, import jobs created by qa-bot@tests.local,
 * media from those jobs or whose storageKey contains "test-import-", private imported media that
 * no product or import row points to, and empty folders under storage/private/imports.
 * A media file still linked to a non-test product is never removed.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { readdir, rm, rmdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

if (existsSync(resolve('.env'))) process.loadEnvFile(resolve('.env'));
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production.');

const prisma = new PrismaClient();
const MEDIA_ROOT = resolve(process.env.MEDIA_ROOT ?? './storage');
const apply = process.argv.includes('--apply');

async function main() {
  const products = await prisma.product.findMany({
    where: { OR: [{ slug: { startsWith: 'test-import-' } }, { slug: { startsWith: 'test-' } }] },
    select: { id: true, slug: true },
  }).then(async (list) => Promise.all(list.map(async (p) => ({ ...p, orders: await prisma.orderItem.count({ where: { productId: p.id } }) }))));
  const testProductIds = new Set(products.map((p) => p.id));
  const jobs = await prisma.mediaImportJob.findMany({ where: { createdByEmail: 'qa-bot@tests.local' }, select: { id: true, name: true } });
  const items = await prisma.mediaImportItem.findMany({ where: { jobId: { in: jobs.map((j) => j.id) } }, select: { mediaId: true } });
  const assets = await prisma.mediaAsset.findMany({
    where: {
      OR: [
        { id: { in: items.map((i) => i.mediaId).filter((x): x is string => Boolean(x)) } },
        { storageKey: { contains: 'test-import-' } },
        // Orphans of an interrupted run: imported (hashed) and still private, but no product and no import row point to them.
        { visibility: 'PRIVATE', contentHash: { not: null }, products: { none: {} }, importItems: { none: {} } },
      ],
    },
    select: { id: true, storageKey: true, products: { select: { productId: true } } },
  });
  const safeAssets = assets.filter((a) => a.products.every((l) => testProductIds.has(l.productId)));
  const keptAssets = assets.filter((a) => !safeAssets.includes(a));

  console.log(`${apply ? 'Removing' : 'Would remove'}:`);
  console.log(`  products (${products.length}): ${products.map((p) => p.slug + (p.orders ?` [HAS ORDERS, skipped]` : '')).join(', ') || '-'}`);
  console.log(`  import jobs by qa-bot (${jobs.length}): ${jobs.map((j) => j.name).join(', ') || '-'}`);
  console.log(`  media assets (${safeAssets.length}): ${safeAssets.map((a) => a.storageKey).join(', ') || '-'}`);
  if (keptAssets.length) console.log(`  KEPT (linked to a real product): ${keptAssets.map((a) => a.storageKey).join(', ')}`);

  const importsDir = join(MEDIA_ROOT, 'private', 'imports');
  const folders = existsSync(importsDir) ? await readdir(importsDir, { withFileTypes: true }) : [];
  const emptyOrOrphan: string[] = [];
  const jobIdsAlive = new Set((await prisma.mediaImportJob.findMany({ select: { id: true } })).map((j) => j.id));
  const deletingJobs = new Set(jobs.map((j) => j.id));
  for (const f of folders.filter((d) => d.isDirectory())) {
    const files = await readdir(join(importsDir, f.name));
    if (files.length === 0 || deletingJobs.has(f.name) || !jobIdsAlive.has(f.name)) emptyOrOrphan.push(`${f.name} (${files.length} file${files.length === 1 ? '' : 's'})`);
  }
  console.log(`  folders under storage/private/imports (${emptyOrOrphan.length}): ${emptyOrOrphan.join(', ') || '-'}`);

  if (!apply) return console.log('\nDry run only. Add --apply to remove.');

  await prisma.mediaImportJob.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
  await prisma.product.deleteMany({ where: { id: { in: products.filter((p) => !p.orders).map((p) => p.id) } } });
  for (const a of safeAssets) for (const dir of ['public', 'private', 'trash']) await rm(join(MEDIA_ROOT, dir, a.storageKey), { force: true });
  await prisma.mediaAsset.deleteMany({ where: { id: { in: safeAssets.map((a) => a.id) } } });
  for (const f of emptyOrOrphan) await rm(join(importsDir, f.split(' ')[0]), { recursive: true, force: true });
  // Tidy empty year/month folders left behind in public/private/trash.
  for (const dir of ['public', 'private', 'trash']) await pruneEmpty(join(MEDIA_ROOT, dir), true);
  console.log('Done.');
}

async function pruneEmpty(dir: string, isRoot = false): Promise<boolean> {
  if (!existsSync(dir)) return false;
  const entries = await readdir(dir, { withFileTypes: true });
  let empty = true;
  for (const e of entries) {
    if (e.isDirectory()) { if (!(await pruneEmpty(join(dir, e.name)))) empty = false; } else empty = false;
  }
  if (empty && !isRoot) { await rmdir(dir).catch(() => undefined); return true; }
  return empty;
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
