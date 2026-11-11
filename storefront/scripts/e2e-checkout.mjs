// End-to-end smoke test: product → cart → guest checkout → payment → confirmation.
// Pays online through Razorpay test mode by default (Netbanking → mock bank "Success").
// Usage: node scripts/e2e-checkout.mjs [screenshotDir]        (backend and storefront must be running)
//        PAY=cod node scripts/e2e-checkout.mjs                 (cash on delivery, when it is switched on in the admin)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const pay = (process.env.PAY ?? 'online').toLowerCase();
const out = process.argv[2];
if (out) mkdirSync(out, { recursive: true });
const shot = async (page, name) => out && page.screenshot({ path: join(out, `${name}.png`), fullPage: false }).catch(() => undefined);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const step = (msg) => console.log(`• ${msg}`);
try {
  step('Open product page');
  await page.goto(`${base}/products/vriksha-coffee-table`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { level: 1, name: 'Vriksha Coffee Table' }).waitFor();

  step('Pick a finish and set the pincode');
  await page.getByRole('button', { name: 'Walnut' }).first().click();
  await page.locator('#pdp-pin').first().fill('636015');
  await page.locator('#pdp-pin').first().press('Enter');
  await page.getByText(/Arrives /).first().waitFor({ timeout: 15000 });
  await shot(page, '1-product');

  step('Add to cart');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.getByRole('dialog', { name: /Your cart/ }).waitFor();
  await shot(page, '2-minicart');
  await page.getByRole('link', { name: 'Checkout' }).click();

  step('Fill checkout as a guest');
  await page.getByRole('heading', { name: 'Checkout' }).waitFor();
  await page.getByLabel('Email', { exact: true }).fill('guest.tester@example.com');
  await page.getByLabel('Full name').fill('Anika Sharma');
  // A realistic number: Razorpay rejects obvious test numbers like 9876543210.
  await page.getByLabel('Mobile number').fill('9445012345');
  await page.getByLabel('Pincode', { exact: true }).fill('636015');
  await page.getByText(/Delivering to Salem/).first().waitFor({ timeout: 15000 });
  await page.getByLabel('State').selectOption('Tamil Nadu');
  await page.getByLabel('House number, building and street').fill('12, Omalur Main Road');
  if (pay === 'cod') await page.getByRole('radio', { name: /Cash on delivery/ }).click();
  await page.getByLabel(/I agree to the/).check();
  await shot(page, '3-checkout');

  if (pay === 'cod') {
    step('Place the order (cash on delivery)');
    await page.getByRole('button', { name: /Place order/ }).click();
  } else {
    step('Pay online with Razorpay (test mode)');
    await page.getByRole('button', { name: /^Pay / }).click();
    await page.locator('iframe.razorpay-checkout-frame').waitFor({ timeout: 30000 });
    const rzp = page.frameLocator('iframe.razorpay-checkout-frame');
    await rzp.getByText('Netbanking', { exact: true }).first().click({ timeout: 30000 });
    await shot(page, '4-razorpay');
    const bankPopup = page.waitForEvent('popup', { timeout: 30000 });
    await rzp.getByText('Canara Bank', { exact: true }).first().click();
    const bank = await bankPopup;
    await bank.waitForLoadState('domcontentloaded');
    step('Approve at the Razorpay mock bank');
    await bank.getByRole('button', { name: /Success/i }).click();
  }

  await page.waitForURL(/\/checkout\/confirmation\//, { timeout: 60000 });
  await page.getByRole('heading', { name: /We’ve got your order|confirmed/ }).waitFor({ timeout: 15000 });
  const orderNumber = await page.locator('text=/SSS-\\d{4}-\\d{6}/').first().textContent();
  await shot(page, '5-confirmation');
  console.log(`✓ Order placed (${pay === 'cod' ? 'cash on delivery' : 'paid online'}): ${orderNumber}`);
} catch (err) {
  console.error(`✗ ${err.message.split('\n')[0]}`);
  await shot(page, 'failure');
  process.exitCode = 1;
} finally {
  if (errors.length) console.log(`Page errors: ${errors.join(' | ')}`);
  await browser.close();
}
