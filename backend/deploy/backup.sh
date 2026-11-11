#!/usr/bin/env bash
# Database backup on the VPS. Cron runs it every 6 hours (see deploy/README.md).
# Keeps 14 days of dumps in $BACKUP_DIR; your own computer pulls them with pull-backup.sh.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sss-shop}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/sss-shop}"
KEEP_DAYS="${KEEP_DAYS:-14}"

# DATABASE_URL from backend/.env, without Prisma's ?schema=public (pg_dump rejects it).
DB_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/backend/.env" | cut -d= -f2- | tr -d '"' | sed 's/?.*$//')"
if [ -z "$DB_URL" ]; then
  echo "DATABASE_URL not found in $APP_DIR/backend/.env" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR/db"
chmod 700 "$BACKUP_DIR"

stamp="$(date +%Y-%m-%d_%H%M)"
tmp="$BACKUP_DIR/db/.sss-shop-$stamp.dump.part"
out="$BACKUP_DIR/db/sss-shop-$stamp.dump"

# Custom format: compressed, and restorable table by table if ever needed.
pg_dump --format=custom --no-owner --dbname="$DB_URL" --file="$tmp"
mv "$tmp" "$out"

# A dump that cannot be listed is broken: fail loudly so cron mails the error.
pg_restore --list "$out" > /dev/null

find "$BACKUP_DIR/db" -name 'sss-shop-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $out ($(du -h "$out" | cut -f1))"
