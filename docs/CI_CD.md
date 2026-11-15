# CI/CD and development workflow

Production: <https://crm.kpproperties.co.in> (Hostinger VPS, Docker Compose: `crm` + `postgres` + `redis` behind Traefik).
This is a LIVE system with real customer data. The pipeline is built so that a merge can never reset, reseed or destructively migrate it.

## 1. Branch flow

`main` is the only permanent branch. Nobody commits to it directly.

```bash
git checkout main && git pull origin main
git checkout -b feature/property-pagination      # or fix/..., chore/..., docs/...
# ...work, commit...
git push -u origin feature/property-pagination
# open a Pull Request into main
```

PR -> CI green -> review (1 approval) -> merge -> **Deploy production** workflow -> approval -> backup -> deploy.
Delete the branch after merge (GitHub does this automatically if "Automatically delete head branches" is on).

## 2. CI (`.github/workflows/ci.yml`)

Runs on every push to any branch and every PR into `main`. Three required jobs plus an aggregate:

| Job | What it checks |
|---|---|
| `validate` | checkout, Node 22 (same as the Dockerfile), `npm ci`, `prisma validate`, `prisma generate`, `git diff --check`, replay of tracked migrations on a throwaway Postgres (`prisma migrate deploy`), `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` |
| `repo-safety` | tracked `.env*` files, DB dumps/backups/keys, large `.sql` dumps, private keys and API tokens, production DB URLs with passwords, privileged/docker.sock/published-DB-port compose settings, and any CI/deploy file that references a command forbidden on production (`deploy/scripts/forbidden-commands.txt`) |
| `db-migration-safety` | detects changes to `prisma/schema.prisma` / `prisma/migrations/**` and scans new migrations (section 3) |
| `ci-passed` | aggregate of the above |

Failing CI means the PR is not mergeable (branch protection requires `validate`, `repo-safety`, `db-migration-safety`). CI never auto-fixes code.

## 3. Database change rules

* Production migrations use **only** `npx prisma migrate deploy` (run in a one-off container, by `release.sh`, only when the migration gate passed).
* Never on production: `prisma migrate reset`, `prisma db push`, `prisma migrate dev`, `npm run db:seed`, `npm run seed:demo`, `db:reset`, `handover:*`. These patterns are blocked three ways: the CI static scan, a runtime guard in the release script, and the SSH forced command can only run `release`.
* `deploy/scripts/migration-safety.py` blocks (CI fails, deploy refuses):
  `DROP TABLE/COLUMN/SCHEMA/TYPE`, `TRUNCATE`, `ALTER COLUMN ... TYPE`, `RENAME`, `SET NOT NULL`, `ADD COLUMN ... NOT NULL` without `DEFAULT`, `DELETE`/`UPDATE` without `WHERE`, and **any edit/delete of an already-shipped migration**.
* Write migrations **additive and backward compatible**: the deploy runs the migration *before* swapping the app, so the old app runs against the new schema for a short time. Do destructive cleanup in a later release after the code stopped using the column.
* If a destructive statement is truly needed: a human reads the SQL, adds `-- safety-reviewed: <name> <why safe>` to that `migration.sql`, CI then passes with a warning, but **the automatic deploy still blocks**. Run **Actions -> Deploy production -> Run workflow** with `allow_reviewed_migration = true` after confirming a fresh backup. Database rollback is always manual.

## 4. Deployment (`.github/workflows/deploy.yml`)

Trigger: CI completed successfully on a **push to `main`** (i.e. after a merge), or a manual `workflow_dispatch`. Feature/PR branches and failed CI never deploy.

1. `resolve`: SHA must be on `main`, and `validate`, `repo-safety`, `db-migration-safety` must be green for exactly that SHA. A stale (non-tip) SHA is skipped.
2. `deploy` waits for **approval of the `vps-production` environment** (required reviewer; only branch `main` may deploy).
3. It SSHes to the VPS and runs `deploy/scripts/release.sh <sha>` (via a forced command, section 8). The script always runs the helper scripts from the target commit.

`release.sh` steps (any failure before the swap leaves production untouched):

1. Single-deployment lock (`/opt/kp-crm/state/deploy.lock`) + GitHub `concurrency: production-deploy`.
2. SHA must be on `origin/main` and a descendant of what is running (no accidental downgrade).
3. **Preflight** (`preflight.sh`, read-only): env file exists, source SHA known, current image recorded, crm/postgres/redis healthy, `/api/health` 200 (internal and public), disk <85% used and >=5 GB free, no failed/in-progress rows in `_prisma_migrations`.
4. **Migration gate**: `migration-safety.py --deploy` over `<running SHA>..<target SHA>`.
5. **Data baseline** (`baseline.sh capture`): read-only row counts of every public table + active admins + applied migrations.
6. **Backup** (`pre-deploy-backup.sh`) to `/opt/kp-crm/backups/pre-deploy/<UTC timestamp>/`: `kpcrm.dump` (pg_dump -Fc), `kpcrm.dump.sha256`, `pg_restore -l` verification (must list table data), `env.production.bak` (0600), `meta.txt` (timestamp, target SHA, previous SHA, previous image), `release.log`. Backup failure stops the deploy. Last 14 kept.
7. **Build** `kp-crm:<first 12 chars of git SHA>` from the exact commit. Image ID, tag, SHA and build time are recorded in `/opt/kp-crm/state/current.env` and `history.log`. `latest` is only updated after success and is never the deploy source.
8. **Migrate** (only if schema/migrations changed and the gate passed): `npx prisma migrate deploy` in a one-off container on the internal network.
9. **Deploy only `crm`**: `docker compose up -d --no-deps --no-build --force-recreate crm`. Postgres, Redis and Traefik are not touched.
10. **Health checks** (`healthcheck.sh`, GET-only; no records are created): crm container healthy, restart count stable for 20 s, `/api/health` 200 internally, `https://<domain>/api/health` and `/login` 200 with TLS verified, certificate valid >7 days, `SELECT 1`, Redis `PONG`, recent crm logs free of fatal/unhandled-rejection/Prisma-init/migration errors.
11. **Baseline compare**: flags catastrophic change only (core table emptied or down >10%, other table down >50%, vanished table, organization count down, no active admin, `_prisma_migrations` shrank). Staff using the CRM during the deploy does not trip it.

