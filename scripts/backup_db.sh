#!/usr/bin/env bash
# Daily database backup (SRS 24.12). Run on the API server:  bash scripts/backup_db.sh
# Schedule it:  crontab -e   ->   30 2 * * * bash /home/ubuntu/emtees-api/scripts/backup_db.sh >> /home/ubuntu/backups/backup.log 2>&1
# Restore:      see docs/DATABASE.md ("Backup and recovery").
set -euo pipefail
APP_DIR="${APP_DIR:-/home/ubuntu/emtees-api/server}"
OUT_DIR="${OUT_DIR:-/home/ubuntu/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$OUT_DIR"
set -a; . "$APP_DIR/.env"; set +a
FILE="$OUT_DIR/emtees-$(date +%Y%m%d-%H%M%S).sql.gz"
pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$FILE"
# also keep the receipt images
[ -d "$APP_DIR/uploads" ] && tar -czf "${FILE%.sql.gz}-uploads.tar.gz" -C "$APP_DIR" uploads
find "$OUT_DIR" -name 'emtees-*' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
