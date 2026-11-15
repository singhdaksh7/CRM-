#!/usr/bin/env bash
# Delete the source branch of the PR whose merge commit was just deployed to production.
# Runs only AFTER a fully successful deploy (see deploy.yml). ALWAYS exits 0: a cleanup
# problem must never turn a successful deployment red - it logs a warning instead.
#
# env: GH_TOKEN, REPO (owner/name), SHA (40-hex deployed merge commit), DEFAULT_BRANCH
# Deletes ONLY if: exactly one PR is associated with SHA, it is merged, base == main,
# head is in this repo (not a fork), the name is sane and is not main/default/protected,
# the branch tip still equals the PR's merged head SHA (nothing pushed after the merge),
# and no other open PR uses the branch as head or base.
set -uo pipefail
note() { echo "branch-cleanup: $*"; }
warn() { echo "::warning::branch-cleanup: $*"; }
skip() { note "SKIP - $*"; exit 0; }
trap 'rc=$?; [ "$rc" -ne 0 ] && warn "unexpected error (rc=$rc); deployment result is unaffected"; exit 0' EXIT

REPO=${REPO:-}; SHA=${SHA:-}; DEFAULT=${DEFAULT_BRANCH:-}
[[ "$REPO" =~ ^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] || skip "bad REPO"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || skip "bad SHA"
[ -n "$DEFAULT" ] || skip "default branch unknown"

prs=$(gh api "repos/$REPO/commits/$SHA/pulls" 2>&1) || { warn "cannot look up PR for ${SHA:0:12}: $(echo "$prs" | head -c 200)"; exit 0; }
sel=$(jq -c --arg sha "$SHA" '[.[] | select(.merged_at != null and .base.ref == "main" and .merge_commit_sha == $sha)]' <<<"$prs") || { warn "unparseable PR list"; exit 0; }
[ "$(jq length <<<"$sel")" = 1 ] || skip "expected exactly one merged PR into main for ${SHA:0:12}, found $(jq length <<<"$sel")"
num=$(jq -r '.[0].number' <<<"$sel"); ref=$(jq -r '.[0].head.ref // ""' <<<"$sel")
hsha=$(jq -r '.[0].head.sha // ""' <<<"$sel"); hrepo=$(jq -r '.[0].head.repo.full_name // ""' <<<"$sel")

note "PR #$num source branch: ${ref:-<none>}"
[ "$hrepo" = "$REPO" ] || skip "PR #$num head is not in $REPO (fork or deleted repo)"
[ -n "$ref" ] || skip "empty branch name"
[[ "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] && [[ "$ref" != -* ]] && [[ "$ref" != */ ]] && [[ "$ref" != *..* ]] && [[ "$ref" != *.lock ]] || skip "malformed branch name"
{ [ "$ref" = main ] || [ "$ref" = "$DEFAULT" ] || [ "$ref" = master ]; } && skip "refusing to delete main/default branch '$ref'"

out=$(gh api "repos/$REPO/git/ref/heads/$ref" 2>&1); rc=$?
if [ $rc -ne 0 ]; then
  if grep -qiE "not found|404" <<<"$out"; then note "branch '$ref' already deleted - nothing to do"; exit 0; fi
  warn "cannot read branch '$ref': $(echo "$out" | head -c 200)"; exit 0
fi
tip=$(jq -r '.object.sha // ""' <<<"$out")
[ "$tip" = "$hsha" ] || skip "branch '$ref' tip ${tip:0:8} != merged PR head ${hsha:0:8} (commits pushed after merge) - keeping it"

enc=$(jq -rn --arg r "$ref" '$r|@uri')
prot=$(gh api "repos/$REPO/branches/$enc" --jq '.protected' 2>&1) || { warn "cannot verify protection of '$ref'"; exit 0; }
[ "$prot" = false ] || skip "branch '$ref' is protected ($prot)"

open=$(gh api "repos/$REPO/pulls?state=open&per_page=100" 2>&1) || { warn "cannot list open PRs"; exit 0; }
n=$(jq --arg r "$ref" '[.[] | select(.head.ref == $r or .base.ref == $r)] | length' <<<"$open") || { warn "unparseable open PR list"; exit 0; }
[ "$n" = 0 ] || skip "$n open PR(s) still use '$ref'"

note "Production deployment successful"
note "Deleting merged source branch '$ref' (PR #$num)..."
if err=$(gh api -X DELETE "repos/$REPO/git/refs/heads/$ref" 2>&1); then
  note "Source branch deleted successfully"
else
  warn "could not delete '$ref': $(echo "$err" | head -c 200) (deployment still successful)"
fi
exit 0
