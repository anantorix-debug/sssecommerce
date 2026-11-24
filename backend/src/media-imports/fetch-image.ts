import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { hostAllowed, isPrivateAddress } from './parse';

export const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

/** A download that will not work on a retry (bad address, not an image, too big...). */
export class PermanentError extends Error {}

export interface DownloadOptions {
  allowedHosts: string[];
  allowPrivate: boolean;
}

export interface Downloaded {
  buffer: Buffer;
  mimeType: string;
  finalUrl: string;
}

/**
 * Checks the address the socket actually connects to, not just the name in the URL,
 * so a hostname that resolves to this server or the office network is refused.
 */
function safeLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 0);
      const list = (Array.isArray(addresses) ? addresses : [addresses]) as LookupAddress[];
      const ok = allowPrivate ? list : list.filter((a) => !isPrivateAddress(a.address));
      if (!ok.length) return callback(new PermanentError(`Blocked: ${hostname} points to a private or internal address.`), '', 0);
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, ok);
      callback(null, ok[0].address, ok[0].family);
    });
  };
}

export async function downloadImage(url: string, opts: DownloadOptions): Promise<Downloaded> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new PermanentError('Only http and https links are allowed.');
    if (u.username || u.password) throw new PermanentError('Links with a user name or password are not allowed.');
    if (!hostAllowed(u.hostname, opts.allowedHosts)) throw new PermanentError(`${u.hostname} is not on the list of allowed image sources.`);
    if (!opts.allowPrivate && /^\[?[0-9a-f:.]+\]?$/i.test(u.hostname) && isPrivateAddress(u.hostname.replace(/^\[|\]$/g, ''))) {
      throw new PermanentError('Blocked: the link points to a private or internal address.');
    }
    const res = await request(u, opts.allowPrivate);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      current = new URL(res.headers.location, u).toString();
      continue;
    }
    if (status === 404 || status === 410 || status === 401 || status === 403) {
      res.resume();
      throw new PermanentError(`The source answered ${status} (${status === 404 || status === 410 ? 'not found' : 'access refused'}).`);
    }
    if (status < 200 || status >= 300) {
      res.resume();
      throw new Error(`The source answered ${status}.`);
    }
    const type = String(res.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (!type.startsWith('image/')) {
      res.resume();
      throw new PermanentError(`The link is not an image (${type || 'no content type'}).`);
    }
    const length = Number(res.headers['content-length'] ?? 0);
    if (length > MAX_DOWNLOAD_BYTES) {
      res.resume();
      throw new PermanentError('The image is larger than 25 MB.');
    }
    const buffer = await readCapped(res);
    return { buffer, mimeType: type === 'image/jpg' ? 'image/jpeg' : type, finalUrl: current };
  }
  throw new PermanentError('Too many redirects.');
}

function request(u: URL, allowPrivate: boolean): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      lookup: safeLookup(allowPrivate),
      timeout: TIMEOUT_MS,
      headers: { 'User-Agent': 'SSSFurniture-ImageImporter/1.0', Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
    });
    req.on('response', resolve);
    req.on('timeout', () => req.destroy(new Error('The source took too long to answer.')));
    req.on('error', (err) => reject(err));
  });
}

function readCapped(res: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_DOWNLOAD_BYTES) {
        res.destroy();
        reject(new PermanentError('The image is larger than 25 MB.'));
        return;
      }
      chunks.push(c);
    });
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });
}
