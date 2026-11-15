#!/usr/bin/env bash
# Offline tests for cleanup-merged-branch.sh using a mock `gh` (no network, no GitHub writes).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"; export MOCK="$T/m"
cat > "$T/bin/gh" <<'M'
#!/usr/bin/env bash
a="$*"
case "$a" in
  *"-X DELETE"*) echo "$a" >> "$MOCK/deleted"; [ -f "$MOCK/delete_fail" ] && { echo "HTTP 403 forbidden" >&2; exit 1; }; exit 0;;
  *"/commits/"*"/pulls"*) cat "$MOCK/pulls.json";;
  *"/git/ref/heads/"*) [ -f "$MOCK/ref_404" ] && { echo "gh: Not Found (HTTP 404)" >&2; exit 1; }; cat "$MOCK/ref.json";;
  *"/branches/"*) cat "$MOCK/protected";;
  *"/pulls?state=open"*) cat "$MOCK/open.json";;
  *) echo "unexpected gh call: $a" >&2; exit 9;;
esac
M
chmod +x "$T/bin/gh"; export PATH="$T/bin:$PATH"
SHA=8e5f96b428c733e3226c785d3707f483f9850a33; HSHA=62107888b43a68838421c25e26f912f6511f9325
fail=0
setup() { # branch base merged(true/false) head_repo tip protected open_json
  rm -rf "$MOCK"; mkdir -p "$MOCK"
  local merged=null; [ "$3" = true ] && merged='"2026-11-15T08:50:41Z"'
  cat > "$MOCK/pulls.json" <<J
[{"number":27,"merged_at":$merged,"merge_commit_sha":"$SHA","base":{"ref":"$2"},"head":{"ref":"$1","sha":"$HSHA","repo":{"full_name":"$4"}}}]
J
  echo "{\"object\":{\"sha\":\"$5\"}}" > "$MOCK/ref.json"; echo "$6" > "$MOCK/protected"; echo "$7" > "$MOCK/open.json"
}
run() { REPO=o/r SHA=$SHA DEFAULT_BRANCH=main GH_TOKEN=x bash "$HERE/cleanup-merged-branch.sh" 2>&1; echo "rc=$?"; }
expect() { # name expect_deleted(yes/no) expect_text
  local out; out=$(run); local del=no; [ -s "$MOCK/deleted" ] && del=yes
  if [ "$del" = "$2" ] && grep -q "rc=0" <<<"$out" && grep -qF -- "$3" <<<"$out"; then echo "PASS  $1"; else echo "FAIL  $1 (deleted=$del)"; echo "$out" | sed 's/^/      /'; fail=1; fi
}
setup fix/x main true o/r $HSHA false '[]';            expect "success: merged+deployed -> branch deleted" yes "Source branch deleted successfully"
grep -qF 'git/refs/heads/fix/x' "$MOCK/deleted" && [ "$(grep -c . "$MOCK/deleted")" = 1 ] && echo "PASS  only the PR source branch was targeted" || { echo "FAIL  delete target"; fail=1; }
setup main main true o/r $HSHA false '[]';             expect "main is never deleted" no "refusing to delete main/default"
setup release main true o/r $HSHA false '[]'; REPO=o/r SHA=$SHA DEFAULT_BRANCH=release bash "$HERE/cleanup-merged-branch.sh" >/dev/null 2>&1; [ -s "$MOCK/deleted" ] && { echo "FAIL  default branch deleted"; fail=1; } || echo "PASS  repo default branch never deleted"
setup fix/x main false o/r $HSHA false '[]';           expect "PR not merged -> no deletion" no "SKIP"
setup fix/x develop true o/r $HSHA false '[]';         expect "PR base != main -> no deletion" no "SKIP"
setup fix/x main true evil/fork $HSHA false '[]';      expect "fork PR -> no deletion" no "not in o/r"
setup fix/x main true o/r deadbeef false '[]';         expect "commits pushed after merge -> kept" no "keeping it"
setup fix/x main true o/r $HSHA true '[]';             expect "protected branch -> kept" no "protected"
setup fix/x main true o/r $HSHA false '[{"head":{"ref":"other"},"base":{"ref":"fix/x"}}]'; expect "open PR based on it -> kept" no "open PR"
setup fix/x main true o/r $HSHA false '[]'; touch "$MOCK/ref_404"; expect "already deleted -> no-op success" no "already deleted"
setup fix/x main true o/r $HSHA false '[]'; touch "$MOCK/delete_fail"; expect "API delete failure -> warning, rc 0" yes "::warning::branch-cleanup: could not delete"
setup 'bad name;rm' main true o/r $HSHA false '[]';    expect "malformed branch name -> refused" no "malformed"
setup fix/x main true o/r $HSHA false '[]'; echo '[]' > "$MOCK/pulls.json"; expect "no PR for commit -> no deletion" no "found 0"
# workflow-level gates (failed deploy / rollback keep the branch)
W="$HERE/../workflows/deploy.yml"
grep -q "needs.deploy.result == 'success'" "$W" && grep -q "inputs.dry_run != true" "$W" && echo "PASS  workflow runs cleanup only after deploy job success (failed/rolled-back deploy keeps branch)" || { echo "FAIL  workflow gate"; fail=1; }
exit $fail
