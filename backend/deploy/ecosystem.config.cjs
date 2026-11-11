// PM2 process list. Two copies of the shop run on one VPS, each from its own folder:
//   /opt/sss-shop/prod  (branch prod, live site)   API 4100, storefront 3100, admin 3101
//   /opt/sss-shop/dev   (branch dev, test site)    API 4200, storefront 3200, admin 3201
// The copy is picked from the folder name, so the same file serves both:
//   pm2 start /opt/sss-shop/prod/backend/deploy/ecosystem.config.cjs
// Everything listens on 127.0.0.1; Nginx is the only way in.
const { basename, resolve } = require('node:path');

const root = resolve(__dirname, '..', '..');
const target = basename(root) === 'dev' ? 'dev' : 'prod';
const ports = target === 'dev' ? { api: 4200, storefront: 3200, admin: 3201 } : { api: 4100, storefront: 3100, admin: 3101 };
// The test copy gets smaller memory caps so the live one always has room (KVM 2: 2 vCPU, 8 GB).
const mem = target === 'dev' ? { api: '400M', jobs: '250M', storefront: 700, admin: 400 } : { api: '600M', jobs: '350M', storefront: 900, admin: 450 };
const next = 'node_modules/next/dist/bin/next';

module.exports = {
  apps: [
    {
      name: `${target}-api`,
      cwd: resolve(root, 'backend'),
      script: 'dist/main.js',
      instances: 1, // rate limits and stock holds live in PostgreSQL, so scaling to 2 later is safe
      env: { NODE_ENV: 'production', RUN_JOBS: 'false', PORT: String(ports.api) },
      max_memory_restart: mem.api,
      kill_timeout: 10000,
      time: true,
    },
    {
      // Exactly one copy per site: emails, unpaid-order expiry, payment checks, delivery slots, disk alerts.
      name: `${target}-jobs`,
      cwd: resolve(root, 'backend'),
      script: 'dist/jobs-main.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: mem.jobs,
      time: true,
    },
    {
      name: `${target}-storefront`,
      cwd: resolve(root, 'storefront'),
      script: next,
      args: `start -p ${ports.storefront} -H 127.0.0.1`,
      instances: 1,
      env: { NODE_ENV: 'production', NODE_OPTIONS: `--max-old-space-size=${mem.storefront}` },
      max_memory_restart: `${mem.storefront + 100}M`,
      time: true,
    },
    {
      name: `${target}-admin`,
      cwd: resolve(root, 'admin'),
      script: next,
      args: `start -p ${ports.admin} -H 127.0.0.1`,
      instances: 1,
      env: { NODE_ENV: 'production', NODE_OPTIONS: `--max-old-space-size=${mem.admin}` },
      max_memory_restart: `${mem.admin + 50}M`,
      time: true,
    },
  ],
};
