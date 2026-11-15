#!/usr/bin/env bash
# READ-ONLY production data baseline + catastrophe detector.
#   baseline.sh capture <out.tsv>
#   baseline.sh compare <pre.tsv> <post.tsv>      exit 0 ok | 1 catastrophic change
# Staff keep working during a deploy, so counts are NOT compared for equality; only for
# collapse (empty core tables, missing org/admins, big drops, vanished tables).
set -uo pipefail
. "$(dirname "$0")/lib.sh"; STEP=baseline
case "${1:-}" in
capture)
  out=${2:?out file}
  { psql_ro "$(cat "$(dirname "$0")/counts.sql")" | sed 's/^/count\t/'
    psql_ro "select 'admins_active', count(*) from users where role='ADMIN' and status='ACTIVE'" | sed 's/^/extra\t/'
    psql_ro "select 'orgs_distinct_on_properties', count(distinct \"organizationId\") from properties" | sed 's/^/extra\t/' || true
    psql_ro "select 'migrations_applied', count(*) from _prisma_migrations where finished_at is not null" | sed 's/^/extra\t/'
  } > "$out.tmp" && mv "$out.tmp" "$out" && log "baseline captured: $(wc -l < "$out") rows -> $out" ;;
compare)
  pre=${2:?pre}; post=${3:?post}
  awk -F'\t' -v OFS='\t' '
    BEGIN { split("organizations users leads properties visits deals owners", k, " "); for (i in k) core[k[i]]=1; bad=0 }
    FNR==NR { p[$1 "|" $2]=$3; next }
    { q[$1 "|" $2]=$3 }
    END {
      for (key in p) {
        split(key, a, "|"); kind=a[1]; name=a[2]; pre=p[key]+0
        if (!(key in q)) { if (pre>0 && kind=="count") { print "FAIL table vanished or empty-set: " name; bad=1 } ; continue }
        post=q[key]+0
        if (kind=="count") {
          if (name in core && pre>0 && post==0) { print "FAIL core table emptied: " name " (" pre " -> 0)"; bad=1 }
          else if (name in core && pre>=20 && post < pre*0.90) { print "FAIL core table dropped >10%: " name " (" pre " -> " post ")"; bad=1 }
          else if (pre>=50 && post < pre*0.50) { print "FAIL table dropped >50%: " name " (" pre " -> " post ")"; bad=1 }
          else if (name=="organizations" && post<pre) { print "FAIL organization count decreased: " pre " -> " post; bad=1 }
        } else {
          if (name=="admins_active" && pre>0 && post==0) { print "FAIL no active ADMIN users remain"; bad=1 }
          if (name=="migrations_applied" && post<pre) { print "FAIL _prisma_migrations shrank (reset?): " pre " -> " post; bad=1 }
        }
      }
      if (!bad) print "baseline compare OK (no catastrophic change)"
      exit bad
    }' "$pre" "$post" ;;
*) echo "usage: $0 capture <out> | compare <pre> <post>"; exit 2 ;;
esac
