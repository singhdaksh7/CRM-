# macOS Setup Guide

Goal: from a fresh Mac to a running CRM at `http://localhost:3000` with **fake demo data** and **no production access**. Every project command below is taken from `package.json`, `docker-compose.yml` and the Prisma setup, and the database/seed/test steps were run end-to-end on an empty database before this was written.

Works on Apple Silicon and Intel. Nothing in the repo is architecture-specific for local development: the local containers (`postgres:16-alpine`, `redis:7-alpine`, `minio/minio`) are official images that publish arm64 variants, and Prisma ships native engines for macOS arm64 and x64. (The production `Dockerfile` is only used on the server.)

## 0. Time budget

About 20 minutes plus downloads. The demo seed takes a couple of minutes.

## 1. Developer tools

```bash
# Xcode command line tools (provides git). Skip if `git --version` already works.
xcode-select --install

# Homebrew (follow the installer's "Next steps" output to put brew on your PATH)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Node.js

Use **Node 22 LTS**: it is what the production `Dockerfile` runs (`node:22-slim`). CI currently uses Node 20 and the codebase also typechecks and passes its unit tests on newer Node, so any supported LTS from 20 up works, but stay on 22 to match production. Next.js 16 needs Node 20.9 or newer.

```bash
brew install node@22
# node@22 is "keg-only": add it to your PATH.
# Apple Silicon:
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
# Intel Mac: use /usr/local/opt/node@22/bin instead.
source ~/.zshrc
node -v   # v22.x
npm -v
```

(A version manager such as `fnm` or `nvm` is fine too.)

### Docker Desktop

```bash
brew install --cask docker
open -a Docker      # accept the prompts; wait until the whale icon says "running"
docker --version
docker compose version
```

PostgreSQL does **not** need to be installed on the Mac. The project runs it (and Redis) in Docker. Do not install Postgres via Homebrew for this project.

## 2. Get the code

```bash
git clone https://github.com/singhdaksh7/CRM-.git
cd CRM-
git checkout onboarding/brother-mac
```

You need access to the GitHub repository (ask the owner to add you). You do **not** need any server, database or cloud credentials.

## 3. Install dependencies

```bash
npm ci
```

`npm ci` installs exactly what `package-lock.json` pins. It also runs `postinstall` → `prisma generate`, which creates the typed Prisma client.

## 4. Environment file

```bash
cp .env.example .env
```

Use **`.env`**, not `.env.local`. The Prisma CLI and the `tsx` seed scripts read `.env` only; Next.js reads it too. The active values in `.env.example` already point at the local Docker services and are safe defaults:

- `DATABASE_URL` / `DIRECT_URL` → `localhost:5434`, database `delhi_broker_crm`, the fixed dev-only credentials from `docker-compose.yml`
- `AUTH_SECRET` → a local placeholder (any string ≥ 16 chars; generate your own with `openssl rand -base64 32` if you like)
- `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` → `http://localhost:3000`
- `WHATSAPP_PROVIDER=MOCK`, `STORAGE_PROVIDER=DISABLED`, `MAPS_PROVIDER=DISABLED` → nothing external is contacted
- `REDIS_URL` → left commented out (optional). Without it rate limiting and caching are simply off, which is what you want while seeding and testing; uncomment `# REDIS_URL="redis://localhost:6380"` to use the Docker Redis

Leave every other variable blank. Details: [ENVIRONMENT.md](ENVIRONMENT.md). `.env` is gitignored; never commit it.

## 5. Start PostgreSQL and Redis

```bash
docker compose up -d
docker compose ps        # postgres and redis should be "healthy"
```

`docker-compose.yml` starts three services (project name `delhi-broker-crm`):

| Service | Host port | Notes |
|---|---|---|
| `postgres` (16-alpine) | **5434** → 5432 | user `crm`, db `delhi_broker_crm`. Data persists in the `postgres_data` volume |
| `redis` (7-alpine) | **6380** → 6379 | optional for the app |
| `minio` | 9002 (S3 API), 9003 (console) | only needed if you set `STORAGE_PROVIDER=S3`; ignore otherwise |

