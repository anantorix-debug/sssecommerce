// Screenshots admin pages after signing in. Needs TOTP_SECRET for the account (shown when two-factor was set up).
// Usage: TOTP_SECRET=... node scripts/screens.mjs <outDir> /orders /products ...
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.ADMIN_URL ?? 'http://localhost:3001';
const [out = 'screens', ...paths] = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret) {
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of secret.toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const d = createHmac('sha1', Buffer.from(bytes)).update(c).digest();
  const o = d[d.length - 1] & 15;
  return String((d.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
page.on('response', (r) => r.url().includes('/api/') && r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));

await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
await page.getByLabel('Email').fill(process.env.ADMIN_EMAIL ?? 'owner@aangan.example');
await page.getByLabel('Password').fill(process.env.ADMIN_PASSWORD ?? 'Aangan-Admin-2026');
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByLabel('6-digit code').fill(totp(process.env.TOTP_SECRET));
await page.getByRole('button', { name: 'Verify and sign in' }).click();
await page.getByText('Work queues').waitFor({ timeout: 20000 });

for (const p of paths.length ? paths : ['/']) {
  await page.goto(base + p, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const name = `${p.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}.png`;
  await page.screenshot({ path: join(out, name), fullPage: process.env.FULL === '1' });
  console.log(`${p} -> ${name}`);
}
if (errors.length) console.log(`Errors:\n${errors.join('\n')}`);
await browser.close();
