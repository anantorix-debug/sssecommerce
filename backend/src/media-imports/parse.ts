/**
 * Pure helpers for image imports: CSV reading, row checks, ZIP file names, address checks.
 * No database or network here, so they are easy to test.
 */
import { isIP } from 'node:net';

export const IMPORT_ROLES = ['GALLERY', 'LIFESTYLE', 'DIMENSION', 'DETAIL', 'MODEL_POSTER'] as const;
export type ImportRole = (typeof IMPORT_ROLES)[number];

export const MAX_ROWS = 2000;
export const MAX_ATTEMPTS = 3;
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif'];
export const MIME_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const HEADER_ALIASES: Record<string, string> = {
  sku: 'sku',
  product_sku: 'sku',
  image_url: 'url',
  url: 'url',
  image: 'url',
  file: 'file',
  file_name: 'file',
  filename: 'file',
  role: 'role',
  image_role: 'role',
  position: 'position',
  sort: 'position',
  alt: 'alt',
  alt_text: 'alt',
};

export interface ImportRow {
  rowNumber: number;
  sku: string;
  url?: string;
  file?: string;
  role: ImportRole;
  position: number | null;
  alt?: string;
  error?: string;
}

/** Turns CSV text into rows; each bad row keeps its error so the report can show it. */
export function readImportCsv(text: string, need: 'url' | 'file'): { rows: ImportRow[]; error?: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: 'The CSV has no rows. Use the columns: sku, image_url, role, position.' };
  const header = table[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? '');
  if (!header.includes('sku')) return { rows: [], error: 'The CSV needs a "sku" column.' };
  if (!header.includes(need)) return { rows: [], error: need === 'url' ? 'The CSV needs an "image_url" column.' : 'The manifest needs a "file" column.' };
  if (table.length - 1 > MAX_ROWS) return { rows: [], error: `One import can have up to ${MAX_ROWS} rows. Split the file.` };
  const rows = table.slice(1).map((cells, i) => {
    const get = (k: string) => (cells[header.indexOf(k)] ?? '').trim();
    const row: ImportRow = { rowNumber: i + 2, sku: get('sku'), role: 'GALLERY', position: null, alt: get('alt').slice(0, 300) || undefined };
    if (need === 'url') row.url = get('url');
    else row.file = get('file');
    const role = normaliseRole(get('role'));
    const position = get('position');
    if (!row.sku) row.error = 'SKU is empty.';
    else if (need === 'url' && !row.url) row.error = 'Image URL is empty.';
    else if (need === 'url' && !isHttpUrl(row.url!)) row.error = 'Image URL must start with http:// or https://.';
    else if (need === 'file' && !row.file) row.error = 'File name is empty.';
    else if (role === null) row.error = `Role must be one of: ${IMPORT_ROLES.join(', ')}.`;
    else if (position && !/^\d{1,3}$/.test(position)) row.error = 'Position must be a whole number from 1 to 999.';
    if (role) row.role = role;
    if (/^\d{1,3}$/.test(position) && Number(position) >= 1) row.position = Number(position);
    return row;
  });
  return { rows };
}

export function normaliseRole(v: string): ImportRole | null {
  if (!v) return 'GALLERY';
  const r = v.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const alias: Record<string, ImportRole> = { MAIN: 'GALLERY', PRIMARY: 'GALLERY', IMAGE: 'GALLERY', POSTER: 'MODEL_POSTER', LIFESTYLE_IMAGE: 'LIFESTYLE' };
  const out = (IMPORT_ROLES as readonly string[]).includes(r) ? (r as ImportRole) : alias[r];
  return out ?? null;
}

export function isHttpUrl(v: string) {
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
}

/**
 * File names inside a ZIP without a manifest:
 *   SKU.jpg                 gallery, next free position
 *   SKU__2.jpg              gallery, position 2
 *   SKU__LIFESTYLE__1.jpg   role and position
 */
export function readZipFileName(path: string): { sku: string; role: ImportRole; position: number | null } | { error: string } {
  const name = path.split('/').pop() ?? path;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (!IMAGE_EXTENSIONS.includes(ext)) return { error: 'Not an image file (use JPG, PNG, WebP or AVIF).' };
  const parts = name.slice(0, -(ext.length + 1)).split('__');
  const sku = parts[0]?.trim();
  if (!sku) return { error: 'File name must start with the SKU, for example SKU__1.jpg.' };
  let role: ImportRole | null = 'GALLERY';
  let position: number | null = null;
  if (parts.length === 2) {
    if (/^\d{1,3}$/.test(parts[1])) position = Number(parts[1]);
    else role = normaliseRole(parts[1]);
  } else if (parts.length >= 3) {
    role = normaliseRole(parts[1]);
    if (/^\d{1,3}$/.test(parts[2])) position = Number(parts[2]);
  }
  if (!role) return { error: `Unknown role in file name. Use one of: ${IMPORT_ROLES.join(', ')}.` };
  return { sku, role, position: position && position >= 1 ? position : null };
}

/**
 * True for addresses a download must never reach: this server, the private network,
 * link-local (cloud metadata) and other reserved ranges.
 */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true;
}

/** True when the host is on the allowed list (exact, or a subdomain of a listed domain). */
export function hostAllowed(host: string, allowed: string[]) {
  if (!allowed.length) return true;
  const h = host.toLowerCase();
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

/** Wait before the next try: 1 minute, then 5, then 30. */
export function retryDelayMs(attempt: number) {
  return [60_000, 5 * 60_000, 30 * 60_000][Math.min(attempt - 1, 2)];
}

export function csvCell(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
