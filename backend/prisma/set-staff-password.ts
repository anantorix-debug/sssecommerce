/**
 * Sets a staff member's password from the server (for a forgotten password, or the master admin login).
 *
 *   npm run staff:password -- owner@sssfurniture.co.in               → prints a new random password
 *   NEW_PASSWORD='…' npm run staff:password -- owner@sssfurniture.co.in → sets that password (12+ characters)
 *
 * Also unlocks the account and signs it out everywhere. Two-factor sign-in is left as it is.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const prisma = new PrismaClient();
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

async function main() {
  const email = (process.argv[2] ?? '').toLowerCase();
  if (!email.includes('@')) {
    console.error('Usage: npm run staff:password -- name@example.com');
    process.exit(1);
  }
  const given = process.env.NEW_PASSWORD;
  if (given !== undefined && given.length < 12) {
    console.error('NEW_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }
  const staff = await prisma.staffUser.findUnique({ where: { email } });
  if (!staff) {
    console.error(`No staff account for ${email}. Create the first owner with: npm run setup:owner -- ${email} "Name"`);
    process.exit(1);
  }
  const password = given ?? randomBytes(12).toString('base64url');
  await prisma.staffUser.update({
    where: { id: staff.id },
    data: { passwordHash: await hash(password, ARGON), active: true, failedLogins: 0, lockedUntil: null },
  });
  const signedOut = await prisma.session.deleteMany({ where: { staffId: staff.id } });
  console.log(`Password updated for ${email} (signed out of ${signedOut.count} session(s)).`);
  if (!given) console.log(`New password: ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
