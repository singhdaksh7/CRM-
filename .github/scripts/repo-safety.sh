#!/usr/bin/env bash
# Static repo safety scan (CI). Read-only. Fails on:
#  - committed .env files, DB dumps/backups, private keys
#  - recognisable credentials / production DB URLs with embedded passwords
#  - dangerous deployment config (privileged containers, docker.sock, published DB ports)
#  - CI/CD or deploy scripts that invoke commands forbidden against production
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
fail=0
bad() { echo "::error::$*"; fail=1; }
files() { git ls-files -z; }

echo "== committed env files =="
while IFS= read -r f; do
  case "$f" in
    *.example|*.template|*.sample) ;;
    *) bad "env file is tracked: $f" ;;
  esac
done < <(git ls-files | grep -E '(^|/)\.env($|\.)')

echo "== DB dumps / backups / keys =="
while IFS= read -r f; do bad "dump/backup/key-like file is tracked: $f"; done < <(
  git ls-files | grep -Ei '\.(dump|pgdump|backup|bak|sqlite|sqlite3|db|sql\.gz|sql\.zip|tar\.gz|pem|p12|pfx|key)$' \
  | grep -v '^prisma/migrations.sqlite-archive/')
# very large .sql files are likely data dumps (schema migrations are small)
while IFS= read -r f; do
  [ -f "$f" ] || continue
  sz=$(wc -c < "$f"); [ "$sz" -gt 2097152 ] && bad "large .sql (>2MB, possible data dump): $f"
  grep -qiE '^(COPY [a-z_."]+ \(.*\) FROM stdin|-- PostgreSQL database dump)' "$f" && bad "looks like a pg_dump: $f"
done < <(git ls-files '*.sql')

echo "== credentials =="
SELF='^(\.github/scripts/repo-safety\.sh)$'
scan() { # label, ERE
  local hits
  hits=$(git grep -nIE -e "$2" -- . ':!package-lock.json' ':!.github/scripts/repo-safety.sh' ':!*.test.ts' ':!*.test.tsx' ':!*.md' 2>/dev/null | head -5)
  [ -n "$hits" ] && { bad "possible $1:"; echo "$hits" | sed -E 's/(.{0,120}).*/    \1/'; }
}
scan "private key"            '-----BEGIN ((RSA|EC|DSA|OPENSSH|PGP) )?PRIVATE KEY'
scan "AWS access key"         'AKIA[0-9A-Z]{16}'
scan "GitHub token"           '(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{30,}'
scan "Anthropic/OpenAI key"   '(sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{40,})'
scan "Slack token"            'xox[baprs]-[A-Za-z0-9-]{10,}'
scan "Google API key"         'AIza[0-9A-Za-z_-]{35}'
# DB URL with an inline password to a non-local, non-placeholder host
hits=$(git grep -nIE 'postgres(ql)?://[^:/@[:space:]]+:[^@[:space:]]+@[a-zA-Z0-9.-]+' -- . ':!package-lock.json' ':!.github/scripts/repo-safety.sh' ':!*.test.ts' ':!*.md' \
  | grep -viE '@(localhost|127\.0\.0\.1|postgres|db|host|hostname|kp-postgres|\$|%)|<|\$\{|:(password|pass|build|crm_ci_password|postgres)@|placeholder|example|changeme|your[-_]' | head -5)
[ -n "$hits" ] && { bad "possible production DB URL with embedded password:"; echo "$hits" | sed -E 's/:[^:@/]+@/:***@/;s/(.{0,120}).*/    \1/'; }
# Specific to this project: Supabase / managed-DB hosts must never be committed
hits=$(git grep -nIE '[a-z0-9]{20}\.supabase\.(co|com)|\.rds\.amazonaws\.com' -- . ':!.github/scripts/repo-safety.sh' ':!*.md' ':!*.test.ts' | head -3)
[ -n "$hits" ] && { bad "managed-DB hostname committed:"; echo "$hits"; }

echo "== dangerous deployment config =="
for f in $(git ls-files 'docker-compose*.yml' 'docker-compose*.yaml'); do
  grep -nE 'privileged:\s*true|/var/run/docker\.sock|network_mode:\s*host|pid:\s*host' "$f" | sed "s|^|    $f:|" | grep . && bad "dangerous compose option in $f"
done
if [ -f docker-compose.prod.yml ]; then
  grep -nE '^\s+- "?[0-9.:]*(5432|6379):' docker-compose.prod.yml | grep . && bad "docker-compose.prod.yml publishes a DB/Redis port"
fi
grep -nE '^\s*(USER\s+root|ENV\s+[A-Z_]*(SECRET|PASSWORD|TOKEN)[A-Z_]*=\S{8,})' Dockerfile 2>/dev/null | grep . && bad "Dockerfile has root user or baked secret"

echo "== forbidden production commands in CI/CD + deploy tooling =="
PATFILE=deploy/scripts/forbidden-commands.txt
[ -f "$PATFILE" ] || bad "$PATFILE missing"
# NOTE: deploy.sh legitimately has migrate-deploy only; restore.sh/backup docs are not in the scanned set
SCAN_SET=$(git ls-files '.github/workflows/*' 'deploy/scripts/*.sh' 'deploy/scripts/*.py' 'Dockerfile' 'docker-compose.prod.yml' \
  | grep -vE "restore\.sh|^$PATFILE$|\.github/scripts/repo-safety\.sh")
if [ -n "$SCAN_SET" ]; then
  # shellcheck disable=SC2086
  grep -nEf <(grep -vE '^\s*(#|$)' "$PATFILE") $SCAN_SET 2>/dev/null | grep -vE ':[0-9]+:\s*#' | grep . \
    && bad "CI/CD or deploy script references a command forbidden against production (see $PATFILE)"
fi

[ "$fail" = 0 ] && echo "repo-safety: OK" || { echo "repo-safety: FAILED"; exit 1; }
