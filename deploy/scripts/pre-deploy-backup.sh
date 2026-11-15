#!/usr/bin/env bash
# Create + verify a fresh pre-deploy backup. Read-only against the database (pg_dump).
#   pre-deploy-backup.sh <dest-dir> <target-sha> <previous-sha> <previous-image-tag>
# Produces in <dest-dir>: kpcrm.dump, kpcrm.dump.sha256, env.production.bak (0600), meta.txt
# Exit non-zero on ANY verification failure (the release must then STOP).
set -euo pipefail
. "$(dirname "$0")/lib.sh"; STEP=backup
D=${1:?dest}; TSHA=${2:?target sha}; PSHA=${3:-unknown}; PIMG=${4:-unknown}
umask 077; mkdir -p "$D"; f="$D/kpcrm.dump"
log "pg_dump -Fc -> $f"
docker exec $PG sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl' > "$f.tmp"
sz=$(wc -c < "$f.tmp"); [ "$sz" -gt 10240 ] || die "dump suspiciously small ($sz bytes)"
n=$(docker exec -i $PG pg_restore -l < "$f.tmp" | grep -c 'TABLE DATA') || true
[ "${n:-0}" -ge 5 ] || die "pg_restore -l shows only ${n:-0} TABLE DATA entries - invalid dump"
mv "$f.tmp" "$f"; ( cd "$D" && sha256sum kpcrm.dump > kpcrm.dump.sha256 && sha256sum -c kpcrm.dump.sha256 >/dev/null )
cp -p "$ENVF" "$D/env.production.bak"; chmod 600 "$D/env.production.bak"
cat > "$D/meta.txt" <<M
created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
target_source_sha=$TSHA
previous_source_sha=$PSHA
previous_image_tag=$PIMG
dump_bytes=$sz
table_data_entries=$n
sha256=$(cut -d' ' -f1 "$D/kpcrm.dump.sha256")
restore_hint=deploy/scripts/restore.sh $D/kpcrm.dump --yes-replace-local-db   (DESTRUCTIVE to local DB; manual review only)
M
log "backup verified: $(du -h "$f" | cut -f1), $n table-data entries, checksum ok"
