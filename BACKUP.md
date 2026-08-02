# Backup

## What needs backing up
1. **Database** (PostgreSQL) — the only source of truth for all business data (properties, leads, owners, deals, payments, documents metadata, audit logs).
2. **Object storage** (S3 bucket, once §2 of `DEPLOYMENT.md` is provisioned) — the actual document files. Most managed buckets (S3) have their own versioning/replication; enable bucket versioning as a second line of defense against accidental overwrite/delete.
3. **Environment configuration** — not "backed up" in the traditional sense, but keep a secure record of what's set (a password manager entry or your platform's env-var history), since losing `AUTH_SECRET` invalidates every session and losing storage/DB credentials is an outage, not just data loss.

## Database backup

### Managed Postgres (recommended for production — see `DEPLOYMENT.md` Option A/B)
Use the provider's automated snapshots / point-in-time recovery (PITR). Confirm your provider's default retention window meets your needs (most give 7+ days on paid tiers) and that PITR is actually enabled, not just daily snapshots — PITR is what lets you restore to "5 minutes before the bad deploy" rather than only to last night.

### Self-managed Postgres (Docker/AWS RDS without managed snapshots, or local)
```bash
pg_dump "$DATABASE_URL" -F c -f backup-$(date +%Y%m%d-%H%M%S).dump
```
- `-F c` (custom format) is compressed and restorable with `pg_restore` selectively (single table, schema-only, etc.) — prefer it over plain SQL dumps.
- Store dumps somewhere other than the same host/volume as the database (S3, a separate backup server) — a backup on the same disk as the thing it backs up isn't a backup.
- Schedule via cron/systemd timer/your platform's scheduled-job feature; a sane starting cadence for a single-brokerage CRM is daily, retained 30 days, plus before every deployment (see `DEPLOYMENT.md` "Pre-deployment" checklist).

### Legacy SQLite (local dev only — not a production concern)
```bash
cp prisma/dev.db prisma/dev.db.bak-$(date +%Y%m%d)
```

## Verifying a backup is actually restorable
A backup nobody has ever restored is a hypothesis, not a backup. Periodically (e.g. monthly, or before any major schema change) restore the latest backup into a scratch database and run:
```bash
DATABASE_URL="postgresql://.../scratch_restore_test" npx prisma migrate deploy
```
then spot-check row counts against the source (`SELECT count(*) FROM leads;` etc. — same idea as `scripts/migrate-sqlite-to-postgres.ts`'s validation summary). This is exactly the `BackupRecord`/`RestoreValidation` workflow the app's own Backup module (Phase 1, Module 9) models — `POST /api/backups` records a backup's metadata, and `POST /api/backups/[id]/validate-restore` records the outcome of a drill like this. Neither endpoint executes the actual `pg_dump`/restore for you (deliberately, per the original "no fake backup system" product decision) — they're the audit trail for backups performed via the process above.

## Object storage backup
- Enable S3 bucket versioning (`aws s3api put-bucket-versioning --bucket <bucket> --versioning-configuration Status=Enabled`) so an accidental delete/overwrite is recoverable without a separate backup job.
- Cross-region replication is a reasonable addition once the Document Vault holds records the brokerage is legally required to retain (title deeds, agreements) — not set up by default here.

## What NOT to do
- Never treat `prisma/dev.db` or a local `pg_dump` file sitting on a developer's laptop as "the backup" — it must land somewhere durable and access-controlled independent of any one machine.
- Never run `prisma migrate reset` or `npm run db:reset` against a database you haven't just backed up — both are destructive resets, not migrations.

See `RESTORE.md` for how to actually use a backup when something goes wrong.
