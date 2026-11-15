#!/usr/bin/env python3
"""Prisma migration safety gate (used by CI and by the production release script).

Usage:
  migration-safety.py --base <git-ref> [--head <git-ref>] [--deploy] [--allow-reviewed]

Looks ONLY at prisma/schema.prisma and prisma/migrations/** changed between
base..head. It never connects to a database.

Findings
  BLOCK   destructive / ambiguous SQL in a new migration, or an edit/delete/rename
          of an already-shipped migration.
  A BLOCK finding can be acknowledged by a human reviewer by adding this comment to
  that migration.sql:   -- safety-reviewed: <who> <why it is safe>
  * CI mode (default): an acknowledged finding passes with a warning.
  * --deploy mode: an acknowledged finding STILL blocks unless --allow-reviewed is
    passed (only the manual workflow_dispatch deploy can pass it), so a merge alone
    can never auto-deploy a destructive migration.

Exit codes: 0 ok | 1 blocked | 2 usage/git error
Writes db_changed=true|false (and migration_files=N) to $GITHUB_OUTPUT when set.
"""
import argparse
import os
import re
import subprocess
import sys

MARKER = re.compile(r"--\s*safety-reviewed:\s*\S+", re.I)

# (label, regex over a single comment-stripped, upper-cased statement)
RULES = [
    ("DROP TABLE", r"\bDROP\s+TABLE\b"),
    ("DROP COLUMN", r"\bDROP\s+COLUMN\b"),
    ("DROP SCHEMA/DATABASE", r"\bDROP\s+(SCHEMA|DATABASE)\b"),
    ("DROP TYPE (enum replacement/removal)", r"\bDROP\s+TYPE\b"),
    ("TRUNCATE", r"\bTRUNCATE\b"),
    ("ALTER COLUMN ... TYPE (destructive type change)", r"\bALTER\s+COLUMN\b.*\bTYPE\b"),
    ("RENAME (breaks the running app during rollout)", r"\bRENAME\s+(TO|COLUMN|CONSTRAINT)\b"),
    ("SET NOT NULL on existing column (can fail / needs backfill)", r"\bSET\s+NOT\s+NULL\b"),
]


def sh(*args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"git error: {' '.join(args)}\n{r.stderr.strip()}", file=sys.stderr)
        sys.exit(2)
    return r.stdout


def strip_comments(sql):
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    return re.sub(r"--[^\n]*", " ", sql)


def statements(sql):
    return [s.strip() for s in strip_comments(sql).split(";") if s.strip()]


def scan(sql):
    findings = []
    for st in statements(sql):
        up = re.sub(r"\s+", " ", st.upper())
        for label, rx in RULES:
            if re.search(rx, up):
                findings.append((label, st[:140].replace("\n", " ")))
        if re.search(r"\bDELETE\s+FROM\b", up) and not re.search(r"\bWHERE\b", up):
            findings.append(("DELETE without WHERE", st[:140].replace("\n", " ")))
        if re.match(r"UPDATE\b", up) and not re.search(r"\bWHERE\b", up):
            findings.append(("UPDATE without WHERE (mass rewrite)", st[:140].replace("\n", " ")))
        if re.search(r"\bADD\s+COLUMN\b", up) and re.search(r"\bNOT\s+NULL\b", up) \
                and not re.search(r"\bDEFAULT\b", up) and not re.search(r"\bGENERATED\b", up):
            findings.append(("ADD COLUMN NOT NULL without DEFAULT (fails on populated tables)", st[:140].replace("\n", " ")))
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--deploy", action="store_true")
    ap.add_argument("--allow-reviewed", action="store_true")
    a = ap.parse_args()

    out = sh("git", "diff", "--name-status", "--no-renames", f"{a.base}", a.head, "--",
             "prisma/schema.prisma", "prisma/migrations")
    changes = [l.split("\t", 1) for l in out.splitlines() if l.strip()]
    schema_changed = any(p == "prisma/schema.prisma" for _, p in changes)
    mig = [(s, p) for s, p in changes if p.startswith("prisma/migrations/")]
    db_changed = bool(changes)

    print(f"base={a.base} head={a.head} mode={'deploy' if a.deploy else 'ci'}")
    print(f"schema.prisma changed: {schema_changed}; migration files changed: {len(mig)}")
    gh = os.environ.get("GITHUB_OUTPUT")
    if gh:
        with open(gh, "a") as f:
            f.write(f"db_changed={'true' if db_changed else 'false'}\nmigration_files={len(mig)}\n")
    if not db_changed:
        print("OK: no database changes - normal deployment path.")
        return 0

    blocked, warned = [], []
    for status, path in mig:
        if path.endswith("migration_lock.toml"):
            if status != "A":
                blocked.append((path, "migration_lock.toml must not change", False))
            continue
        if status in ("M", "D"):
            blocked.append((path, "already-shipped migration was edited/deleted (checksum drift; "
                                  "create a NEW migration instead)", False))
            continue
        if not path.endswith("/migration.sql"):
            continue
        sql = sh("git", "show", f"{a.head}:{path}")
        reviewed = bool(MARKER.search(sql))
        for label, snippet in scan(sql):
            (warned if reviewed else blocked).append((path, f"{label}: {snippet}", reviewed))

    if schema_changed and not any(s == "A" and p.endswith("/migration.sql") for s, p in mig):
        print("WARNING: schema.prisma changed but no NEW migration was added "
              "(schema/migration drift). Confirm this is comment/format-only.")

    for p, msg, _ in warned:
        print(f"REVIEWED (acknowledged by safety-reviewed marker): {p}\n    {msg}")
    for p, msg, _ in blocked:
        print(f"BLOCK: {p}\n    {msg}")

    if blocked:
        print("\nRESULT: BLOCKED - destructive/ambiguous migration needs manual review.")
        return 1
    if warned and a.deploy and not a.allow_reviewed:
        print("\nRESULT: BLOCKED for automatic deploy - acknowledged destructive migration "
              "requires the manual 'Deploy production' workflow run with allow_reviewed_migration=true "
              "(after a human has read the SQL and verified the backup).")
        return 1
    print("\nRESULT: OK" + (" (with human-reviewed destructive statements)" if warned else
                            " - additive migrations only; deploy uses `prisma migrate deploy` only."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
