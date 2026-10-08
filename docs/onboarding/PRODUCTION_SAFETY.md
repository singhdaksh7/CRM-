# Production Safety

**Production (`https://crm.kpproperties.co.in`) contains real customers' names, phone numbers, requirements, visits, owners, deals and payments. Real staff use it every day. A mistake here harms real people and the business, and most mistakes cannot be undone.**

These rules are not bureaucracy. Each one exists because of how this system is built.

## The rules

| # | Rule | Why it exists |
|---|---|---|
| 1 | **Production contains real customer data. Treat it as confidential.** | Phone numbers and requirements are personal data; leaking or screenshotting them is a privacy breach and a business risk. |
| 2 | **Never use the production database for local development**, not even read-only "just to look". | There is no reason to need it: `npm run seed:demo` gives realistic fake data. Any connection from a laptop is exposure of real data, and a wrong script is one keystroke from damage. |
| 3 | **Never run destructive SQL** (`DELETE`, `TRUNCATE`, `DROP`, unbounded `UPDATE`). | Foreign keys **cascade**: deleting a lead silently deletes its visits, follow-ups, activities, score history and shares. |
| 4 | **Never run `prisma migrate reset`** (or `npm run db:reset`) anywhere but your own disposable local DB. | It drops the whole database. |
| 5 | **Never run `prisma db push` against production.** | It bypasses migration history and can drop columns/data to match the schema file. |
| 6 | **Back up before any deployment or migration; verify the checksum.** | The only recovery from a bad migration is the dump. An unverified dump is not a backup. |
| 7 | **Preserve a rollback image before deploying.** | The previous image is the fastest way to undo a bad release. |
| 8 | **Test data must be uniquely tagged** (for example a `QA<run-id>` prefix on names/codes, `@example.test` emails, fake `+9110000…` phones). | So it can be found and removed precisely, and nobody mistakes it for a real lead. |
| 9 | **Never delete rows with broad conditions** such as "older than a week", "status = X", "name contains test". Delete by exact ids you listed first. | Broad conditions match real rows you did not anticipate. |
| 10 | **Do not send test WhatsApp or email to customers.** Keep `WHATSAPP_PROVIDER=MOCK` locally; never set `WHATSAPP_TEST_RECIPIENT` to a real person. | A message to a real client cannot be recalled and damages trust. Meta can also penalise the number. |
| 11 | **Never expose `.env.production`** (commit, chat, screenshot, email, laptop copy). | It holds the database, Redis, auth, storage and webhook secrets: full access to everything. |
| 12 | **Do not modify real leads or properties for testing.** | Staff act on what they see; a test edit can cancel a visit or change a price someone quotes to a client. |

## Practical guidance

- **Your environment is local and fake.** Everything in [MAC_SETUP.md](MAC_SETUP.md) works with no production access. If a task seems to need production data, ask the owner for a sanitised sample or reproduce with demo data.
- **Check `DATABASE_URL` before any script.** `echo $DATABASE_URL` should show `localhost`/`127.0.0.1`. A hosted or unfamiliar host means stop.
- **Scripts with guards are not permission.** `seed:demo`, the E2E suite and the QA seeds refuse non-local databases, and the demo seed has a loud override for known production hosts. Never set `DEMO_SEED_ALLOW_REMOTE`, `I_UNDERSTAND_THIS_WRITES_DEMO_DATA_TO_PRODUCTION` or `DEMO_SEED_CONFIRMATION`. The `handover:reset:*` and `handover:r2-cleanup:*` scripts exist for a one-off, owner-run data handover: **do not run them at all**.
- **Webhooks are real entry points.** 99acres and Housing POST real customers into production. If you test a webhook locally, use obviously fake payloads and a throwaway secret.
- **Public pages are public.** `/p/[id]` and `/share/catalogue/[token]` are readable by anyone with the link; keep them going through the whitelist DTOs.
- **Screenshots and logs:** no real names or phone numbers in PRs, docs, issues or chat. This onboarding contains none.
- **Secrets in Git:** if you accidentally commit a secret, tell the owner immediately so it can be rotated; deleting it in a later commit does not remove it from history.
- **Fixing something in production:** open a branch, add a test, get it reviewed and merged, and let the owner deploy it with a backup and rollback ready. No live hot-fixes from your machine.

## If something goes wrong

Stop, do not "fix forward" with more commands, and tell the owner exactly what you ran and where. A calm, honest report early is far cheaper than a clean-up of a second mistake.

Next: [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
