/**
 * Production first run: creates the staff roles and the owner's admin account,
 * without any demo products or demo staff.
 *
 *   npm run setup:owner -- you@yourdomain.in "Your Name"
 *
 * Prints a one-time password; two-factor setup is forced on first sign-in.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { SYSTEM_ROLES } from '../src/common/permissions';

const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const prisma = new PrismaClient();
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ').trim() || 'Store Owner';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: npm run setup:owner -- you@yourdomain.in "Your Name"');
    process.exit(1);
  }

  for (const r of SYSTEM_ROLES) {
    await prisma.role.upsert({ where: { name: r.name }, update: { permissions: r.permissions, description: r.description, isSystem: true }, create: { ...r, isSystem: true } });
  }
  const owner = await prisma.role.findUniqueOrThrow({ where: { name: 'Owner' } });

  const normalised = email.toLowerCase();
  if (await prisma.staffUser.findUnique({ where: { email: normalised } })) {
    console.error(`${normalised} already has an admin account. Reset its password from Team > Staff instead.`);
    process.exit(1);
  }

  const password = randomBytes(12).toString('base64url');
  await prisma.staffUser.create({ data: { email: normalised, name, roleId: owner.id, passwordHash: await hash(password, ARGON) } });

  console.log(`\nOwner account created: ${normalised}`);
  console.log(`One-time password:     ${password}`);
  console.log('Sign in to the admin, set up two-factor authentication, then change this password under Account.\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
