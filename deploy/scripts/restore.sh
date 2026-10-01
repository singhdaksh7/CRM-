#!/usr/bin/env bash
# Restore a pg_dump -Fc file into the LOCAL kp-postgres container (never the source DB).
# DESTRUCTIVE to the local target database only: it is dropped and recreated.
#   restore.sh /path/to/file.dump --yes-replace-local-db
set -euo pipefail
DUMP=${1:?usage: restore.sh <file.dump> --yes-replace-local-db}
[ "${2:-}" = "--yes-replace-local-db" ] || { echo "refusing: pass --yes-replace-local-db"; exit 2; }
ROOT=/opt/kp-crm; ENVF="$ROOT/env/.env.production"
[ -f "$DUMP.sha256" ] && ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" )
docker exec -i kp-postgres pg_restore -l < "$DUMP" >/dev/null   # must be a valid dump
docker stop kp-crm 2>/dev/null || true
PSQL='psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres'
docker exec kp-postgres sh -c "$PSQL -c \"DROP DATABASE IF EXISTS \\\"\$POSTGRES_DB\\\" WITH (FORCE)\" -c \"CREATE DATABASE \\\"\$POSTGRES_DB\\\"\""
docker exec -i kp-postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl --exit-on-error' < "$DUMP"
echo "restore finished. Next: deploy.sh migrate-status (expect no pending), then deploy.sh up"
