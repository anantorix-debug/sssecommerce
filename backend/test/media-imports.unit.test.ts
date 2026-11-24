/**
 * Image import helpers: CSV and ZIP name reading, address checks, and the downloader
 * against a small local server. No API or database needed.
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { downloadImage, PermanentError } from '../src/media-imports/fetch-image';
import { hostAllowed, isPrivateAddress, normaliseRole, parseCsv, readImportCsv, readZipFileName, retryDelayMs } from '../src/media-imports/parse';

describe('CSV reading', () => {
  it('handles quotes, commas inside quotes, CRLF and a BOM', () => {
    const rows = parseCsv('﻿sku,image_url\r\n"A,1","https://x.test/a.jpg"\r\n"say ""hi""",b\n');
    assert.deepEqual(rows, [['sku', 'image_url'], ['A,1', 'https://x.test/a.jpg'], ['say "hi"', 'b']]);
  });

  it('reads sku, image_url, role and position, and explains bad rows', () => {
    const { rows, error } = readImportCsv(
      'SKU,Image URL,Role,Position,Alt text\nS1,https://x.test/1.jpg,lifestyle,2,Living room\nS2,ftp://x.test/2.jpg,,,\n,https://x.test/3.jpg,,,\nS4,https://x.test/4.jpg,banner,,\nS5,https://x.test/5.jpg,,abc,\n',
      'url',
    );
    assert.equal(error, undefined);
    assert.deepEqual(rows[0], { rowNumber: 2, sku: 'S1', url: 'https://x.test/1.jpg', role: 'LIFESTYLE', position: 2, alt: 'Living room' });
    assert.match(rows[1].error!, /http/);
    assert.match(rows[2].error!, /SKU is empty/);
    assert.match(rows[3].error!, /Role must be/);
    assert.match(rows[4].error!, /Position/);
  });

  it('refuses a CSV without the needed columns', () => {
    assert.match(readImportCsv('name,url\nx,https://x.test/a.jpg', 'url').error!, /sku/);
    assert.match(readImportCsv('sku\nS1', 'url').error!, /image_url/);
    assert.match(readImportCsv('sku,image_url\n', 'url').error!, /no rows/);
  });

  it('maps role names and aliases', () => {
    assert.equal(normaliseRole(''), 'GALLERY');
    assert.equal(normaliseRole('main'), 'GALLERY');
    assert.equal(normaliseRole('model poster'), 'MODEL_POSTER');
    assert.equal(normaliseRole('MODEL_3D'), null);
  });
});

describe('ZIP file names', () => {
  it('reads SKU, role and position from the name', () => {
    assert.deepEqual(readZipFileName('photos/BED-01.jpg'), { sku: 'BED-01', role: 'GALLERY', position: null });
    assert.deepEqual(readZipFileName('BED-01__3.webp'), { sku: 'BED-01', role: 'GALLERY', position: 3 });
    assert.deepEqual(readZipFileName('BED-01__lifestyle__1.PNG'), { sku: 'BED-01', role: 'LIFESTYLE', position: 1 });
    assert.deepEqual(readZipFileName('BED-01__DETAIL.jpg'), { sku: 'BED-01', role: 'DETAIL', position: null });
  });
  it('rejects non-images and unknown roles', () => {
    assert.ok('error' in readZipFileName('notes.txt'));
    assert.ok('error' in readZipFileName('BED-01__POSTERX__1.jpg'));
  });
});

describe('address checks', () => {
  it('blocks this server, the private network and cloud metadata', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    for (const ip of ['8.8.8.8', '151.101.1.1', '172.32.0.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
  });
  it('allows only listed hosts and their subdomains when a list is set', () => {
    assert.equal(hostAllowed('cdn.supplier.com', []), true);
    assert.equal(hostAllowed('cdn.supplier.com', ['supplier.com']), true);
    assert.equal(hostAllowed('supplier.com.evil.test', ['supplier.com']), false);
    assert.equal(hostAllowed('other.com', ['supplier.com']), false);
  });
  it('waits 1, 5 then 30 minutes between tries', () => {
    assert.deepEqual([1, 2, 3, 9].map(retryDelayMs), [60_000, 300_000, 1_800_000, 1_800_000]);
  });
});

describe('downloader', () => {
  let server: Server;
  let base = '';
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  before(async () => {
    server = createServer((req, res) => {
      if (req.url === '/img.png') return res.writeHead(200, { 'Content-Type': 'image/png' }).end(png);
      if (req.url === '/page') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html></html>');
      if (req.url === '/gone') return res.writeHead(404).end();
      if (req.url === '/busy') return res.writeHead(503).end();
      if (req.url === '/hop') return res.writeHead(302, { Location: '/img.png' }).end();
      if (req.url === '/loop') return res.writeHead(302, { Location: '/loop' }).end();
      if (req.url === '/huge') {
        res.writeHead(200, { 'Content-Type': 'image/jpeg' });
        const chunk = Buffer.alloc(1024 * 1024);
        let sent = 0;
        const push = () => {
          while (sent < 30 && res.write(chunk)) sent++;
          if (sent < 30) res.once('drain', push);
          else res.end();
        };
        return push();
      }
      res.writeHead(500).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((r) => server.close(() => r())));

  const open = { allowedHosts: [], allowPrivate: true };
  it('downloads an image and follows a redirect', async () => {
    const d = await downloadImage(`${base}/hop`, open);
    assert.equal(d.mimeType, 'image/png');
    assert.deepEqual(d.buffer, png);
  });
  it('blocks private addresses unless allowed (the production default)', async () => {
    await assert.rejects(downloadImage(`${base}/img.png`, { allowedHosts: [], allowPrivate: false }), PermanentError);
    await assert.rejects(downloadImage('http://localhost:9/x.png', { allowedHosts: [], allowPrivate: false }), /private or internal/);
  });
  it('refuses hosts not on the allowed list', async () => {
    await assert.rejects(downloadImage(`${base}/img.png`, { allowedHosts: ['supplier.com'], allowPrivate: true }), /not on the list/);
  });
  it('treats a web page, 404 and too many redirects as permanent', async () => {
    await assert.rejects(downloadImage(`${base}/page`, open), (e) => e instanceof PermanentError && /not an image/.test(e.message));
    await assert.rejects(downloadImage(`${base}/gone`, open), (e) => e instanceof PermanentError && /404/.test(e.message));
    await assert.rejects(downloadImage(`${base}/loop`, open), (e) => e instanceof PermanentError && /redirects/.test(e.message));
  });
  it('treats a busy server as temporary (will be retried)', async () => {
    await assert.rejects(downloadImage(`${base}/busy`, open), (e) => !(e instanceof PermanentError) && /503/.test((e as Error).message));
  });
  it('stops a download that grows past 25 MB', async () => {
    await assert.rejects(downloadImage(`${base}/huge`, open), (e) => e instanceof PermanentError && /25 MB/.test(e.message));
  });
  it('refuses other link types and links with passwords', async () => {
    await assert.rejects(downloadImage('ftp://x.test/a.png', open), PermanentError);
    await assert.rejects(downloadImage(`http://u:p@127.0.0.1/a.png`, open), PermanentError);
  });
});
