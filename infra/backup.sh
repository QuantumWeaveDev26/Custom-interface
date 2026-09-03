#!/usr/bin/env bash
# Nightly database backup.
#
# The database holds accounts, credit balances and the ledger, and every row of
# it is unrecoverable — the generated files live in TOS and survive anything,
# but who owns them and what they cost does not. A platform without backups is
# one bad disk away from not knowing what anyone paid for.
#
# Install on the server as a root cron job:
#   chmod +x infra/backup.sh
#   sudo crontab -e
#   0 3 * * * /opt/creative-ai/infra/backup.sh >> /var/log/creative-ai-backup.log 2>&1
#
# Restoring is the other half, and it is not real until it has been tried once:
#   gunzip -c /var/backups/creative-ai/db-2026-09-03.sql.gz \
#     | docker compose -f infra/docker-compose.prod.yml exec -T postgres \
#         psql -U app -d creative_ai

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/creative-ai}"
KEEP_DAYS="${KEEP_DAYS:-14}"

source "${REPO_DIR}/infra/.env.production"

mkdir -p "${BACKUP_DIR}"
STAMP="$(date +%F)"
TARGET="${BACKUP_DIR}/db-${STAMP}.sql.gz"

docker compose -f "${REPO_DIR}/infra/docker-compose.prod.yml" \
  --env-file "${REPO_DIR}/infra/.env.production" \
  exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip > "${TARGET}"

# A dump that failed halfway still leaves a file. Refuse to call that a backup.
if [ ! -s "${TARGET}" ]; then
  echo "$(date -Is) FAILED: ${TARGET} is empty" >&2
  rm -f "${TARGET}"
  exit 1
fi

find "${BACKUP_DIR}" -name 'db-*.sql.gz' -mtime "+${KEEP_DAYS}" -delete

echo "$(date -Is) ok $(du -h "${TARGET}" | cut -f1) ${TARGET}"
