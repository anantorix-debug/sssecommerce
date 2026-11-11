/**
 * MVP acceptance tests. They run against the API on 127.0.0.1:4000 and the development
 * database (seeded with `npm run db:seed`). They create real orders, so never point them at production.
 *
 *   npm run dev      (in another terminal)
 *   npm test
 */
import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { hashPassword, newTotpSecret } from '../src/common/crypto';

if (existsSync(resolve('.env'))) process.loadEnvFile(resolve('.env'));
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run acceptance tests in production.');

const API = process.env.API_URL ?? 'http://127.0.0.1:4000/v1';
const prisma = new PrismaClient();
const PIN = '560038';

/** A tiny HTTP client with its own cookie jar, like one browser. */
class Client {
  cookies = new Map<string, string>();
  async req<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'X-Requested-With': 'fetch',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookies.size ? { Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/.test(c) || !v) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data: data as T, headers: res.headers };
  }
}

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

const address = (name: string, phone: string) => ({ name, phone, line1: '22, 12th Main, HAL 2nd Stage', city: 'Bengaluru', state: 'Karnataka', pincode: PIN, floor: 1, hasLift: true });
const phone = () => `98${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function variantOf(slug: string) {
  const v = await prisma.variant.findFirst({ where: { product: { slug }, active: true }, orderBy: { price: 'asc' } });
  assert.ok(v, `variant for ${slug}`);
  return v;
}

/** Fills a fresh cart and places a cash-on-delivery order. */
async function placeCod(client: Client, variantId: string, contact: { email: string; name: string; phone: string }, qty = 1) {
  await client.req('POST', '/store/cart/items', { variantId, quantity: qty });
  const cart = await client.req('PUT', '/store/cart/pincode', { pincode: PIN });
  return client.req('POST', '/store/checkout/orders', {
    contact,
    address: address(contact.name, contact.phone),
    paymentMethod: 'COD',
    expectedTotal: cart.data.summary.total,
    acceptTerms: true,
  }, { 'Idempotency-Key': randomBytes(16).toString('hex') });
}

// The tests sign in as their own QA staff member (never the real owner, whose two-factor setup must not change).
const QA_EMAIL = 'qa-bot@tests.local';
const QA_PASSWORD = 'Qa-Bot-Password-2026';
const QA_TOTP = newTotpSecret();

async function ensureQaStaff() {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: 'Owner' } });
  const data = { name: 'QA bot (tests)', roleId: role.id, passwordHash: await hashPassword(QA_PASSWORD), totpSecret: QA_TOTP, totpEnabled: true, active: true, failedLogins: 0, lockedUntil: null };
  await prisma.staffUser.upsert({ where: { email: QA_EMAIL }, update: data, create: { email: QA_EMAIL, ...data } });
}

async function staffClient() {
  const staff = new Client();
  const login = await staff.req('POST', '/admin/auth/login', { email: QA_EMAIL, password: QA_PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  if (login.data.next === 'verify') {
    const r = await staff.req('POST', '/admin/auth/2fa/verify', { code: totp(QA_TOTP) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  return staff;
}

// Many tests place cash-on-delivery orders, so COD is switched on for the run and restored afterwards.
let paymentMethodsBefore: { online: boolean; cod: boolean } | null = null;

before(async () => {
  const health = await fetch(`${API}/health`).catch(() => null);
  assert.ok(health?.ok, `API is not running at ${API}. Start it with "npm run dev".`);
  // Fresh counters for limits these tests exercise.
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { startsWith: 'otpRequest' } }, { key: { startsWith: 'loginIp' } }, { key: { startsWith: 'otpVerify' } }, { key: { startsWith: 'placeOrder' } }, { key: { startsWith: 'reviewSubmit' } }, { key: { startsWith: 'returnRequest' } }, { key: { startsWith: 'staffLogin' } }] } });
  await ensureQaStaff();
  const admin = await staffClient();
  const s = (await admin.req('GET', '/admin/settings')).data;
  paymentMethodsBefore = { online: s.settings.payments.online && s.environment.onlinePayments, cod: s.settings.cod.enabled };
  const r = await admin.req('PUT', '/admin/payment-methods', { online: paymentMethodsBefore.online, cod: true });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});

after(async () => {
  if (paymentMethodsBefore) {
    const restore = paymentMethodsBefore;
    const viaApi = await staffClient()
      .then((admin) => admin.req('PUT', '/admin/payment-methods', restore))
      .then((r) => r.status === 200)
      .catch(() => false);
    if (!viaApi) {
      // API unreachable: write the settings directly (the API picks them up within 30 seconds).
      const cod = await prisma.setting.findUnique({ where: { key: 'cod' } });
      await prisma.setting.upsert({ where: { key: 'cod' }, update: { value: { ...((cod?.value as object) ?? {}), enabled: restore.cod } }, create: { key: 'cod', value: { enabled: restore.cod, maxOrderValue: 5_000_000, maxOpenOrders: 3 } } });
      await prisma.setting.upsert({ where: { key: 'payments' }, update: { value: { online: restore.online } }, create: { key: 'payments', value: { online: restore.online } } });
    }
  }
  await prisma.staffUser.update({ where: { email: QA_EMAIL }, data: { active: false } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe('quarantine', () => {
  it('refuses to start with a live Razorpay key while PAYMENTS_MODE=test', () => {
    const r = spawnSync('npx', ['tsx', '-e', "require('./src/config')"], {
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, PAYMENTS_MODE: 'test', RAZORPAY_KEY_ID: 'rzp_live_abc123', RAZORPAY_KEY_SECRET: 'x' },
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr + r.stdout, /live Razorpay key/);
  });

  it('never offers EMI', async () => {
    const s = await new Client().req('GET', '/store/settings');
    assert.equal(s.data.payments.emi, false);
  });
});

describe('stock', () => {
  it('sells the last unit exactly once when 8 customers check out at the same time', async () => {
    const v = await variantOf('mysore-side-table');
    const before = await prisma.inventoryLevel.findMany({ where: { variantId: v.id } });
    const blr = await prisma.location.findFirstOrThrow({ where: { city: 'Bengaluru' } });
    try {
      for (const l of before) await prisma.inventoryLevel.update({ where: { id: l.id }, data: { onHand: l.locationId === blr.id ? l.reserved + 1 : l.reserved } });
      const buyers = Array.from({ length: 8 }, (_, i) => ({ client: new Client(), contact: { email: `race${i}.${Date.now()}@example.com`, name: `Race Tester ${i}`, phone: phone() } }));
      // Fill all carts first, then fire the orders together.
      for (const b of buyers) {
        await b.client.req('POST', '/store/cart/items', { variantId: v.id, quantity: 1 });
        await b.client.req('PUT', '/store/cart/pincode', { pincode: PIN });
      }
      const totals = await Promise.all(buyers.map((b) => b.client.req('GET', '/store/cart')));
      const results = await Promise.all(
        buyers.map((b, i) =>
          b.client.req('POST', '/store/checkout/orders', { contact: b.contact, address: address(b.contact.name, b.contact.phone), paymentMethod: 'COD', expectedTotal: totals[i].data.summary.total, acceptTerms: true }, { 'Idempotency-Key': randomBytes(16).toString('hex') }),
        ),
      );
      const ok = results.filter((r) => r.status === 201);
      const refused = results.filter((r) => r.status === 409);
      assert.equal(ok.length, 1, `exactly one order should succeed, got ${ok.length}: ${results.map((r) => r.status).join(',')}`);
      assert.equal(refused.length, 7);
      for (const r of refused) assert.equal(r.data.code, 'STOCK_INSUFFICIENT');
      const after = await prisma.inventoryLevel.findMany({ where: { variantId: v.id } });
      assert.ok(after.every((l) => l.onHand - l.reserved >= 0), 'stock never goes negative');
    } finally {
      // Put stock back as it was (never below what is currently held for open orders).
      for (const l of before) {
        const now = await prisma.inventoryLevel.findUniqueOrThrow({ where: { id: l.id } });
        await prisma.inventoryLevel.update({ where: { id: l.id }, data: { onHand: Math.max(l.onHand, now.reserved) } });
      }
    }
  });

  it('returns the same order when checkout is submitted twice with one idempotency key', async () => {
    const v = await variantOf('kalash-glass-vase-set');
    const c = new Client();
    await c.req('POST', '/store/cart/items', { variantId: v.id, quantity: 1 });
    const cart = await c.req('PUT', '/store/cart/pincode', { pincode: PIN });
    const key = randomBytes(16).toString('hex');
    const contact = { email: `twice.${Date.now()}@example.com`, name: 'Double Click', phone: phone() };
    const body = { contact, address: address(contact.name, contact.phone), paymentMethod: 'COD', expectedTotal: cart.data.summary.total, acceptTerms: true };
    const [a, b] = await Promise.all([c.req('POST', '/store/checkout/orders', body, { 'Idempotency-Key': key }), c.req('POST', '/store/checkout/orders', body, { 'Idempotency-Key': key })]);
    const numbers = [a, b].filter((r) => r.status === 201).map((r) => r.data.orderNumber);
    assert.ok(numbers.length >= 1);
    assert.equal(new Set(numbers).size, 1, 'both submissions resolve to one order');
    assert.equal(await prisma.order.count({ where: { idempotencyKey: key } }), 1);
  });
});

describe('checkout rules', () => {
  it('blocks an unserviceable pincode before payment', async () => {
    const v = await variantOf('kalash-glass-vase-set');
    const c = new Client();
    const cart = await c.req('POST', '/store/cart/items', { variantId: v.id, quantity: 1 });
    const contact = { email: 'nowhere@example.com', name: 'Far Away', phone: phone() };
    const r = await c.req('POST', '/store/checkout/orders', { contact, address: { ...address(contact.name, contact.phone), pincode: '999999' }, paymentMethod: 'COD', expectedTotal: cart.data.summary.total, acceptTerms: true }, { 'Idempotency-Key': randomBytes(16).toString('hex') });
    assert.equal(r.status, 422);
    assert.equal(r.data.code, 'PINCODE_UNSERVICEABLE');
  });

  it('refuses cash on delivery above the order value limit', async () => {
    const v = await variantOf('sahyadri-chesterfield-sofa');
    const r = await placeCod(new Client(), v.id, { email: `big.${Date.now()}@example.com`, name: 'Big Spender', phone: phone() });
    assert.equal(r.status, 422);
    assert.equal(r.data.code, 'COD_UNAVAILABLE');
    assert.match(r.data.detail, /up to/);
  });

  it('refuses cash on delivery to a pincode without COD', async () => {
    const pin = await prisma.pincode.findFirst({ where: { codAvailable: false, active: true } });
    assert.ok(pin, 'seed has a pincode without COD');
    const v = await variantOf('kalash-glass-vase-set');
    const c = new Client();
    await c.req('POST', '/store/cart/items', { variantId: v.id, quantity: 1 });
    const cart = await c.req('PUT', '/store/cart/pincode', { pincode: pin.pincode });
    const contact = { email: `nocod.${Date.now()}@example.com`, name: 'No Cash', phone: phone() };
    const r = await c.req('POST', '/store/checkout/orders', { contact, address: { ...address(contact.name, contact.phone), city: pin.city, state: pin.state, pincode: pin.pincode }, paymentMethod: 'COD', expectedTotal: cart.data.summary.total, acceptTerms: true }, { 'Idempotency-Key': randomBytes(16).toString('hex') });
    assert.equal(r.status, 422);
    assert.equal(r.data.code, 'COD_UNAVAILABLE');
  });

  it('rejects a total the server did not calculate', async () => {
    const v = await variantOf('kalash-glass-vase-set');
    const c = new Client();
    await c.req('POST', '/store/cart/items', { variantId: v.id, quantity: 1 });
    await c.req('PUT', '/store/cart/pincode', { pincode: PIN });
    const contact = { email: 'cheap@example.com', name: 'Price Tamper', phone: phone() };
    const r = await c.req('POST', '/store/checkout/orders', { contact, address: address(contact.name, contact.phone), paymentMethod: 'COD', expectedTotal: 100, acceptTerms: true }, { 'Idempotency-Key': randomBytes(16).toString('hex') });
    assert.equal(r.status, 409);
    assert.equal(r.data.code, 'PRICE_CHANGED');
  });
});

describe('rate limits', () => {
  it('answers the 4th email code request in 10 minutes with 429 and Retry-After', async () => {
    const c = new Client();
    const email = `otp.${Date.now()}@example.com`;
    for (let i = 0; i < 3; i++) assert.equal((await c.req('POST', '/store/auth/otp/request', { email })).status, 202);
    const fourth = await c.req('POST', '/store/auth/otp/request', { email });
    assert.equal(fourth.status, 429);
    assert.equal(fourth.data.code, 'RATE_LIMITED');
    assert.ok(Number(fourth.headers.get('retry-after')) > 0);
    assert.match(fourth.data.detail, /Too many tries/);
  });

  it('never rate-limits Razorpay webhooks (signature is the guard)', async () => {
    const statuses = await Promise.all(Array.from({ length: 40 }, () => fetch(`${API}/webhooks/razorpay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'bad' }, body: '{}' }).then((r) => r.status)));
    assert.ok(statuses.every((s) => s === 400), `expected signature errors, got ${[...new Set(statuses)].join(',')}`);
  });
});

