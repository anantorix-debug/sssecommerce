#!/usr/bin/env bash
# Builds and starts (or updates) the shop on the VPS. Run as the deploy user after the code is in place:
#   bash /opt/sss-shop/backend/deploy/release.sh
# Order matters: the storefront build reads pages from the API, so the API is migrated and running first.
# Stops at the first error; already-running processes keep serving the previous version.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sss-shop}"
ECO="$APP_DIR/backend/deploy/ecosystem.config.cjs"
step() { printf '\n==> %s\n' "$*"; }

start_or_reload() { # name...
  for name in "$@"; do
    if pm2 describe "$name" > /dev/null 2>&1; then pm2 reload "$name" --update-env; else pm2 start "$ECO" --only "$name"; fi
  done
}

wait_for() { # url label
  for _ in $(seq 1 45); do
    if curl -fsS -o /dev/null "$1"; then echo "$2 is up"; return 0; fi
    sleep 2
  done
  echo "$2 did not answer at $1. Check: pm2 logs" >&2
  return 1
}

for f in backend/.env storefront/.env.local admin/.env.local; do
  [ -f "$APP_DIR/$f" ] || { echo "Missing $APP_DIR/$f (templates: backend/deploy/env/)" >&2; exit 1; }
done

if [ -x "$APP_DIR/backend/deploy/backup.sh" ] && [ -d /var/backups/sss-shop ]; then
  step "Backing up the database first"
  "$APP_DIR/backend/deploy/backup.sh"
fi

step "API: install, build, migrate"
cd "$APP_DIR/backend"
npm ci --include=dev --no-audit --no-fund
npm run build
npx prisma migrate deploy
start_or_reload shop-api shop-jobs
wait_for http://127.0.0.1:4100/v1/health "API"

step "Storefront: install, build"
cd "$APP_DIR/storefront"
npm ci --include=dev --no-audit --no-fund
npm run build
start_or_reload shop-storefront
wait_for http://127.0.0.1:3100/ "Storefront"

step "Admin: install, build"
cd "$APP_DIR/admin"
npm ci --include=dev --no-audit --no-fund
npm run build
start_or_reload shop-admin
wait_for http://127.0.0.1:3101/login "Admin"

pm2 save > /dev/null
step "Done"
pm2 status
