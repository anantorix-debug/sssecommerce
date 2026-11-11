#!/usr/bin/env bash
# Runs on YOUR computer (Linux, macOS, or Windows with WSL), not on the VPS.
# Pulls the database dumps and all media from the VPS, so a copy survives
# even if the whole server is lost. Run it nightly (cron, or Task Scheduler + wsl).
#
#   VPS=deploy@203.0.113.10 DEST=~/sss-shop-backup ./pull-backup.sh
set -euo pipefail

VPS="${VPS:?set VPS=user@your-server-ip}"
DEST="${DEST:-$HOME/sss-shop-backup}"
APP_DIR="${APP_DIR:-/opt/sss-shop}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/sss-shop}"

mkdir -p "$DEST/db" "$DEST/storage"

# Database dumps: the server deletes them after 14 days; keep them here as long as you like.
rsync -az --partial "$VPS:$BACKUP_DIR/db/" "$DEST/db/"

# Media (public uploads, invoices, return photos). Files deleted on the server are
# kept here in storage-deleted/<date>/ instead of disappearing.
rsync -az --partial --delete --backup --backup-dir="$DEST/storage-deleted/$(date +%F)" \
  --exclude 'mail/' "$VPS:$APP_DIR/backend/storage/" "$DEST/storage/"

echo "$(date -Is) pulled to $DEST"
ls -1t "$DEST/db" | head -3
