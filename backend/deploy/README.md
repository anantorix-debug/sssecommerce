# Going live on the VPS (Hostinger KVM 2)

One Ubuntu server runs the shop, and can keep running the SSS CRM alongside it. No Docker, no cloud storage.

```
shop.sssfurniture.co.in       ─┐                       ┌─ storefront   127.0.0.1:3100  (PM2: shop-storefront)
shopadmin.sssfurniture.co.in  ─┴─ Nginx (443, HTTPS) ──┼─ admin        127.0.0.1:3101  (PM2: shop-admin)
                                                       ├─ API /api/    127.0.0.1:4100  (PM2: shop-api)
                                                       └─ /media/      /opt/sss-shop/backend/storage/public (from disk)
PM2 also runs shop-jobs (emails, unpaid-order expiry, payment checks, delivery slots, disk alerts).
PostgreSQL on localhost. The CRM keeps admin./api.sssfurniture.co.in, ports 3000/4000 and MySQL; nothing here touches them.
The bare domain sssfurniture.co.in stays on Wix.
```

| File in `backend/deploy/` | What it is |
| --- | --- |
| `release.sh` | Builds and starts (or updates) everything, in the right order |
| `ecosystem.config.cjs` | PM2 list of the 4 processes, sized for KVM 2 |
| `nginx/sss-shop.conf` | Nginx site for both names: routing, media from disk, rate limits |
| `env/*.env` | Production settings templates for the 3 apps |
| `backup.sh` | Database dump every 6 hours, kept 14 days |
| `pull-backup.sh` | Runs on **your** computer: copies dumps and all media off the server |
| `maintenance.sh` | Weekly: keeps the resized-image cache under 15 GB |

Commands below run on the server as a normal user with sudo (called `deploy` here); `root` works too.

---

## 1. DNS (in Wix)

Wix → Settings → Domains → `sssfurniture.co.in` → Manage DNS Records → **A (Host)** → Add Record, twice:

| Host name | Value |
| --- | --- |
| `shop` | your KVM 2 IP address |
| `shopadmin` | your KVM 2 IP address |

Leave the existing records (Wix site, `admin`, `api`) as they are. Check from your computer: `nslookup shop.sssfurniture.co.in` should show the VPS IP (can take up to an hour).

## 2. Server software

If the CRM already runs on this VPS, Node.js, PM2, Nginx, certbot and the firewall are already set up: skip to PostgreSQL.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx certbot python3-certbot-nginx ufw fail2ban rsync curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs
sudo npm install -g pm2
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