describe('order lifecycle, invoice, review and return', () => {
  const priya = new Client();
  const arjun = new Client();
  let staff: Client;
  let orderNumber = '';
  let orderId = '';
  let itemId = '';
  let variantId = '';

  before(async () => {
    assert.equal((await priya.req('POST', '/store/auth/login', { email: 'priya@example.com', password: 'Customer-2026' })).status, 201);
    assert.equal((await arjun.req('POST', '/store/auth/login', { email: 'arjun@example.com', password: 'Customer-2026' })).status, 201);
    staff = await staffClient();
  });

  it('takes a COD order from placed to delivered, with emails and a GST invoice', async () => {
    variantId = (await variantOf('diya-table-lamp')).id;
    const placed = await placeCod(priya, variantId, { email: 'priya@example.com', name: 'Priya Raman', phone: '9845012345' });
    assert.equal(placed.status, 201, JSON.stringify(placed.data));
    assert.equal(placed.data.status, 'PENDING_CONFIRMATION');
    orderNumber = placed.data.orderNumber;
    const list = await staff.req('GET', `/admin/orders?q=${orderNumber}`);
    orderId = list.data.items[0].id;

    // Dispatch is impossible before staff confirm a COD order.
    let detail = await staff.req('GET', `/admin/orders/${orderId}`);
    assert.equal(detail.data.allowed.ship, false);

    for (const action of ['confirm_cod', 'start_processing', 'ship', 'deliver']) {
      const r = await staff.req('POST', `/admin/orders/${orderId}/transition`, { action, version: detail.data.version });
      assert.equal(r.status, 200, `${action}: ${JSON.stringify(r.data)}`);
      detail = r;
    }
    assert.equal(detail.data.status, 'DELIVERED');
    assert.ok(detail.data.invoice?.number.match(/^SSS\/\d{4}-\d{2}\/\d{5}$/), 'invoice number follows the financial-year series');

    const emails = await prisma.emailOutbox.findMany({ where: { to: 'priya@example.com', subject: { contains: orderNumber } } });
    for (const s of ['received', 'confirmed', 'on its way', 'delivered']) assert.ok(emails.some((e) => e.subject.includes(s)), `email "${s}" queued`);

    const pdf = await priya.req('GET', `/store/orders/${orderNumber}/invoice`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(Buffer.from(pdf.data as ArrayBuffer).subarray(0, 4).toString(), '%PDF');

    const cod = detail.data.payments.find((p: { method: string }) => p.method === 'COD');
    const collected = await staff.req('POST', `/admin/cod/${cod.id}/collect`, { amount: cod.amount, collectedBy: 'Test Delivery Team' });
    assert.equal(collected.status, 200);
    itemId = detail.data.items[0].id;
  });

  it('lets only the buyer review a delivered item, and only after moderation does it show', async () => {
    const foreign = await arjun.req('GET', `/me/reviews/eligible/${itemId}`);
    assert.equal(foreign.status, 404);
    const r = await priya.req('POST', '/me/reviews', { orderItemId: itemId, rating: 5, title: 'Lovely warm light', body: 'Exactly the soft glow I wanted beside my reading chair. Well made.', photos: [] });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.status, 'PENDING');
    const again = await priya.req('POST', '/me/reviews', { orderItemId: itemId, rating: 4, title: 'Again', body: 'Trying to review the same item twice.', photos: [] });
    assert.equal(again.status, 409);
    const page = await new Client().req('GET', '/store/products/diya-table-lamp');
    assert.ok(!page.data.reviews.some((x: { id: string }) => x.id === r.data.id), 'pending review is not public');
    await staff.req('POST', `/admin/reviews/${r.data.id}/moderate`, { status: 'APPROVED' });
    const after = await prisma.review.findUniqueOrThrow({ where: { id: r.data.id } });
    assert.equal(after.status, 'APPROVED');
  });

  it('runs a return from request to refund and puts the item back in stock', async () => {
    const ret = await priya.req('POST', `/me/orders/${orderNumber}/returns`, { items: [{ orderItemId: itemId, quantity: 1 }], reason: 'Changed my mind', photos: [], resolution: 'REFUND' });
    assert.equal(ret.status, 201, JSON.stringify(ret.data));
    const id = ret.data.id;
    const stockBefore = (await prisma.inventoryLevel.findMany({ where: { variantId } })).reduce((s, l) => s + l.onHand, 0);

    const pickup = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    for (const step of [{ to: 'PICKUP_SCHEDULED', pickupDate: pickup }, { to: 'RECEIVED' }, { to: 'INSPECTED', inspectionPass: true, restock: true }, { to: 'REFUNDED', refundMethod: 'UPI', payoutDetails: 'priya@okicici' }]) {
      const r = await staff.req('POST', `/admin/returns/${id}/advance`, step);
      assert.equal(r.status, 200, `${step.to}: ${JSON.stringify(r.data)}`);
    }
    const stockAfter = (await prisma.inventoryLevel.findMany({ where: { variantId } })).reduce((s, l) => s + l.onHand, 0);
    assert.equal(stockAfter, stockBefore + 1, 'passed inspection restocks the unit');

    const refunds = await staff.req('GET', '/admin/refunds?status=REQUESTED');
    const refund = refunds.data.find((r: { returnRequest: { returnNumber: string } | null }) => r.returnRequest?.returnNumber === ret.data.returnNumber);
    assert.ok(refund, 'a COD refund is waiting to be paid out');
    const paid = await staff.req('POST', `/admin/refunds/${refund.id}/process`, { reference: 'UPI 6021 4410 9912' });
    assert.equal(paid.status, 200, JSON.stringify(paid.data));
    assert.equal(paid.data.status, 'PROCESSED');

    const mine = await priya.req('GET', `/me/returns/${id}`);
    assert.equal(mine.data.status, 'REFUNDED');
  });

  it('keeps a full delivery slot from being booked', async () => {
    const v = await variantOf('kalash-glass-vase-set');
    const placed = await placeCod(priya, v.id, { email: 'priya@example.com', name: 'Priya Raman', phone: '9845012345' });
    assert.equal(placed.status, 201, JSON.stringify(placed.data));
    const id = (await staff.req('GET', `/admin/orders?q=${placed.data.orderNumber}`)).data.items[0].id;
    const d = await staff.req('GET', `/admin/orders/${id}`);
    await staff.req('POST', `/admin/orders/${id}/transition`, { action: 'confirm_cod', version: d.data.version });

    const slots = await priya.req('GET', `/me/orders/${placed.data.orderNumber}/slots`);
    const slot = slots.data.slots.find((s: { full: boolean }) => !s.full);
    assert.ok(slot, 'an open slot exists');
    const row = await prisma.deliverySlot.findUniqueOrThrow({ where: { id: slot.id } });
    await prisma.deliverySlot.update({ where: { id: slot.id }, data: { booked: row.capacity } });
    try {
      const r = await priya.req('POST', `/me/orders/${placed.data.orderNumber}/schedule`, { slotId: slot.id });
      assert.equal(r.status, 409);
      assert.equal(r.data.code, 'SLOT_FULL');
    } finally {
      await prisma.deliverySlot.update({ where: { id: slot.id }, data: { booked: row.booked } });
    }
    const ok = await priya.req('POST', `/me/orders/${placed.data.orderNumber}/schedule`, { slotId: slot.id });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    // cancel it so the test leaves stock and slots as it found them
    await priya.req('POST', `/me/orders/${placed.data.orderNumber}/cancel`, { reason: 'Test clean-up' });
  });
});
