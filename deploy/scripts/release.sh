#!/usr/bin/env bash
# Production release of an exact main commit. Runs ON THE VPS (invoked over SSH by the
# "Deploy production" workflow, or by hand in an emergency).
#
#   release.sh <40-hex-sha> [--dry-run] [--allow-reviewed-migration]
#
# Gates, in order (any failure stops BEFORE production is touched unless stated):
#   lock -> sha is on origin/main -> preflight -> migration safety gate -> baseline
#   -> pre-deploy backup (verified) -> build kp-crm:<sha12> -> [prisma migrate deploy]
#   -> recreate ONLY the crm service -> health checks -> baseline compare
#   Health failure after the swap => automatic rollback of crm to the previous image.
#   Databases are NEVER rolled back automatically.
# Exit: 0 ok | 1 gate failed (prod unchanged) | 20 migration failed | 30 deploy failed+rolled back
#       | 31 deploy failed AND rollback failed | 40 data baseline anomaly | 75 another deploy running
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHA=${1:-}; shift || true
DRY=0; ALLOW_REVIEWED=0
for a in "$@"; do case "$a" in --dry-run) DRY=1;; --allow-reviewed-migration) ALLOW_REVIEWED=1;; *) echo "unknown arg $a"; exit 2;; esac; done
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "usage: $0 <40-hex-sha> [--dry-run] [--allow-reviewed-migration]"; exit 2; }

ROOT=${KP_ROOT:-/opt/kp-crm}; REPO="$ROOT/repo"

# --- bootstrap: always run the helper scripts of the TARGET commit, not whatever is checked out ---
if [ -z "${RELEASE_BOOTSTRAPPED:-}" ]; then
  git -C "$REPO" fetch --prune origin
  git -C "$REPO" cat-file -e "$SHA^{commit}" 2>/dev/null || { echo "ERROR: $SHA not found after fetch"; exit 1; }
  git -C "$REPO" merge-base --is-ancestor "$SHA" origin/main || { echo "ERROR: $SHA is not on origin/main - refusing (production deploys main only)"; exit 1; }
  TMPD=$(mktemp -d "$ROOT/.release-XXXXXX"); trap 'rm -rf "$TMPD"' EXIT
  git -C "$REPO" archive "$SHA" deploy/scripts | tar -x -C "$TMPD"
  RELEASE_BOOTSTRAPPED=1 RELEASE_TMP="$TMPD" bash "$TMPD/deploy/scripts/release.sh" "$SHA" "$@"; exit $?
fi
. "$HERE/lib.sh"

mkdir -p "$STATE" "$BK_ROOT"
exec 9>"$STATE/deploy.lock"
flock -n 9 || die "another deployment is running (lock $STATE/deploy.lock)" 75

TS=$(date -u +%Y%m%dT%H%M%SZ); TAG=${SHA:0:12}; DIR="$BK_ROOT/$TS"; mkdir -p "$DIR"; chmod 700 "$DIR"
exec > >(tee -a "$DIR/release.log") 2>&1
STEP=init
log "release start: target=$SHA tag=kp-crm:$TAG dry_run=$DRY backup_dir=$DIR"

[ -z "$(git -C "$REPO" status --porcelain --untracked-files=no)" ] || die "repo checkout has local changes; refusing"
PREV_SHA=$(git -C "$REPO" rev-parse HEAD)
PREV_IMG_ID=$(docker inspect -f '{{.Image}}' $CRMC 2>/dev/null || echo "")
PREV_IMG_TAG="rollback-$TS"
if [ "$PREV_SHA" = "$SHA" ] && [ "$(health $CRMC)" = healthy ] && [ -z "${FORCE_REDEPLOY:-}" ]; then log "already deployed and healthy: nothing to do"; exit 0; fi
git -C "$REPO" merge-base --is-ancestor "$PREV_SHA" "$SHA" || die "deployed $PREV_SHA is not an ancestor of $SHA (older/diverged commit). Use rollback.sh to go back." 1

STEP=preflight;  "$HERE/preflight.sh" || die "preflight failed - production untouched"
STEP=migration-gate
MIGARGS=(--deploy --base "$PREV_SHA" --head "$SHA"); [ $ALLOW_REVIEWED = 1 ] && MIGARGS+=(--allow-reviewed)
MIGOUT=$(cd "$REPO" && python3 "$HERE/migration-safety.py" "${MIGARGS[@]}") || { echo "$MIGOUT"; die "migration safety gate BLOCKED the deploy - manual review required (prod untouched)"; }
echo "$MIGOUT"
DB_CHANGED=0; echo "$MIGOUT" | grep -q 'no database changes' || DB_CHANGED=1

STEP=baseline; "$HERE/baseline.sh" capture "$DIR/baseline-pre.tsv" || die "could not capture baseline"

if [ $DRY = 1 ]; then
  log "DRY RUN complete. Would: backup -> build kp-crm:$TAG -> $([ $DB_CHANGED = 1 ] && echo 'prisma migrate deploy -> ')recreate crm only -> healthcheck (rollback to kp-crm:$PREV_IMG_TAG on failure). Nothing was changed."
  exit 0
fi

