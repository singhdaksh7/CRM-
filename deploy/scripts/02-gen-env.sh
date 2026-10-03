#!/usr/bin/env bash
# Create /opt/kp-crm/env/.env.production from the template with freshly generated
# secrets. Refuses to overwrite an existing file. Prints NO secret values.
set -euo pipefail
ROOT=/opt/kp-crm
TEMPLATE="$ROOT/repo/.env.production.template"
OUT="$ROOT/env/.env.production"
[ -f "$OUT" ] && { echo "$OUT already exists - not overwriting"; exit 0; }
umask 077
pg=$(openssl rand -hex 24); rd=$(openssl rand -hex 24)
cron=$(openssl rand -hex 32); acres=$(openssl rand -hex 32); auth=${KEEP_AUTH_SECRET:-$(openssl rand -base64 48 | tr -d '\n')}
sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$pg|" \
    -e "s|__POSTGRES_PASSWORD__|$pg|g" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$rd|" \
    -e "s|__REDIS_PASSWORD__|$rd|g" \
    -e "s|^CRON_SECRET=.*|CRON_SECRET=$cron|" \
    -e "s|^ACRES_99_WEBHOOK_SECRET=.*|ACRES_99_WEBHOOK_SECRET=$acres|" \
    -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$auth|" "$TEMPLATE" > "$OUT"
chmod 600 "$OUT"
echo "created $OUT (600). Generated: POSTGRES_PASSWORD REDIS_PASSWORD CRON_SECRET AUTH_SECRET ACRES_99_WEBHOOK_SECRET"
echo "STILL TO FILL BY YOU (privately, on the server): R2_ACCOUNT_ID R2_BUCKET_NAME R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY"