PostgreSQL (the shop needs it; the CRM's MySQL is separate):

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
sudo apt install -y postgresql-18
```

Create the database (choose a long password; it goes in `backend/.env`):

```bash
sudo -u postgres psql <<'SQL'
CREATE USER sss_shop WITH PASSWORD 'a-long-random-password';
CREATE DATABASE sss_shop OWNER sss_shop;
\c sss_shop
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
```

## 3. Upload the code

On your Windows computer, in the `sssecommerce` folder (PowerShell):

```powershell
tar -czf sss-shop.tgz --exclude=node_modules --exclude=.next --exclude=dist --exclude=storage --exclude=.env --exclude=.env.local --exclude=test-results backend storefront admin MVP-SCOPE.md
scp sss-shop.tgz deploy@YOUR_SERVER_IP:/tmp/
```

On the server:

```bash
sudo mkdir -p /opt/sss-shop && sudo chown $USER:$USER /opt/sss-shop
tar -xzf /tmp/sss-shop.tgz -C /opt/sss-shop
chmod +x /opt/sss-shop/backend/deploy/*.sh
```

Your local `.env` files (with your test keys) are deliberately not in the upload.

## 4. Settings

```bash
cd /opt/sss-shop
cp backend/deploy/env/backend.env    backend/.env
cp backend/deploy/env/storefront.env storefront/.env.local
cp backend/deploy/env/admin.env      admin/.env.local
openssl rand -hex 32          # → INTERNAL_SECRET, the same value in backend/.env and storefront/.env.local
nano backend/.env             # database password, INTERNAL_SECRET, Razorpay, SMTP, Google
nano storefront/.env.local    # INTERNAL_SECRET
chmod 600 backend/.env storefront/.env.local admin/.env.local
```

The API will not start with a weak `INTERNAL_SECRET`, a default database password, or non-https addresses, and says why.

## 5. Build and start

```bash
bash /opt/sss-shop/backend/deploy/release.sh
cd /opt/sss-shop/backend && npm run setup:owner -- you@sssfurniture.co.in "Yogeshwaran S"   # prints a one-time password
pm2 save
pm2 startup        # only if the CRM hasn't done it already: run the command it prints
pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 50M && pm2 set pm2-logrotate:retain 14
```

The live database starts empty: no demo products, customers or demo admin accounts. **Never run `npm run db:seed` on the server.**

## 6. Nginx and HTTPS

```bash
sudo cp /opt/sss-shop/backend/deploy/nginx/sss-shop.conf /etc/nginx/sites-available/sss-shop.conf
sudo ln -s /etc/nginx/sites-available/sss-shop.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d shop.sssfurniture.co.in -d shopadmin.sssfurniture.co.in
```

Certbot adds HTTPS and the http→https redirect, and renews automatically. Nginx must be able to read the media folders:

```bash
sudo chmod o+x /opt /opt/sss-shop /opt/sss-shop/backend /opt/sss-shop/backend/storage
sudo chmod -R o+rX /opt/sss-shop/backend/storage/public
sudo apt install -y acl
sudo setfacl -R -m u:www-data:rX -m d:u:www-data:rX /opt/sss-shop/backend/storage/private
```

## 7. Connect the outside services

- **Google sign-in**: Google Cloud → Google Auth Platform → Clients → your client → Authorized redirect URIs → add `https://shop.sssfurniture.co.in/api/store/auth/google/callback`. Publish the consent screen (Audience → Publish app), or only test users can sign in.
- **Razorpay**: Dashboard → Webhooks → Add → URL `https://shop.sssfurniture.co.in/api/webhooks/razorpay`, events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`, a secret of your choice → put it in `RAZORPAY_WEBHOOK_SECRET`, then `pm2 reload shop-api --update-env`.
- **Email (SMTP)**: any SMTP provider or your domain's mailbox. Without it, customers get no sign-in codes or order emails.

## 8. First sign-in and launch checklist

1. Open `https://shopadmin.sssfurniture.co.in`, sign in with the one-time password, scan the QR code with an authenticator app, then change the password under Account.
2. The dashboard shows **"Before you go live"** until everything is set: GSTIN, payment methods, email, webhook, and so on. Work through it.
3. Settings: store details, payment methods, delivery terms. Content: policies (shipping, returns, privacy, terms). Catalogue: categories and products with photos.
4. Place one real test order on `https://shop.sssfurniture.co.in` from your phone.

## 9. Backups

```bash
sudo mkdir -p /var/backups/sss-shop && sudo chown $USER:$USER /var/backups/sss-shop
crontab -e
```

```cron
MAILTO=you@sssfurniture.co.in
15 */6 * * *  /opt/sss-shop/backend/deploy/backup.sh >> /var/backups/sss-shop/backup.log 2>&1
30 4 * * 0    /opt/sss-shop/backend/deploy/maintenance.sh >> /var/backups/sss-shop/maintenance.log 2>&1
```

Copy everything off the server nightly from your computer (WSL, Linux or macOS):

```bash
VPS=deploy@YOUR_SERVER_IP DEST=~/sss-shop-backup bash pull-backup.sh
```

Test a restore once before launch, then monthly:

```bash
createdb shop_restore_test
pg_restore --no-owner --dbname=shop_restore_test ~/sss-shop-backup/db/sss-shop-YYYY-MM-DD_HHMM.dump
psql shop_restore_test -c 'SELECT count(*) AS orders, max("placedAt") AS latest FROM "Order";'
dropdb shop_restore_test
```

## 10. Releasing an update

Upload as in step 3, then:

```bash
tar -xzf /tmp/sss-shop.tgz -C /opt/sss-shop
bash /opt/sss-shop/backend/deploy/release.sh      # backs up the database first
```

## Everyday commands

```bash
pm2 status                        # all processes (the CRM's sss-* ones too)
pm2 logs shop-api                 # live API log
pm2 reload shop-api --update-env  # after editing backend/.env
curl -s http://127.0.0.1:4100/v1/health   # {"status":"ok"} = API and database up
```

Uptime monitor: `https://shop.sssfurniture.co.in/api/health`.

## KVM 2 sizing

2 vCPU / 8 GB / 100 GB. The shop uses about 2–2.5 GB of memory in total (API 600 MB, storefront 1 GB, admin 500 MB, jobs 350 MB caps), leaving room for PostgreSQL and the CRM. Builds are the heaviest moment: if a build is killed for memory, add swap once:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

The jobs process emails the owner when the disk passes 70% and 85%.
