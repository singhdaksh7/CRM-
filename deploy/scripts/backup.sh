#!/usr/bin/env bash
# Nightly custom-format pg_dump with checksum and 7 daily / 4 weekly / 6 monthly retention.
# No credentials appear in filenames or output (dump runs over the container's local socket).
set -euo pipefail
B=/opt/kp-crm/backups; ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$B"/daily "$B"/weekly "$B"/monthly
f="$B/daily/kpcrm_$ts.dump"
docker exec kp-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl' > "$f.tmp"
# a real dump must be listable
docker exec -i kp-postgres pg_restore -l < "$f.tmp" >/dev/null
mv "$f.tmp" "$f"
( cd "$B/daily" && sha256sum "$(basename "$f")" > "$(basename "$f").sha256" )
[ "$(date -u +%u)" = 7 ] && cp -p "$f" "$f.sha256" "$B/weekly/"
[ "$(date -u +%d)" = 01 ] && cp -p "$f" "$f.sha256" "$B/monthly/"
prune() { ls -1t "$1"/*.dump 2>/dev/null | tail -n +$(( $2 + 1 )) | while read -r d; do rm -f "$d" "$d.sha256"; done; }
prune "$B/daily" 7; prune "$B/weekly" 4; prune "$B/monthly" 6
echo "backup ok: $(basename "$f") $(du -h "$f" | cut -f1)"
