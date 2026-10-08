# VPS deployment runbook (Hostinger, Traefik, Docker Compose)

Stack: `crm` (Next.js) + `postgres:17` + `redis:7`, fronted by the **existing** host-mode
Traefik (never modified). Layout on the server: `/opt/kp-crm/{repo,env,backups,scripts}`.
Secrets live only in `/opt/kp-crm/env/.env.production` (chmod 600, not in Git).

## First-time setup
1. `sudo bash 00-host-setup.sh` (root once: workspace, 2 GiB swap, ufw 22/80/443, safe sshd hardening)
2. `01-bootstrap.sh` creates the shared `kp-proxy` network
3. `02-gen-env.sh` generates DB/Redis/cron/auth secrets; then fill the R2 values privately
4. `deploy.sh build && deploy.sh up`
5. `03-install-cron.sh` installs the nightly backup (02:00 UTC) and notification sweep (03:00 UTC)

## Restoring the existing CRM data (from the Supabase dump)
```
sha256sum -c file.dump.sha256
./restore.sh /path/file.dump --yes-replace-local-db   # drops+recreates ONLY the local target DB
./counts.sh > target.tsv                                # compare with source counts (counts.sql)
./deploy.sh migrate-status                              # expect "Database schema is up to date"
./deploy.sh migrate-deploy                              # only if something is pending and reviewed
./deploy.sh up
```
Never run `prisma migrate reset`, `db push`, seeds, or `handover:*` scripts against production data.

## Update / redeploy
`git -C /opt/kp-crm/repo pull --ff-only` -> `./backup.sh` -> `deploy.sh build` -> `deploy.sh migrate-status` ->
`deploy.sh up`. NEXT_PUBLIC_* and the R2 CSP origins are baked at build time, so any hostname or
R2 bucket change needs a rebuild.

## Rollback
Tag the working image before deploying (`docker tag kp-crm:latest kp-crm:prev`). To roll back:
`CRM_IMAGE_TAG=prev docker compose -f docker-compose.prod.yml --env-file ../env/.env.production up -d --no-build crm`.
If a migration ran, restore the pre-deploy dump with `restore.sh` (data written since is lost).

## Switching to the permanent domain
1. Add an `A` record for the host -> the VPS IPv4 (Cloudflare proxy off until the cert is issued).
2. Edit `CRM_DOMAIN`, `NEXTAUTH_URL`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL` in `.env.production`.
3. `deploy.sh build && deploy.sh up` (rebuild bakes the new URL into the CSP/client).
4. Update the R2 bucket CORS `AllowedOrigins` to the new origin; keep the old one until verified.
5. Verify cert, login, upload; then remove the sslip.io origin.

## R2 bucket CORS (needed for browser-direct image uploads)
AllowedOrigins: the CRM origin; AllowedMethods: PUT, GET, HEAD; AllowedHeaders: `*`
(or at least `content-type`); ExposeHeaders: `ETag`; MaxAgeSeconds: 3600.
Failure triage: CSP block = console "Refused to connect"; CORS = preflight/OPTIONS failure;
signature = HTTP 403 SignatureDoesNotMatch from R2; app = 4xx/5xx from the CRM routes.

## Off-server backups (pending)
Local nightly dumps are in `/opt/kp-crm/backups` (7 daily/4 weekly/6 monthly). Copy them off-server
to a SEPARATE bucket/host (not the business-media bucket), encrypted; not yet configured.