The ports are deliberately non-default so they do not collide with other local projects. If one is taken, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 6. Create the schema

```bash
npx prisma migrate deploy
```

This applies the 36 tracked migrations to an empty database, including creating the default organization `org_default`. It works on a brand-new database with no extra bootstrap step. Expected last line: `All migrations have been successfully applied.`

## 7. Load safe demo data

```bash
npm run seed:demo
```

This inserts a clearly fake dataset: 8 employees, 20 owners, ~50 properties (including residential 1 RK units and commercial rows), ~20 leads, visits, follow-ups, catalogues, deals, documents metadata, notifications and mock WhatsApp/portal scenarios. Every row is tagged `KP-DEMO-` / `kp-demo-` and uses `@kpproperties.demo` emails. It:

- refuses to run unless `DATABASE_URL` looks local (it has a separate production-host guard);
- is idempotent: it deletes its previous demo dataset and recreates it;
- makes zero WhatsApp/email/portal calls.

Optional extras (all read-only or demo-scoped):

```bash
npm run seed:demo:dry-run   # preview the plan without writing
npm run seed:demo:verify    # check what is in the DB against the plan (see note below)
npm run seed:remove         # remove demo data (needs DEMO_REMOVE_CONFIRMATION, see the script's message)
```

> **Expected message on a fresh database:** `seed:demo:verify` ends with `1 issue(s): No real (non-demo) ADMIN user found`. That check exists to protect production (it warns if a real admin vanished). On a database that contains only demo data it is normal and harmless.

There is also a smaller legacy seed, `npm run db:seed` (5 users, 30 properties, 25 leads), which creates well-known passwords such as `Admin@123`. It works locally but prefer `seed:demo`; **never** run either seed anywhere real.

## 8. Run the app

```bash
npm run dev
```

Open **http://localhost:3000** (it redirects to `/login`). `npm run dev` is `next dev --webpack`.

### Demo logins (fake, local only)

Password for all demo accounts: **`DemoPass@123`**

| Role | Email |
|---|---|
| Admin | `demo.admin.1@kpproperties.demo` |
| Data Manager | `demo.data.manager.2@kpproperties.demo` |
| Data Manager (Telecaller title) | `demo.telecaller.3@kpproperties.demo` |
| Field Executive | `demo.field.executive.6@kpproperties.demo` (also `.7`, `.8`) |
| Field Executive (Sales Executive title) | `demo.sales.executive.4@kpproperties.demo` (also `.5`) |

Log in as each role to see how navigation and data scope change ([ROLES_AND_PERMISSIONS.md](ROLES_AND_PERMISSIONS.md)).

Quick health check: `curl http://localhost:3000/api/health` → `{"status":"ok"}`.

## 9. Everyday commands

```bash
npm run dev                 # dev server
npx tsc --noEmit            # typecheck
npm run lint                # eslint
npm test                    # vitest run (unit tests)
npm run build               # production build (webpack)
npx prisma studio           # browse the LOCAL database in a browser
```

Playwright browser tests need a separate QA database; see [TESTING.md](TESTING.md).

## 10. Stop, restart, reset

```bash
# Stop the dev server: Ctrl+C

docker compose stop         # stop containers, keep data
docker compose start        # start them again
docker compose down         # remove containers, KEEP data volumes
docker compose down -v      # remove containers AND all local data (fresh start)
```

To rebuild a clean local database after `down -v`: repeat steps 5 → 7.

> `npm run db:reset` runs `prisma migrate reset --force`, which **wipes the database in your `DATABASE_URL`**. It is acceptable only on your own disposable local database. Check `DATABASE_URL` first. Never point it at anything else. See [PRODUCTION_SAFETY.md](PRODUCTION_SAFETY.md).

## 11. Verified-on checklist

If something fails, work through [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Quick self-test:

```bash
docker compose ps                 # postgres + redis healthy
npx prisma migrate status         # "Database schema is up to date!"
npm run seed:demo:verify          # demo dataset present (the 'no real ADMIN' note is expected locally)
curl -s localhost:3000/api/health # {"status":"ok"}
```

Next: [ENVIRONMENT.md](ENVIRONMENT.md).
