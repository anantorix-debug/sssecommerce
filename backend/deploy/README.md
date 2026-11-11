# Live and test sites on the VPS

Hostinger KVM 2 (`189.72.149.180`, Ubuntu 26.04): 2 vCPU, 8 GB, 100 GB. Two copies of the shop run on it, each from its own Git branch, folder, database and settings.

| | **Live** (branch `prod`) | **Test** (branch `dev`) |
| --- | --- | --- |
| Storefront | https://sssfurniture.co.in | https://dev.sssfurniture.co.in |
| Admin | https://shopadmin.sssfurniture.co.in | https://devadmin.sssfurniture.co.in |
| Folder | `/opt/sss-shop/prod` | `/opt/sss-shop/dev` |
| Ports (API / storefront / admin) | 4100 / 3100 / 3101 | 4200 / 3200 / 3201 |
| PM2 names | `prod-api` `prod-jobs` `prod-storefront` `prod-admin` | `dev-…` |
| Database (PostgreSQL 18) | `sss_shop` | `sss_shop_dev` |
| Search engines | indexed | told to stay away |

```
Internet ── Nginx (80/443, Let's Encrypt) ─┬─ /api/    → API       (NestJS)
                                           ├─ /media/  → backend/storage/public (from disk)
                                           └─ /        → storefront or admin (Next.js)
PM2 runs everything as the `deploy` user, on 127.0.0.1 only. admin. and api.sssfurniture.co.in are the CRM's (another server).
```

## How a change goes live (the pipeline)

1. Work on `dev`, commit, `git push` → GitHub Actions deploys it to **dev.sssfurniture.co.in**.
2. Check it there.
3. On GitHub, open a pull request **dev → prod** and merge it → Actions deploys it to **sssfurniture.co.in**.

Each deploy (`.github/workflows/deploy.yml`) copies the branch to its folder and runs `backend/deploy/release.sh`, which backs up the live database (prod only), installs, builds, applies database migrations, restarts and checks every app answers. Settings files, uploads and installed packages on the server are never overwritten. Only one release runs at a time. Watch progress under the repository's **Actions** tab.

### One-time: give GitHub the server key

Repository → **Settings → Secrets and variables → Actions → New repository secret**, three times:

| Name | Value |
| --- | --- |
| `VPS_HOST` | `189.72.149.180` |
| `VPS_SSH_KEY` | the private key Claude gave you (`github_deploy`), whole file including the BEGIN/END lines |
| `VPS_KNOWN_HOSTS` | the line from `ssh-keyscan -t ed25519 189.72.149.180` |

Until they exist, the workflow finishes with a "Deploy skipped" notice.

## DNS (Wix → Domains → sssfurniture.co.in → Manage DNS Records)

A (Host) records, all `189.72.149.180`: `sssfurniture.co.in`, `www`, `dev`, `shopadmin`, `devadmin`. Delete the old Wix A record `185.230.63.186` for the bare domain, or half of visitors land on Wix. Then, on the server, add HTTPS for whichever names are ready:

```bash
certbot --nginx -d sssfurniture.co.in -d www.sssfurniture.co.in -d shopadmin.sssfurniture.co.in -d dev.sssfurniture.co.in -d devadmin.sssfurniture.co.in
```

## Files in `backend/deploy/`

| File | What it is |
| --- | --- |
| `provision.sh` | One-time server setup (already run): packages, Node 22, PM2, PostgreSQL, swap, firewall, `deploy` user, databases, settings files with generated secrets |
| `release.sh` | Build and restart one copy (the folder it's in decides which) |
| `ecosystem.config.cjs` | PM2 processes for one copy, named and ported by folder |
| `nginx/sss-shop.conf` | All five addresses (installed as `/etc/nginx/sites-available/sss-shop.conf`) |
| `env/*.env` | Settings templates, for reference; the real files are on the server |
| `backup.sh` | Live database dump every 6 hours, kept 14 days |
| `pull-backup.sh` | Runs on **your** computer: copies dumps and all media off the server |
| `maintenance.sh` | Weekly: keeps the resized-image cache under 15 GB |

## Settings on the server

`/opt/sss-shop/<prod|dev>/backend/.env`, `storefront/.env.local`, `admin/.env.local` (owner `deploy`, mode 600). Both copies use Razorpay **test** keys. To change something:

```bash
ssh deploy@189.72.149.180
nano /opt/sss-shop/prod/backend/.env
pm2 reload prod-api prod-jobs --update-env      # backend settings
bash /opt/sss-shop/prod/backend/deploy/release.sh   # NEXT_PUBLIC_* settings need a rebuild
```

Still to fill in for a real launch: `SMTP_*` (sign-in codes and order emails), `RAZORPAY_WEBHOOK_SECRET` (with the webhook `https://sssfurniture.co.in/api/webhooks/razorpay` in Razorpay), live Razorpay keys with `PAYMENTS_MODE=live`. The admin dashboard lists whatever is missing under **"Before you go live"**.

Google sign-in: in Google Cloud add both redirect URIs `https://sssfurniture.co.in/api/store/auth/google/callback` and `https://dev.sssfurniture.co.in/api/store/auth/google/callback`.

## First admin account (once per copy)

```bash
ssh deploy@189.72.149.180
cd /opt/sss-shop/prod/backend && npm run setup:owner -- you@sssfurniture.co.in "Yogeshwaran S"
```

It prints a one-time password; the first sign-in asks you to scan a QR code with an authenticator app. Both copies already have their owner account (`owner@sssfurniture.co.in`) and launch content: home page, policies, About, FAQ and footer menu (`npm run db:seed -- --content-only`). Edit them in the admin under Content.

**Never load the demo data (`npm run db:seed`) on either copy.** Both admins are on the public internet, and the demo creates admin accounts whose password is in this repository. The seed refuses to run on a production server for that reason.

## Backups

The live database is dumped every 6 hours (`crontab -l` as `deploy`). Copy everything off the server nightly from your computer (WSL, Linux or macOS):

```bash
VPS=deploy@189.72.149.180 DEST=~/sss-shop-backup bash pull-backup.sh
```

Test a restore once, then monthly:

```bash
createdb shop_restore_test
pg_restore --no-owner --dbname=shop_restore_test ~/sss-shop-backup/db/sss-shop-YYYY-MM-DD_HHMM.dump
psql shop_restore_test -c 'SELECT count(*) AS orders, max("placedAt") AS latest FROM "Order";'
dropdb shop_restore_test
```

## Everyday commands (as `deploy`)

```bash
pm2 status                                   # all 8 processes
pm2 logs prod-api                            # live API log
curl -s http://127.0.0.1:4100/v1/health      # live API and database
bash /opt/sss-shop/dev/backend/deploy/release.sh   # redeploy test by hand
```

Uptime monitor: `https://sssfurniture.co.in/api/health`. The jobs process emails Owners when the disk passes 70% and 85%.
