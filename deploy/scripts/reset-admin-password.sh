#!/usr/bin/env bash
# Interactive password reset for ONE ADMIN account. Run on the VPS in a real terminal:
#   ssh -t kp-production /opt/kp-crm/repo/deploy/scripts/reset-admin-password.sh singhdaksh9760@gmail.com
# The password is typed at a hidden prompt; it is never an argument, env var, file or log line.
# bcryptjs is bundled into the Next build (not resolvable in the image), so a vendored copy of the
# same pure-JS package is copied into the container's /tmp for the run and removed afterwards.
set -euo pipefail
EMAIL="${1:?usage: $0 <admin-email>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
VENDOR=/opt/kp-crm/vendor/bcryptjs
[ -f "$VENDOR/package.json" ] || { echo "missing $VENDOR"; exit 1; }
[ -t 0 ] && [ -t 1 ] || { echo "needs a TTY: ssh -t ..."; exit 1; }

cleanup() { docker exec -u 0 kp-crm rm -rf /tmp/kp-reset >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker exec -u 0 kp-crm sh -c "rm -rf /tmp/kp-reset && mkdir -p /tmp/kp-reset/node_modules"
docker cp "$VENDOR" kp-crm:/tmp/kp-reset/node_modules/bcryptjs
docker cp "$HERE/reset-admin-password.cjs" kp-crm:/tmp/kp-reset/reset.cjs
docker exec -it -w /app -e RESET_TARGET_EMAIL="$EMAIL" kp-crm node /tmp/kp-reset/reset.cjs
