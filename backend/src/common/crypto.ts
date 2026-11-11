import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const otpCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const hmacSha256Hex = (secret: string, payload: string | Buffer) =>
  createHmac('sha256', secret).update(payload).digest('hex');

// Argon2id with OWASP-recommended parameters
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (plain: string) => hash(plain, ARGON);
export const verifyPassword = async (hashed: string, plain: string) => {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
};

// ── TOTP (RFC 6238) for staff two-factor authentication ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string) {
  const clean = input.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpAt(secret: string, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** Accepts the current 30-second step and one step either side for clock drift. */
export function verifyTotp(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const step = Math.floor(Date.now() / 30_000);
  return [-1, 0, 1].some((d) => safeEqual(totpAt(secret, step + d), code));
}
