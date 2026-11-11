// Admin smoke test: sign in with two-factor, then take a COD order from "awaiting confirmation" to "delivered, cash recorded".
// Usage: node scripts/e2e-admin.mjs [screenshotDir]   (backend and admin must be running; uses the seeded owner account)
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.ADMIN_URL ?? 'http://localhost:3001';
const email = process.env.ADMIN_EMAIL ?? 'owner@aangan.example';
const password = process.env.ADMIN_PASSWORD ?? 'Aangan-Admin-2026';
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret) {
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of secret.toUpperCase().replace(/=+$/, '')) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const d = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const o = d[d.length - 1] & 15;
  return String((d.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const shot = async (name) => out && page.screenshot({ path: join(out, `${name}.png`) });
const step = (m) => console.log(`• ${m}`);

try {
  step('Sign in');
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit code').waitFor();
  const secretText = await page.locator('.select-all').first().textContent().catch(() => null);
  const secret = process.env.TOTP_SECRET ?? secretText?.trim();
  if (!secret) throw new Error('No TOTP secret available (set TOTP_SECRET if two-factor is already enabled).');
  console.log(`  TOTP secret: ${secret}`);
  await shot('1-2fa');
  await page.getByLabel('6-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.getByText('Work queues').waitFor({ timeout: 20000 });
  await shot('2-dashboard');

  step('Open COD orders awaiting confirmation');
  await page.goto(`${base}/orders?status=PENDING_CONFIRMATION`, { waitUntil: 'networkidle' });
  const first = page.locator('tbody tr a').first();
  const orderNumber = (await first.textContent())?.trim();
  await first.click();
  await page.getByRole('button', { name: 'Confirm COD order' }).waitFor();
  await shot('3-order');

  for (const [action, expect] of [['Confirm COD order', 'Confirmed'], ['Start preparing', 'Being prepared'], ['Mark dispatched', 'Out for delivery'], ['Mark delivered', 'Delivered']]) {
    step(`${action} (${orderNumber})`);
    await page.getByRole('button', { name: action }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: action }).click();
    await page.getByRole('heading', { level: 1 }).getByText(expect, { exact: true }).waitFor({ timeout: 20000 });
  }
  await shot('4-delivered');

  step('Record cash collected');
  await page.goto(`${base}/orders/cod`, { waitUntil: 'networkidle' });
  const row = page.locator('tr', { hasText: orderNumber });
  await row.getByRole('button', { name: 'Record cash' }).click();
  await page.getByLabel('Collected by').fill('Ravi (delivery team)');
  await page.getByRole('dialog').getByRole('button', { name: /Record/ }).click();
  await page.getByText(/recorded for/).waitFor();
  await shot('5-cod');
  console.log(`✓ ${orderNumber} confirmed, prepared, dispatched, delivered and cash recorded`);
} catch (err) {
  console.error(`✗ ${err.message}`);
  await shot('failure');
  process.exitCode = 1;
} finally {
  if (errors.length) console.log(`Page errors: ${errors.join(' | ')}`);
  await browser.close();
}
