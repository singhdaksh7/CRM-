#!/usr/bin/env bash
# Read-only production preflight. Exit non-zero (and say why) if it is unsafe to deploy.
# Usage: preflight.sh   (run on the VPS)
set -uo pipefail
. "$(dirname "$0")/lib.sh"; STEP=preflight
fail=0; chk() { if [ "$2" = ok ]; then log "ok    $1"; else log "FAIL  $1 -> $2"; fail=1; fi; }

[ -f "$ENVF" ] && chk "production env file present (not printed)" ok || chk "production env file" "missing $ENVF"
[ -d "$REPO/.git" ] && chk "repo checkout" ok || chk "repo checkout" "missing $REPO"
SRC=$(git -C "$REPO" rev-parse HEAD 2>/dev/null) && chk "source SHA known: ${SRC:0:12}" ok || chk "source SHA" unknown
for c in $CRMC $PG $REDIS; do h=$(health $c); [ "$h" = healthy ] && chk "$c healthy" ok || chk "$c health" "$h"; done
IMG=$(docker inspect -f '{{.Image}} {{.Config.Image}}' $CRMC 2>/dev/null) && chk "current image recorded: $IMG" ok || chk "current image" "cannot inspect $CRMC"
RC=$(docker inspect -f '{{.RestartCount}}' $CRMC 2>/dev/null || echo ?); [ "$RC" = 0 ] && chk "crm restart count 0" ok || log "warn  crm restart count=$RC (informational)"

DOMAIN=$(envval CRM_DOMAIN)
code=$(docker exec $CRMC node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>console.log(r.status)).catch(()=>console.log(0))" 2>/dev/null)
[ "$code" = 200 ] && chk "internal /api/health = 200" ok || chk "internal /api/health" "got $code"
if [ -n "$DOMAIN" ]; then
  code=$(curl -sS -o /dev/null -m 15 -w '%{http_code}' "https://$DOMAIN/api/health" 2>/dev/null)
  [ "$code" = 200 ] && chk "https://$DOMAIN/api/health = 200" ok || chk "public /api/health" "got $code"
fi

used=$(df --output=pcent "$ROOT" | tail -1 | tr -dc 0-9); free_gb=$(df -BG --output=avail "$ROOT" | tail -1 | tr -dc 0-9)
{ [ "${used:-100}" -lt 85 ] && [ "${free_gb:-0}" -ge 5 ]; } && chk "disk ${used}% used, ${free_gb}G free" ok || chk "disk space" "${used}% used, ${free_gb}G free (need <85% and >=5G)"

bad=$(psql_ro "select count(*) from _prisma_migrations where finished_at is null and rolled_back_at is null") || bad=err
[ "$bad" = 0 ] && chk "no failed/in-progress migrations" ok || chk "migration state" "unfinished migrations: $bad"
n=$(psql_ro "select count(*) from _prisma_migrations where finished_at is not null") && log "info  applied migrations: $n"

[ $fail = 0 ] && { log "PREFLIGHT PASSED"; exit 0; } || { log "PREFLIGHT FAILED"; exit 1; }
