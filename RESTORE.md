# Restore & Rollback

## Application rollback (no database migration involved)
The common case — a bad deploy that didn't ship a schema migration.
- **Vercel**: promote the previous deployment from the dashboard (instant, no downtime).
- **Docker/ECS**: redeploy the previous image tag.
- **Manual/PM2/systemd**: `git checkout <previous-tag> && npm ci && npx prisma generate && npm run build && npm start` (or restart your process manager pointed at the previous build).

No database changes needed. Validate with the post-deployment smoke tests in `OPERATIONS.md` after rolling back.

## Migration rollback
Prisma has no native `migrate down`. Two paths, in order of preference:

1. **Forward-fix (preferred)**: write and apply a new migration that reverses the problematic change. Keeps `_prisma_migrations` history linear and auditable — this is what you want 90% of the time (e.g. a bad column default, a missing index).
2. **Restore + redeploy together (emergency)**: if the bad migration corrupted data or the forward-fix isn't safe to reason about under time pressure, restore the database from the pre-deploy backup (`BACKUP.md`) **and** redeploy the app version from before that migration, together — app code and schema must stay in lockstep. Deploying old app code against a new (unrolled-back) schema, or vice versa, is how you get confusing runtime errors on top of the original incident.

Never hand-edit rows in `_prisma_migrations` to "mark a migration as not applied" — this desyncs Prisma's view of the schema from reality and every subsequent `migrate deploy` becomes unpredictable.

## Database restore

### From a managed provider snapshot/PITR
Follow your provider's restore flow (usually: restore to a new instance, verify, then either promote it or copy `DATABASE_URL` over). Restoring in-place onto the live instance is riskier — prefer restore-to-new + cutover when the provider supports it, so the broken instance is still there to diff against if something looks wrong.

### From a `pg_dump` file
```bash
# Into a NEW database first - never restore directly onto a live instance you might need to compare against.
createdb delhi_broker_crm_restored
pg_restore -d "postgresql://user:pass@host/delhi_broker_crm_restored" backup-20260802.dump
```
Validate row counts and spot-check a few relationships (same pattern as `scripts/migrate-sqlite-to-postgres.ts`'s summary table) before pointing `DATABASE_URL` at the restored database.

### Legacy SQLite → PostgreSQL (one-time historical path)
If you ever need to replay the original SQLite → Postgres cutover (e.g. rebuilding an environment from scratch using the archived pre-migration data):
```bash
npx prisma migrate deploy   # applies prisma/migrations/ (Postgres) against an EMPTY database
SQLITE_SOURCE_PATH=./prisma/dev.db.bak-YYYYMMDD npx tsx scripts/migrate-sqlite-to-postgres.ts
```
This was verified end-to-end during Phase 3 (see `DEPLOYMENT.md` §1.3) — safe to re-run, skips duplicates.

## File-storage consistency after a rollback
Because `replaceDocument` always writes a *new* object key (never overwrites in place — see `DEPLOYMENT.md` §2), a database rollback to an earlier point naturally still resolves to valid, intact objects in the bucket. No object-storage cleanup is needed specifically because of an app/database rollback. The only case objects can go stale is the unrelated one of a `Document` row being hard-deleted from the database directly (bypassing the app's soft-delete) — don't do that; use the app's `DELETE /api/documents/[id]`, which only ever soft-deletes metadata.

## Environment rollback
Keep the previous deployment's env-var snapshot (most platforms — Vercel, most PaaS — version these automatically; for self-managed deployments, keep `.env` files under your own change control, never in git). A rollback that reintroduces new-version env vars against old-version code is a common source of "rolled back but still broken" incidents.

## Validation after any rollback
Re-run the full post-deployment smoke-test checklist in `OPERATIONS.md` against the rolled-back version. A rollback isn't complete until it's been verified, not just deployed.
