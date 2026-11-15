#!/usr/bin/env bash
# Post-deploy verification (SAFE / READ-ONLY: GET requests + SELECT 1 + PING; creates no records).
#   healthcheck.sh <since-timestamp-for-logs>
set -uo pipefail
. "$(dirname "$0")/lib.sh"; STEP=healthcheck
SINCE=${1:-5m}; fail=0; chk() { if [ "$2" = ok ]; then log "ok    $1"; else log "FAIL  $1 -> $2"; fail=1; fi; }
DOMAIN=$(envval CRM_DOMAIN)

# container healthy (wait up to 180s) and restart count stable
for i in $(seq 1 36); do [ "$(health $CRMC)" = healthy ] && break; sleep 5; done
h=$(health $CRMC); [ "$h" = healthy ] && chk "crm container healthy" ok || chk "crm container" "$h"
r1=$(docker inspect -f '{{.RestartCount}}' $CRMC); sleep 20; r2=$(docker inspect -f '{{.RestartCount}}' $CRMC)
[ "$r1" = "$r2" ] && [ "$(docker inspect -f '{{.State.Running}}' $CRMC)" = true ] && chk "restart count stable ($r2)" ok || chk "restart count" "$r1 -> $r2 (crash loop?)"

code=$(docker exec $CRMC node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>console.log(r.status)).catch(()=>console.log(0))" 2>/dev/null)
[ "$code" = 200 ] && chk "internal /api/health 200" ok || chk "internal /api/health" "$code"
if [ -n "$DOMAIN" ]; then
  for p in /api/health /login; do
    code=$(curl -sS -L --max-redirs 3 -o /dev/null -m 20 -w '%{http_code}' "https://$DOMAIN$p" 2>/dev/null)   # TLS verified (no -k)
    [ "$code" = 200 ] && chk "https://$DOMAIN$p 200 (valid TLS)" ok || chk "https://$DOMAIN$p" "got $code"
  done
  exp=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$exp" ] && [ "$(date -d "$exp" +%s)" -gt "$(( $(date +%s) + 7*86400 ))" ]; then chk "TLS cert valid >7d (expires $exp)" ok; else chk "TLS cert" "expiry '$exp'"; fi
fi
[ "$(psql_ro 'select 1')" = 1 ] && chk "database accessible" ok || chk "database" "select 1 failed"
docker exec $REDIS sh -c 'redis-cli ping' 2>/dev/null | grep -q PONG && chk "redis PONG" ok || chk "redis" "no PONG"

bad=$(docker logs --since "$SINCE" $CRMC 2>&1 | grep -Ei 'unhandled ?rejection|uncaught ?exception|fatal error|FATAL:|PrismaClientInitializationError|P3009|P3018|migration.*(failed|error)' | head -5)
[ -z "$bad" ] && chk "no fatal/unhandled/migration errors in logs since $SINCE" ok || { chk "logs" "matches:"; echo "$bad" | cut -c1-200 | sed 's/^/        /'; }
[ $fail = 0 ] && { log "HEALTHCHECK PASSED"; exit 0; } || { log "HEALTHCHECK FAILED"; exit 1; }
