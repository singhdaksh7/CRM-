#!/usr/bin/env bash
# Build + (re)start the stack. Usage: deploy.sh [build|up|migrate-status|migrate-deploy|ps]
set -euo pipefail
ROOT=/opt/kp-crm; ENVF="$ROOT/env/.env.production"
cd "$ROOT/repo"
C() { docker compose -f docker-compose.prod.yml --env-file "$ENVF" "$@"; }
case "${1:-up}" in
  build)  C build --pull crm ;;
  up)     C up -d ;;
  ps)     C ps ;;
  migrate-status|migrate-deploy)
    docker build --target migrate -t kp-crm-migrate \
      --build-arg NEXT_PUBLIC_APP_URL="$(grep ^NEXT_PUBLIC_APP_URL= "$ENVF" | cut -d= -f2-)" \
      --build-arg NEXTAUTH_URL="$(grep ^NEXTAUTH_URL= "$ENVF" | cut -d= -f2-)" .
    cmd=status; [ "$1" = migrate-deploy ] && cmd=deploy
    docker run --rm --network kp-backend --env-file "$ENVF" kp-crm-migrate npx prisma migrate "$cmd" ;;
  *) echo "usage: $0 build|up|ps|migrate-status|migrate-deploy"; exit 2 ;;
esac
