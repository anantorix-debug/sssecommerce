// Renders pages at desktop and phone widths and saves full-page screenshots.
// Usage: node scripts/screenshots.mjs <outDir> <path> [path...]   (storefront must be running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'screenshots', ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const widths = (process.env.WIDTHS ?? '1440,390').split(',').map(Number);
const fullPage = process.env.FULL !== '0';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of paths.length ? paths : ['/']) {
    const url = base + path;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 });
    // reveal everything below the fold, then settle lazy images
    await page.evaluate(async () => {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
      for (let y = 0; y < document.body.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
    const name = `${width}-${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}.png`;
    if (process.env.SECTIONS) {
      // one image per top-level section, at full resolution
      const sections = await page.$$(process.env.SECTIONS === '1' ? 'main > section, main > div > section, footer' : process.env.SECTIONS);
      for (const [i, s] of sections.entries()) {
        await s.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        await s.screenshot({ path: join(outDir, name.replace('.png', `-s${String(i).padStart(2, '0')}.png`)) });
      }
    } else {
      await page.screenshot({ path: join(outDir, name), fullPage });
    }
    console.log(`${res?.status()} ${url} -> ${name}${errors.length ? `  errors: ${errors.splice(0).join(' | ').slice(0, 400)}` : ''}`);
  }
  await ctx.close();
}
await browser.close();
