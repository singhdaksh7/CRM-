## What & why
<!-- One or two sentences. Link the issue if there is one. -->

## Checklist
- [ ] Typecheck passed
- [ ] Lint passed
- [ ] Tests passed
- [ ] Build passed
- [ ] No production secrets included
- [ ] DB/schema changes reviewed
- [ ] Migration is backward compatible
- [ ] No production data reset/seed
- [ ] Rollback impact understood

### If `prisma/schema.prisma` or `prisma/migrations/**` changed
- [ ] Migration reviewed
- [ ] No destructive migration (no DROP TABLE/COLUMN/TYPE, TRUNCATE, type change, rename, unscoped DELETE/UPDATE)
- [ ] New migration only - no edits to already-shipped migrations
- [ ] Old app version still works against the new schema (deploy runs the migration *before* swapping the app)

## Rollback plan
<!-- How do we undo this if it misbehaves in production? (The app image rolls back automatically; the database does not.) -->
