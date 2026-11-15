#!/usr/bin/env bash
# Shared helpers for the production release tooling. Source, don't execute.
# Everything here is READ-ONLY against the database unless a function says otherwise.
ROOT=${KP_ROOT:-/opt/kp-crm}
REPO="$ROOT/repo"
ENVF="$ROOT/env/.env.production"
STATE="$ROOT/state"
BK_ROOT="$ROOT/backups/pre-deploy"
PG=kp-postgres; REDIS=kp-redis; CRMC=kp-crm

log()  { printf '%s [%s] %s\n' "$(date -u +%H:%M:%S)" "${STEP:-release}" "$*"; }
die()  { printf '%s [%s] ERROR: %s\n' "$(date -u +%H:%M:%S)" "${STEP:-release}" "$1" >&2; exit "${2:-1}"; }
envval() { grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'"; }   # never echo secrets
C() { ( cd "$REPO" && docker compose -f docker-compose.prod.yml --env-file "$ENVF" "$@" ); }
health() { docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || echo missing; }
psql_ro() {  # read-only session; refuses anything that is not a SELECT/WITH
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/^[[:space:]]+//')" in
    select*|with*) ;; *) die "psql_ro refuses non-SELECT statement" ;;
  esac
  docker exec -i -e PGOPTIONS='-c default_transaction_read_only=on' "$PG" \
    sh -c 'psql -At -F "	" -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<<"$1"
}
# Runtime guard: refuse to execute any command line matching the forbidden list.
assert_allowed() {
  local pat; pat="$(dirname "${BASH_SOURCE[0]}")/forbidden-commands.txt"
  if printf '%s' "$*" | grep -qEf <(grep -vE '^\s*(#|$)' "$pat"); then die "forbidden production command blocked: $*" 99; fi
}
