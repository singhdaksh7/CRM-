# Development Workflow

## Golden rules

1. **Never code directly on `main`.** `main` is what production is built from.
2. One branch per change, reviewed before merge.
3. Develop only against your **local Docker database** with **demo data**.
4. Run the gates (typecheck, lint, tests, build) before asking for review.
5. A schema change always ships with a migration.

## Branch flow

```
main  →  feature branch  →  tests/gates  →  review (pull request)  →  merge to main  →  (owner) deploy
```

Branch names:

| Prefix | Use | Example |
|---|---|---|
| `feature/` | new capability | `feature/lead-source-filter` |
| `fix/` | bug fix | `fix/visit-time-timezone` |
| `docs/` | documentation only | `docs/portal-onboarding` |
| `chore/` | tooling, deps, refactor with no behaviour change | `chore/upgrade-vitest` |

## Git commands (Mac)

```bash
# Start a change from the latest main
git fetch origin --prune
git checkout main
git pull --ff-only origin main
git checkout -b fix/short-description

# Work, then review what you are about to commit
git status
git diff
git add path/to/file1 path/to/file2     # add files by name; avoid `git add -A`
git commit -m "fix(visits): short imperative summary"

# Publish and open a pull request
git push -u origin fix/short-description
gh pr create --base main --fill         # needs the GitHub CLI: brew install gh

# Keep your branch current (prefer rebase for a tidy history)
git fetch origin
git rebase origin/main
```

Do not `git push --force` to `main`, and do not push to `main` at all. Commit messages follow the existing style: `type(scope): summary` (`feat`, `fix`, `docs`, `security`, `chore`).

Never commit: `.env*` (except the two templates), database dumps, `prisma/dev.db`, `test-results/`, `*.pem`, screenshots of real data. `git status` before every commit; the `.gitignore` already covers the common cases.

## Before every pull request: the gates

These are the same checks CI runs (`.github/workflows/ci.yml`):

```bash
npx prisma validate
npx tsc --noEmit            # typecheck
npm run lint                # eslint (warnings exist today; errors must be zero)
npm test                    # vitest: all unit tests
npm run build               # next build --webpack
```

If you touched UI flows, also run the relevant Playwright specs ([TESTING.md](TESTING.md)).

## Making a schema change (Prisma migrations)

1. Make sure `.env` points at your **local** database (`localhost:5434`).
2. Edit `prisma/schema.prisma`.
3. Create the migration against your local DB:
   ```bash
   npx prisma migrate dev --name add_something_clear
   ```
   This writes `prisma/migrations/<timestamp>_add_something_clear/migration.sql`, applies it locally and regenerates the client.
4. **Read the generated SQL.** Check it does what you expect and nothing destructive (drops, type changes, `NOT NULL` without default on a populated table). Production has real rows.
5. Prefer additive, backwards-compatible changes: new nullable columns, new tables, `ALTER TYPE … ADD VALUE`. Do the destructive step in a later release, after the code no longer depends on it.
6. Commit the `schema.prisma` change **and** the new migration folder together. Never edit a migration that has already been merged: add a new one.
7. Add/adjust tests; run `npx prisma migrate status` ("up to date") and the gates.

When a migration is required: any change to models, fields, relations, indexes, `@@map`, or enums. Not required for pure TypeScript changes. If you changed `schema.prisma` and forgot the migration, CI's `migrate deploy` will not catch it, so check `git status` for a new migration folder yourself.

### Hard prohibitions

- ❌ **`prisma db push`** against production (or any shared DB). It bypasses migration history. Avoid it locally too, so your DB matches what `migrate deploy` produces.
- ❌ **`prisma migrate reset`** / `npm run db:reset` anywhere except your own disposable local database. It drops everything.
- ❌ Running anything from `prisma/manual-migrations/` or `prisma/ci/`.
- ❌ `npm run handover:reset:*`, `seed:demo` with override flags, or any script you haven't read, against a non-local database.

## Coding conventions that matter here

- **Read the Next.js 16 docs before using framework APIs.** `AGENTS.md` warns that this Next.js has breaking changes versus older versions. Check `node_modules/next/dist/docs/` for the API you are about to use. Notably, middleware is `src/proxy.ts`.
- **Tenant scoping:** every query includes `organizationId` from `getOrganizationId(session.user)`. Never trust an org id from the client.
- **Authorization:** every new API route calls `requireSession([...roles])` and, for field executives, applies row scoping. Add a test for 401/403 and for cross-org access.
- **BHK / 1 RK:** use `residentialConfigurationLabel` / `propertySpecSummary` for display and `!== null` for presence checks. Never `if (bhk)`. See [DATABASE.md](DATABASE.md).
- **Put rules in `src/lib`**, keep route handlers thin, keep components free of DB access ([ARCHITECTURE.md](ARCHITECTURE.md)).
- **Public output goes through a DTO** (`toPublicCatalogueDTO`, `public-property-select.ts`). Never serialize a Prisma row to a public page.
- **No automatic customer messaging.** New features must not send WhatsApp/SMS/email without an explicit human action, and must work with `WHATSAPP_PROVIDER=MOCK`.
- **Logging:** use `logger`; never log secrets, tokens or full phone numbers.
- Add tests next to the code (`foo.ts` → `foo.test.ts`). Bug fixes get a regression test.

## Reviewing

A reviewer should be able to answer yes to: Is it scoped to the org? Is the role check present? Does it work with integrations mocked? Is there a migration if the schema changed, and is it additive? Did the gates pass? Are there any env or secret values in the diff?

## After merge

Merging to `main` does **not** deploy anything. Production deploys are performed by the owner on the server ([DEPLOYMENT_OVERVIEW.md](DEPLOYMENT_OVERVIEW.md)). Do not attempt to deploy, and do not ask for production credentials to "check something".

Next: [DEPLOYMENT_OVERVIEW.md](DEPLOYMENT_OVERVIEW.md).
