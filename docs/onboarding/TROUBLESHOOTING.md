# Troubleshooting

Every fix below is local-only and safe. Before running anything that writes, confirm you are on your own machine and that `DATABASE_URL` in `.env` contains `localhost`.

## Docker is not running

Symptom: `Cannot connect to the Docker daemon` or `docker compose` hangs.

```bash
open -a Docker              # start Docker Desktop, wait for "running"
docker info | head -5       # should print server details
docker compose up -d
```

## A port is already in use

Local ports: **3000** (app), **5434** (Postgres), **6380** (Redis), 9002/9003 (MinIO), **3100** (Playwright).

```bash
lsof -nP -iTCP:5434 -sTCP:LISTEN     # who owns the port
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

- If the owner is another project you need, change the host side of the mapping in `docker-compose.yml` (for example `"5435:5432"`) **and** the port in `DATABASE_URL`/`DIRECT_URL`. Don't commit that change unless the team agrees.
- If it is a stale dev server of this project: stop it with `Ctrl+C` in its terminal, or `kill <pid>`.
- Run the app on another port with `npm run dev -- -p 3001` (also update `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` to match).

## Database connection failure

Symptoms: `P1001: Can't reach database server`, `ECONNREFUSED 127.0.0.1:5434`, or pages erroring.

```bash
docker compose ps                         # postgres must be "healthy"
docker compose logs --tail 30 postgres
docker compose up -d
grep -E '^(DATABASE_URL|DIRECT_URL)=' .env | sed -E 's#//([^:]+):[^@]+@#//\1:***@#'   # check host/port/db without printing the password
```

Expected: `localhost:5434/delhi_broker_crm`. If `.env` is missing, `cp .env.example .env`.

## Redis unavailable

Redis is optional. Errors like `redis_error` in the dev log are non-fatal (everything fails open). To silence them, leave `REDIS_URL` unset in `.env`, or start Redis with `docker compose up -d redis`. Conversely, if you see **HTTP 429 / "Too many requests"** or login lockouts during local work, a Redis-backed rate limiter is active: unset `REDIS_URL` and restart `npm run dev`, or wait out the window.

## Prisma client not generated / out of date

Symptoms: `@prisma/client did not initialize yet`, missing model or enum members, TypeScript errors on `prisma.something`.

```bash
npx prisma generate
```

Re-run it after every `git pull` that touched `prisma/schema.prisma`, and after `npm ci`. If the engine download fails (`ENOTFOUND binaries.prisma.sh`), it is a network/DNS problem: check connectivity or VPN and retry.

## Migrations not applied / schema drift

Symptoms: `The table … does not exist`, `column … does not exist`.

```bash
npx prisma migrate status      # lists pending migrations
npx prisma migrate deploy      # applies them (local DB)
```

If your **local** database is hopelessly out of sync and holds nothing you need:

```bash
docker compose down -v         # deletes ALL local data in the project's volumes
docker compose up -d
npx prisma migrate deploy
npm run seed:demo
```

Never use these on anything but your own local containers.

## Cannot log in

1. **No users yet?** Run `npm run seed:demo` and use `demo.admin.1@kpproperties.demo` / `DemoPass@123`.
2. **Right DB?** The seed and `npm run dev` must both read the same `.env` (`DATABASE_URL`).
3. **Rate limited?** See Redis above.
4. **"Invalid"/redirect loops after changing env:** clear cookies for `localhost`; make sure `NEXTAUTH_URL` is exactly `http://localhost:3000` (not `https`, not `127.0.0.1`) and you browse to that same origin. Changing `AUTH_SECRET` invalidates existing sessions, which is expected.
5. **Wrong role page:** field executives land on Today's Work (`/executive-dashboard`); some pages redirect by design ([ROLES_AND_PERMISSIONS.md](ROLES_AND_PERMISSIONS.md)).
6. **Startup error `Invalid environment configuration`:** the message lists the exact variables. Compare with `.env.example`; remember a half-set R2/S3 trio or `META_CLOUD` without all Meta values is rejected.

## Node version mismatch

```bash
node -v                # use 22.x to match production (20.9+ is the minimum for Next 16)
which node             # must point at the Homebrew node@22 path you added
```

Symptoms of the wrong version: `SyntaxError` in tooling, `Unsupported engine`, Next refusing to start. Fix your `PATH` (see [MAC_SETUP.md](MAC_SETUP.md)), then `rm -rf node_modules && npm ci`.

## Dev server weirdness

```bash
# stale build output / "Another next dev server is already running"
rm -rf .next
npm run dev
```

The project deliberately uses `--webpack`. Don't switch to Turbopack to "fix" something.

## Apple Silicon / Docker notes

Nothing in the repo is arch-specific. If Docker warns about `platform (linux/amd64) does not match (linux/arm64)`, pull again (`docker compose pull`) so you get the arm64 variants. If a specific image has no arm64 build, enable "Use Rosetta for x86_64/amd64 emulation" in Docker Desktop settings. If Prisma complains about engines after copying `node_modules` from another machine, delete `node_modules` and run `npm ci` on the Mac. Never copy `node_modules` between architectures.

## Playwright

```bash
npx playwright install chromium     # browsers are not installed by npm ci
```

- **`SAFETY GUARD: …` errors** are intentional: the suite refuses non-local URLs/DBs. Fix `.env.qa`; do not bypass the guard.
- **QA DB problems:** use a *separate* database (`delhi_broker_crm_qa`), apply `npx prisma migrate deploy` to it, run `npm run test:e2e:seed`. See [TESTING.md](TESTING.md).
- **HTTP 429 while seeding QA:** `REDIS_URL` leaked in from your dev `.env`; set `REDIS_URL=""` in `.env.qa`.
- **Login works at `localhost:3100` but not `127.0.0.1:3100`:** known Next dev HMR behaviour; always use `localhost`.
- **Occasional one-off "Invalid or unexpected token":** a dev-server chunk glitch; the config already retries once.

## Environment mistakes

| Mistake | Effect | Fix |
|---|---|---|
| `.env.local` instead of `.env` | Prisma/seed scripts see no `DATABASE_URL` | `cp .env.example .env` |
| `NEXTAUTH_URL` ≠ the URL you browse | login loops / cookie issues | set to `http://localhost:3000` |
| Real keys in `.env` | risk of contacting real services | keep `MOCK` / `DISABLED` |
| Quotes/spaces around values | odd validation errors | follow `.env.example` formatting |
| Edited `.env` but didn't restart | old values in use | stop and rerun `npm run dev` |

Still stuck? Capture the exact command, the full error and `node -v`, `docker compose ps`, then ask the owner. Don't paste `.env` contents.