STEP=backup
docker tag "$PREV_IMG_ID" "kp-crm:$PREV_IMG_TAG" || die "cannot pin previous image for rollback"
"$HERE/pre-deploy-backup.sh" "$DIR" "$SHA" "$PREV_SHA" "$PREV_IMG_TAG" || die "BACKUP FAILED - deployment stopped, production untouched"
{ echo "previous_image_id=$PREV_IMG_ID"; } >> "$DIR/meta.txt"

STEP=build
rollback_checkout() { git -C "$REPO" checkout -q --detach "$PREV_SHA" || true; }
git -C "$REPO" checkout -q --detach "$SHA" || die "checkout $SHA failed"
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if ! CRM_IMAGE_TAG="$TAG" C build crm; then rollback_checkout; die "image build failed - production untouched (old crm still running)"; fi
IMG_ID=$(docker image inspect "kp-crm:$TAG" -f '{{.Id}}') || { rollback_checkout; die "built image missing"; }
log "image kp-crm:$TAG id=$IMG_ID built_at=$BUILT_AT source=$SHA"

if [ $DB_CHANGED = 1 ]; then
  STEP=migrate
  log "database changes detected and gate passed -> prisma migrate deploy (ONLY command ever run against prod schema)"
  ARGS=(--build-arg "NEXT_PUBLIC_APP_URL=$(envval NEXT_PUBLIC_APP_URL)" --build-arg "NEXTAUTH_URL=$(envval NEXTAUTH_URL)")
  assert_allowed "prisma migrate deploy"
  ( cd "$REPO" && docker build --target migrate -t "kp-crm-migrate:$TAG" "${ARGS[@]}" . ) || { rollback_checkout; die "migrate image build failed - prod untouched"; }
  if ! docker run --rm --network kp-backend --env-file "$ENVF" "kp-crm-migrate:$TAG" npx prisma migrate deploy; then
    rollback_checkout
    die "prisma migrate deploy FAILED. Old crm is still running. The database is NOT rolled back automatically - review the error, check \`prisma migrate status\`, and use backup $DIR if needed." 20
  fi
fi

STEP=deploy
LOGSINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
log "recreating ONLY the crm service (postgres/redis/traefik untouched)"
if CRM_IMAGE_TAG="$TAG" C up -d --no-deps --no-build --force-recreate crm && "$HERE/healthcheck.sh" "$LOGSINCE"; then
  OK=1
else
  OK=0
fi

if [ $OK = 0 ]; then
  STEP=rollback
  log "DEPLOY HEALTH FAILED -> rolling crm back to kp-crm:$PREV_IMG_TAG (source $PREV_SHA). Database is left as-is."
  docker logs --tail 80 $CRMC 2>&1 | sed 's/^/    crm: /' | cut -c1-220 || true
  rollback_checkout
  RB=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if CRM_IMAGE_TAG="$PREV_IMG_TAG" C up -d --no-deps --no-build --force-recreate crm && "$HERE/healthcheck.sh" "$RB"; then
    echo "$TS FAILED $SHA rolled_back_to=$PREV_SHA image=$PREV_IMG_TAG" >> "$STATE/history.log"
    die "deploy of $SHA FAILED health checks; crm rolled back to $PREV_SHA and verified healthy. Fix forward via a new PR." 30
  fi
  echo "$TS FAILED+ROLLBACK_FAILED $SHA" >> "$STATE/history.log"
  die "deploy AND automatic rollback failed. MANUAL ACTION NEEDED: deploy/scripts/rollback.sh $PREV_IMG_TAG ; backup at $DIR" 31
fi

STEP=baseline-post
"$HERE/baseline.sh" capture "$DIR/baseline-post.tsv" && if ! "$HERE/baseline.sh" compare "$DIR/baseline-pre.tsv" "$DIR/baseline-post.tsv"; then
  echo "$TS DEPLOYED-BUT-DATA-ANOMALY $SHA" >> "$STATE/history.log"
  die "DATA BASELINE ANOMALY after deploy (see above). App is up but NOT rolled back automatically; investigate immediately. Backup: $DIR" 40
fi

STEP=finish
docker tag "kp-crm:$TAG" kp-crm:latest    # keeps the old `deploy.sh up` runbook consistent; never used as the deploy source
cat > "$STATE/current.env" <<S
SOURCE_SHA=$SHA
IMAGE_TAG=kp-crm:$TAG
IMAGE_ID=$IMG_ID
BUILT_AT=$BUILT_AT
DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
PREVIOUS_SHA=$PREV_SHA
PREVIOUS_IMAGE_TAG=kp-crm:$PREV_IMG_TAG
BACKUP_DIR=$DIR
S
echo "$TS OK $SHA image=kp-crm:$TAG id=$IMG_ID prev=$PREV_SHA prev_image=kp-crm:$PREV_IMG_TAG backup=$DIR" >> "$STATE/history.log"
# retention: keep newest 14 pre-deploy dirs and newest 6 rollback-* image tags (never the running image)
ls -1dt "$BK_ROOT"/*/ 2>/dev/null | tail -n +15 | xargs -r rm -rf
docker images --format '{{.Tag}}' kp-crm | grep '^rollback-' | sort -r | tail -n +7 | while read -r t; do docker rmi "kp-crm:$t" >/dev/null 2>&1 || true; done
log "RELEASE OK: $SHA deployed as kp-crm:$TAG (previous: $PREV_SHA / kp-crm:$PREV_IMG_TAG)"
