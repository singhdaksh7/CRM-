#!/usr/bin/env bash
# Exact row count for every public table, as "table<TAB>count". Local target DB:
#   counts.sh > target.tsv
# For the SOURCE, run the same SQL (deploy/scripts/counts.sql) read-only via psql.
set -euo pipefail
cat "$(dirname "$0")/counts.sql" | docker exec -i kp-postgres sh -c 'psql -At -F "	" -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
