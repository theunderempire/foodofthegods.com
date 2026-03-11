#!/bin/bash
# MongoDB backup script
# Run via cron: 0 2 * * * /path/to/backup.sh >> /var/log/fotg-backup.log 2>&1

set -e

BACKUP_DIR="${BACKUP_DIR:-/var/backups/foodofthegods}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/mongo_$TIMESTAMP"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Load env if not already set
if [ -f "$(dirname "$0")/../.env.production" ]; then
  export $(grep -v '^#' "$(dirname "$0")/../.env.production" | xargs)
fi

: "${DB_USERNAME:?DB_USERNAME not set}"
: "${DB_PASSWORD:?DB_PASSWORD not set}"
: "${DB_NAME:?DB_NAME not set}"

mkdir -p "$BACKUP_DIR"

echo "[$TIMESTAMP] Starting backup..."

docker exec foodofthegods-db mongodump \
  --username "$DB_USERNAME" \
  --password "$DB_PASSWORD" \
  --authenticationDatabase admin \
  --db "$DB_NAME" \
  --out /tmp/mongo_backup

docker cp foodofthegods-db:/tmp/mongo_backup "$BACKUP_PATH"
docker exec foodofthegods-db rm -rf /tmp/mongo_backup

tar -czf "$BACKUP_PATH.tar.gz" -C "$BACKUP_DIR" "mongo_$TIMESTAMP"
rm -rf "$BACKUP_PATH"

# Prune old backups
find "$BACKUP_DIR" -name "mongo_*.tar.gz" -mtime +$RETENTION_DAYS -delete

echo "[$TIMESTAMP] Backup complete: $BACKUP_PATH.tar.gz"
