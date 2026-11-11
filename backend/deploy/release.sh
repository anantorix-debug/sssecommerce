#!/usr/bin/env bash
# Builds and starts (or updates) one copy of the shop: the folder this script lives in decides which.
#   bash /opt/sss-shop/prod/backend/deploy/release.sh    (live, branch prod)
#   bash /opt/sss-shop/dev/backend/deploy/release.sh     (test, branch dev)
# GitHub Actions runs it after every push (.github/workflows/deploy.yml).
# Order matters: the storefront build reads pages from the API, so the API is migrated and running first.
# Stops at the first error; running processes keep serving the previous version.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="$(basename "$APP_DIR")"
[ "$TARGET" = dev ] || TARGET=prod
if [ "$TARGET" = dev ]; then API_PORT=4200; WEB_PORT=3200; ADMIN_PORT=3201; else API_PORT=4100; WEB_PORT=3100; ADMIN_PORT=3101; fi
ECO="$APP_DIR/backend/deploy/ecosystem.config.cjs"
step() { printf '\n==> [%s] %s\n' "$TARGET" "$*"; }

# One release at a time on this server (live and test builds would fight over 2 CPUs and memory).
exec 9> /tmp/sss-shop-release.lock
flock 9

start_or_reload() { # pm2 app names
  for name in "$@"; do
    if pm2 describe "$name" > /dev/null 2>&1; then pm2 reload "$name" --update-env; else pm2 start "$ECO" --only "$name"; fi
  done
}

wait_for() { # url label
  for _ in $(seq 1 60); do
    if curl -fsS -o /dev/null "$1"; then echo "$2 is up"; return 0; fi
    sleep 2
  done
  echo "$2 did not answer at $1. Check: pm2 logs" >&2
  return 1
}

for f in backend/.env storefront/.env.local admin/.env.local; do
  [ -f "$APP_DIR/$f" ] || { echo "Missing $APP_DIR/$f (templates: backend/deploy/env/)" >&2; exit 1; }
done

if [ "$TARGET" = prod ] && [ -d /var/backups/sss-shop ]; then
  step "Backing up the database first"
  APP_DIR="$APP_DIR" bash "$APP_DIR/backend/deploy/backup.sh"
fi

step "API: install, build, migrate"
cd "$APP_DIR/backend"
npm ci --include=dev --no-audit --no-fund
npm run build
npx prisma migrate deploy
start_or_reload "$TARGET-api" "$TARGET-jobs"
wait_for "http://127.0.0.1:$API_PORT/v1/health" "API"

step "Storefront: install, build"
cd "$APP_DIR/storefront"
npm ci --include=dev --no-audit --no-fund
npm run build
start_or_reload "$TARGET-storefront"
wait_for "http://127.0.0.1:$WEB_PORT/" "Storefront"

step "Admin: install, build"
cd "$APP_DIR/admin"
npm ci --include=dev --no-audit --no-fund
npm run build
start_or_reload "$TARGET-admin"
wait_for "http://127.0.0.1:$ADMIN_PORT/login" "Admin"

pm2 save > /dev/null
step "Done"
pm2 status
