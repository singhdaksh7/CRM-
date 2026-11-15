#!/usr/bin/env bash
# Roll the CRM container back to a previously built image. NEVER touches the database.
#   rollback.sh list                 show deploy history + available images
#   rollback.sh <image-tag> [source-sha]   e.g. rollback.sh rollback-20261115T101500Z
#                                          or    rollback.sh 1a2b3c4d5e6f
# If a migration shipped in the release you are leaving, the OLD code runs on the NEW schema
# (additive migrations are designed for this). DB restore is manual: see docs/CI_CD.md.
set -Eeuo pipefail
. "$(dirname "$0")/lib.sh"; STEP=rollback
[ "${1:-}" = list ] && { cat "$STATE/current.env" 2>/dev/null; echo ---; tail -20 "$STATE/history.log" 2>/dev/null; echo ---; docker images kp-crm --format '{{.Tag}}\t{{.CreatedSince}}\t{{.ID}}'; exit 0; }
TAGN=${1:?usage: rollback.sh list | <image-tag> [source-sha]}; TAGN=${TAGN#kp-crm:}
mkdir -p "$STATE"; exec 9>"$STATE/deploy.lock"; flock -n 9 || die "a deployment is running" 75
docker image inspect "kp-crm:$TAGN" >/dev/null 2>&1 || die "image kp-crm:$TAGN not found (try: rollback.sh list)"
SRC=${2:-}; [ -z "$SRC" ] && [[ "$TAGN" =~ ^[0-9a-f]{12}$ ]] && SRC=$(git -C "$REPO" rev-parse "$TAGN^{commit}" 2>/dev/null || true)
log "rolling crm back to kp-crm:$TAGN (source ${SRC:-unknown}); only the crm service is recreated"
SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CRM_IMAGE_TAG="$TAGN" C up -d --no-deps --no-build --force-recreate crm
"$(dirname "$0")/healthcheck.sh" "$SINCE" || die "rolled-back crm is NOT healthy - see output" 31
[ -n "$SRC" ] && git -C "$REPO" checkout -q --detach "$SRC" || true
echo "$(date -u +%Y%m%dT%H%M%SZ) MANUAL-ROLLBACK image=kp-crm:$TAGN src=${SRC:-?}" >> "$STATE/history.log"
log "rollback complete and verified"
