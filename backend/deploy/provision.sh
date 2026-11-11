#!/usr/bin/env bash
# One-time server setup for the SSS Furniture shop (Ubuntu 24.04/26.04, run as root):
#   bash provision.sh /root/shop-keys.env
# shop-keys.env holds the outside services' keys (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,
# GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, optional SMTP_*); it is deleted afterwards.
# Database passwords and internal secrets are generated here and never leave the server.
# Safe to run again: existing users, databases and settings files are kept.
set -euo pipefail

KEYS_FILE="${1:-}"
DEPLOY_USER=deploy
BASE=/opt/sss-shop
export DEBIAN_FRONTEND=noninteractive
step() { printf '\n==> %s\n' "$*"; }

step "System packages"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq nginx certbot python3-certbot-nginx ufw fail2ban rsync curl ca-certificates acl git postgresql postgresql-contrib xz-utils

step "Node.js 22 (official build)"
if ! command -v node > /dev/null || ! node -v | grep -q '^v22\.'; then
  NODE_TAR="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | awk '/linux-x64.tar.xz$/ {print $2}')"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$NODE_TAR" -o "/tmp/$NODE_TAR"
  curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep " $NODE_TAR\$" | (cd /tmp && sha256sum -c -)
  tar -xJf "/tmp/$NODE_TAR" -C /usr/local --strip-components=1 --no-same-owner
  rm -f "/tmp/$NODE_TAR"
fi
node -v
command -v pm2 > /dev/null || npm install -g pm2@latest --no-fund --no-audit

step "Swap (builds need headroom on 8 GB)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Deploy user and folders"
id "$DEPLOY_USER" > /dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
# Same keys as root (this PC) plus any extra keys passed in DEPLOY_KEYS (GitHub Actions).
cat /root/.ssh/authorized_keys "${DEPLOY_KEYS:-/dev/null}" 2>/dev/null | sort -u > "/home/$DEPLOY_USER/.ssh/authorized_keys.new"
mv "/home/$DEPLOY_USER/.ssh/authorized_keys.new" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BASE" "$BASE/prod" "$BASE/dev" /var/backups/sss-shop
chmod 755 "$BASE"

step "PostgreSQL: one database per copy"
rand() { openssl rand -hex "${1:-24}"; }
declare -A DB_PASS
for target in prod dev; do
  db="sss_shop"; [ "$target" = dev ] && db="sss_shop_dev"
  pass_file="/root/.sss-shop-$target-db"
  [ -f "$pass_file" ] || { rand 24 > "$pass_file"; chmod 600 "$pass_file"; }
  DB_PASS[$target]="$(cat "$pass_file")"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$db') THEN CREATE ROLE $db LOGIN PASSWORD '${DB_PASS[$target]}';
  ELSE ALTER ROLE $db PASSWORD '${DB_PASS[$target]}'; END IF;
END \$\$;
SQL
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || sudo -u postgres createdb -O "$db" "$db"
  sudo -u postgres psql -q -d "$db" -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
done

step "Settings files"
[ -n "$KEYS_FILE" ] && [ -f "$KEYS_FILE" ] && set -a && . "$KEYS_FILE" && set +a
for target in prod dev; do
  if [ "$target" = prod ]; then host=sssfurniture.co.in; admin=shopadmin.sssfurniture.co.in; api=4100; web=3100; db=sss_shop
  else host=dev.sssfurniture.co.in; admin=devadmin.sssfurniture.co.in; api=4200; web=3200; db=sss_shop_dev; fi
  dir="$BASE/$target"
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$dir/backend" "$dir/storefront" "$dir/admin"
  if [ ! -f "$dir/backend/.env" ]; then
    secret="$(rand 32)"
    cat > "$dir/backend/.env" <<ENV
NODE_ENV=production
PORT=$api
DATABASE_URL="postgresql://$db:${DB_PASS[$target]}@127.0.0.1:5432/$db?schema=public"
STOREFRONT_URL=https://$host
ADMIN_URL=https://$admin
MEDIA_ROOT=./storage
RUN_JOBS=false
NGINX_ACCEL=true

PAYMENTS_MODE=test
RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID:-}
RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET:-}
RAZORPAY_WEBHOOK_SECRET=
FEATURE_EMI=false
SHIPPING_PROVIDER=manual
PINCODE_LOOKUP=indiapost

SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_SECURE=${SMTP_SECURE:-false}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
MAIL_FROM="SSS Furniture <care@sssfurniture.co.in>"

GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}

REVALIDATE_URL=http://127.0.0.1:$web/api/revalidate
INTERNAL_SECRET=$secret
STAFF_2FA_REQUIRED=true
ENV
    cat > "$dir/storefront/.env.local" <<ENV
API_INTERNAL_URL=http://127.0.0.1:$api
INTERNAL_SECRET=$secret
NEXT_PUBLIC_SITE_URL=https://$host
NEXT_PUBLIC_BRAND_NAME="SSS Furniture"
ENV
    cat > "$dir/admin/.env.local" <<ENV
API_INTERNAL_URL=http://127.0.0.1:$api
NEXT_PUBLIC_STOREFRONT_URL=https://$host
ENV
  fi
  chown "$DEPLOY_USER:$DEPLOY_USER" "$dir/backend/.env" "$dir/storefront/.env.local" "$dir/admin/.env.local"
  chmod 600 "$dir/backend/.env" "$dir/storefront/.env.local" "$dir/admin/.env.local"
done
[ -n "$KEYS_FILE" ] && rm -f "$KEYS_FILE"

step "Media folders readable by Nginx"
for target in prod dev; do
  install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BASE/$target/backend/storage/public" "$BASE/$target/backend/storage/private"
  chmod o+x "$BASE/$target" "$BASE/$target/backend" "$BASE/$target/backend/storage"
  chmod -R o+rX "$BASE/$target/backend/storage/public"
  setfacl -R -m u:www-data:rX -m d:u:www-data:rX "$BASE/$target/backend/storage/private"
done

step "Firewall and fail2ban"
ufw allow OpenSSH > /dev/null
ufw allow 'Nginx Full' > /dev/null
ufw --force enable
systemctl enable --now fail2ban

step "PM2 starts on boot for $DEPLOY_USER"
env PATH="$PATH:/usr/local/bin" pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER" > /dev/null
cd "/home/$DEPLOY_USER"   # PM2 can't start from /root as another user
sudo -u "$DEPLOY_USER" -H bash -lc 'pm2 ls > /dev/null; pm2 install pm2-logrotate > /dev/null 2>&1 || true; pm2 set pm2-logrotate:max_size 50M > /dev/null; pm2 set pm2-logrotate:retain 14 > /dev/null'

step "Done"
node -v; pm2 -v; psql --version; nginx -v 2>&1
