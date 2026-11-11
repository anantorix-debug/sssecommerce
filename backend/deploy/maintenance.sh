#!/usr/bin/env bash
# Weekly housekeeping on the VPS (see deploy/README.md for the cron line).
# Keeps the Next.js resized-image cache under its 15 GB budget. (PM2 logs are rotated by pm2-logrotate.)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/sss-shop}"
CACHE="$APP_DIR/storefront/.next/cache/images"
LIMIT_GB="${IMAGE_CACHE_GB:-15}"

if [ -d "$CACHE" ]; then
  # Resized copies nobody asked for in 30 days are rebuilt on demand if needed again.
  find "$CACHE" -type f -atime +30 -delete
  # Still over budget: remove the least recently used until under the limit.
  limit=$((LIMIT_GB * 1024 * 1024))
  used=$(du -sk "$CACHE" | cut -f1)
  if [ "$used" -gt "$limit" ]; then
    find "$CACHE" -type f -printf '%A@ %k %p\n' | sort -n | while read -r _ size path; do
      [ "$used" -le "$limit" ] && break
      rm -f "$path"
      used=$((used - size))
    done
  fi
  find "$CACHE" -mindepth 1 -type d -empty -delete
  echo "image cache: $(du -sh "$CACHE" | cut -f1)"
fi

# Development mail copies are never written in production, but clear any strays.
find "$APP_DIR/backend/storage/mail" -type f -mtime +7 -delete 2>/dev/null || true

df -h "$APP_DIR" | tail -1
