// PM2 process list for the VPS: pm2 start /opt/sss-shop/backend/deploy/ecosystem.config.cjs
// Sized for a Hostinger KVM 2 (2 vCPU, 8 GB) that may also run the SSS CRM, which uses ports 3000/4000:
// this shop uses 4100 (API), 3100 (storefront) and 3101 (admin), all on 127.0.0.1. Nginx is the only way in.
const { resolve } = require('node:path');

const root = resolve(__dirname, '..', '..');
const next = 'node_modules/next/dist/bin/next';

module.exports = {
  apps: [
    {
      name: 'shop-api',
      cwd: resolve(root, 'backend'),
      script: 'dist/main.js',
      instances: 1, // rate limits and stock holds live in PostgreSQL, so `pm2 scale shop-api 2` is safe later
      env: { NODE_ENV: 'production', RUN_JOBS: 'false', PORT: '4100' },
      max_memory_restart: '600M',
      kill_timeout: 10000,
      time: true,
    },
    {
      // Exactly one copy: emails, unpaid-order expiry, payment reconcile, slots, trash and disk checks.
      name: 'shop-jobs',
      cwd: resolve(root, 'backend'),
      script: 'dist/jobs-main.js',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '350M',
      time: true,
    },
    {
      name: 'shop-storefront',
      cwd: resolve(root, 'storefront'),
      script: next,
      args: 'start -p 3100 -H 127.0.0.1',
      instances: 1,
      env: { NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=900' },
      max_memory_restart: '1000M',
      time: true,
    },
    {
      name: 'shop-admin',
      cwd: resolve(root, 'admin'),
      script: next,
      args: 'start -p 3101 -H 127.0.0.1',
      instances: 1,
      env: { NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=450' },
      max_memory_restart: '500M',
      time: true,
    },
  ],
};