Exit codes: `0` ok, `1` gate failed (prod unchanged), `20` migration failed (old app still running), `30` health failed and rolled back, `31` health failed and rollback failed, `40` data anomaly, `75` another deploy running.

## 5. Rollback

* **Automatic** (step 10 fails): the crm container is recreated from the previous image (pinned as `kp-crm:rollback-<timestamp>` before anything changes), the source checkout is returned to the previous SHA, health is re-verified. The database is **not** rolled back.
* **Manual**, on the VPS as the deploy user:
  ```bash
  /opt/kp-crm/repo/deploy/scripts/rollback.sh list                       # history + available images
  /opt/kp-crm/repo/deploy/scripts/rollback.sh rollback-20261115T101500Z  # or a <sha12> tag
  ```
* **Database**: never automatic. Restore from `/opt/kp-crm/backups/pre-deploy/<ts>/kpcrm.dump` only after review (`deploy/scripts/restore.sh <dump> --yes-replace-local-db` drops and recreates the DB and loses data written since the backup). Prefer a forward-fix migration.

## 6. Emergency manual deploy (GitHub unavailable)

```bash
ssh deploy@<vps>
cd /opt/kp-crm/repo && git fetch origin
/opt/kp-crm/repo/deploy/scripts/release.sh <40-char-sha-on-main> --dry-run   # always dry-run first
/opt/kp-crm/repo/deploy/scripts/release.sh <40-char-sha-on-main>
```
The same locks, backup, gates and rollback apply. Do not use `docker compose up` / `git pull` by hand for routine deploys.

## 7. Recovering the previous image

`docker images kp-crm` lists `kp-crm:<sha12>` for each release and `kp-crm:rollback-<ts>` pinned before each deploy (newest 6 kept). `cat /opt/kp-crm/state/current.env` shows the running and previous image/SHA. Then `rollback.sh <tag>`.

## 8. One-time server setup

1. As `deploy`: `git -C /opt/kp-crm/repo pull --ff-only` once, so `release.sh`, `ssh-entry.sh` and the other scripts exist on the server. `mkdir -p /opt/kp-crm/state /opt/kp-crm/backups/pre-deploy`.
2. Create a dedicated key: `ssh-keygen -t ed25519 -f kp-crm-deploy -C github-actions-kp-crm`. In `~deploy/.ssh/authorized_keys` add:
   `command="/opt/kp-crm/repo/deploy/scripts/ssh-entry.sh",restrict ssh-ed25519 AAAA... github-actions-kp-crm`
   so the key can only run `release <sha> [--dry-run] [--allow-reviewed-migration]`. The `deploy` user must be able to run `docker` and have `python3`, `flock`, `curl`, `openssl`.
3. Get the host key line: `ssh-keyscan -p 22 <vps-host>` (verify the fingerprint out-of-band) for `DEPLOY_SSH_KNOWN_HOSTS`.
4. First run: **Actions -> Deploy production -> Run workflow** with `dry_run = true`.

## 9. GitHub configuration

### Secrets (environment `vps-production`, Settings -> Environments; values are never in the repo)

| Secret | Contents |
|---|---|
| `DEPLOY_HOST` | VPS hostname or IP |
| `DEPLOY_USER` | SSH user (`deploy`) |
| `DEPLOY_SSH_KEY` | private half of the dedicated deploy key |
| `DEPLOY_SSH_KNOWN_HOSTS` | pinned host key line(s) from `ssh-keyscan` |
| `DEPLOY_PORT` | optional, default 22 |

The production `.env.production` stays on the server (`/opt/kp-crm/env/`, chmod 600) and is never read by or copied to GitHub. No application secrets are stored in GitHub for deployment.

### Environment `vps-production`
Required reviewer (manual approval before every deploy), deployment branches limited to `main`. (The pre-existing `Production`/`Preview` environments belong to the Vercel integration and are unused by this workflow.)

### Branch protection on `main`
Pull request required; 1 approval; required checks `validate`, `repo-safety`, `db-migration-safety` (branch must be up to date); conversation resolution; no force pushes; no deletion. If this was not applied by API, set the same in Settings -> Branches -> Add rule. Optional hardening: "Do not allow bypassing" (enforce for admins), "Require review from Code Owners" (`.github/CODEOWNERS` covers `.github/`, `deploy/`, `prisma/`, Dockerfile, compose files).

## 10. Production safety rules (summary)

Never on production: wipe/recreate/reseed the DB, `migrate reset`, `db push`, demo seed, handover reset, editing customer rows to test, replacing the env file, restarting postgres/redis/traefik, deploying a feature or PR branch. Smoke checks are GET-only. Treat production data as immutable apart from normal business writes by staff.

## Pipeline validation log

- 2026-11-15: CI/CD activated on the VPS; deploy workflow dry run passed (docs-only PR used to validate required checks and branch protection).
