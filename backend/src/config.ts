import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load backend/.env when present (Node 22 built-in, no dotenv needed).
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  STOREFRONT_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_URL: z.string().url().default('http://localhost:3001'),
  MEDIA_ROOT: z.string().default('./storage'),
  RUN_JOBS: bool(true),
  NGINX_ACCEL: bool(false),
  PAYMENTS_MODE: z.enum(['test', 'live']).default('test'),
  RAZORPAY_KEY_ID: z.string().default(''),
  RAZORPAY_KEY_SECRET: z.string().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().default(''),
  FEATURE_EMI: bool(false),
  SHIPPING_PROVIDER: z.enum(['manual']).default('manual'),
  // Place names for unlisted pincodes: India Post's free public service, cached in our database. "off" disables it.
  PINCODE_LOOKUP: z.enum(['indiapost', 'off']).default('indiapost'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().default('SSS Furniture <care@sssfurniture.co.in>'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  // Where Google sends the shopper back; defaults to the storefront's /api proxy so cookies stay first-party.
  GOOGLE_REDIRECT_URI: z.string().default(''),
  REVALIDATE_URL: z.string().default(''),
  INTERNAL_SECRET: z.string().min(16, 'INTERNAL_SECRET must be at least 16 characters.'),
  STAFF_2FA_REQUIRED: bool(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const env = parsed.data;

// Quarantine rule: the MVP must never take live online payments.
// A live key while PAYMENTS_MODE=test stops the API from starting.
if (env.PAYMENTS_MODE === 'test' && env.RAZORPAY_KEY_ID.startsWith('rzp_live_')) {
  console.error('Refusing to start: a live Razorpay key is set while PAYMENTS_MODE=test.');
  process.exit(1);
}
if (env.PAYMENTS_MODE === 'live' && env.RAZORPAY_KEY_ID && !env.RAZORPAY_KEY_ID.startsWith('rzp_live_')) {
  console.error('Refusing to start: PAYMENTS_MODE=live needs a live Razorpay key.');
  process.exit(1);
}

// Production safety. Hard failures: settings that would make the live site insecure or broken.
// Warnings: allowed for a soft launch, but listed on the admin dashboard's launch checklist.
const launchWarnings: string[] = [];
if (env.NODE_ENV === 'production') {
  const fatal: string[] = [];
  if (env.INTERNAL_SECRET.length < 32 || /change-me|dev-internal/i.test(env.INTERNAL_SECRET)) fatal.push('INTERNAL_SECRET must be a random value of 32+ characters (openssl rand -hex 32).');
  if (/:(root|postgres|password|CHANGE_ME)@/i.test(env.DATABASE_URL)) fatal.push('DATABASE_URL uses a default or development password.');
  for (const [k, v] of [['STOREFRONT_URL', env.STOREFRONT_URL], ['ADMIN_URL', env.ADMIN_URL]] as const) {
    if (!v.startsWith('https://') || /localhost|127\.0\.0\.1/.test(v)) fatal.push(`${k} must be the public https:// address (now ${v}).`);
  }
  if (fatal.length) {
    console.error('Refusing to start in production:');
    for (const f of fatal) console.error(`  - ${f}`);
    process.exit(1);
  }
  if (!env.SMTP_HOST) launchWarnings.push('No SMTP server: sign-in codes and order emails are not being sent to customers.');
  if (env.PAYMENTS_MODE === 'test' && env.RAZORPAY_KEY_ID) launchWarnings.push('Razorpay is in test mode: online payments do not take real money.');
  if (env.RAZORPAY_KEY_ID && !env.RAZORPAY_WEBHOOK_SECRET) launchWarnings.push('No RAZORPAY_WEBHOOK_SECRET: payments are confirmed only when the shopper returns, plus a 10-minute background check.');
  if (!env.NGINX_ACCEL) launchWarnings.push('NGINX_ACCEL is off: private files are served by the API instead of Nginx.');
  if (!env.STAFF_2FA_REQUIRED) launchWarnings.push('Staff two-factor sign-in is not required.');
  for (const w of launchWarnings) console.warn(`[launch] ${w}`);
}

export const config = {
  ...env,
  launchWarnings,
  isProd: env.NODE_ENV === 'production',
  mediaRoot: resolve(process.cwd(), env.MEDIA_ROOT),
  onlinePaymentsEnabled: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
  googleEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  googleRedirectUri: env.GOOGLE_REDIRECT_URI || `${env.STOREFRONT_URL}/api/store/auth/google/callback`,
  mailEnabled: Boolean(env.SMTP_HOST),
};

export type AppConfig = typeof config;
