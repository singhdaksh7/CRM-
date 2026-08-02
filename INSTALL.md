# Installation (Local Development)

## Prerequisites
- Node.js 20+
- Docker Desktop (for Postgres/Redis/MinIO) — or your own Postgres 16+ and (optionally) Redis instance
- npm

## 1. Install dependencies
```bash
npm install
```

## 2. Start local infrastructure
```bash
docker compose up -d
```
This starts Postgres (`localhost:5434`), Redis (`localhost:6380`), and MinIO/S3-compatible storage (`localhost:9002` API, `localhost:9003` console). Ports are intentionally non-default to avoid colliding with other local projects — adjust `docker-compose.yml` if these are already free/taken on your machine.

Create the MinIO buckets once (only needed the first time, or after `docker compose down -v`):
```bash
docker exec delhi-broker-crm-minio-1 mc alias set local http://localhost:9000 crm_minio crm_minio_password
docker exec delhi-broker-crm-minio-1 mc mb local/crm-documents
```

## 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env` — at minimum set `DATABASE_URL` (defaults to the Docker Postgres above), `AUTH_SECRET` (any long random string for local dev), `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`. See `ENVIRONMENT.md` for every variable. The app **will not start** if required variables are missing or invalid (fail-fast validation).

## 4. Apply database migrations
```bash
npx prisma generate
npx prisma migrate deploy
```

## 5. Seed sample data
```bash
npm run db:seed
```
Creates 5 users (1 admin, 1 data manager, 3 field executives), 30 properties, 25 leads, 10 owners, 8 deals (with brokerage + payments), visits, follow-ups, and assignment rules. Prints login credentials to the console. Safe to re-run — it's a no-op if `admin@delhibrokercrm.com` already exists.

**Never** run `npm run db:reset` (which calls `prisma migrate reset --force`) against a database with real data — it wipes everything. It's fine only for a fresh local dev database you're happy to lose.

## 6. Run the dev server
```bash
npm run dev
```
Opens on `http://localhost:3000` (Webpack — Turbopack is never used in this project). Log in with the seeded admin credentials printed by the seed script.

## 7. Verify
```bash
curl http://localhost:3000/api/system/health      # {"status":"ok",...}
curl http://localhost:3000/api/system/readiness    # {"ready":true,...}
```

## Running tests
```bash
npx vitest run
```

## Production build (local check)
```bash
npm run build   # next build --webpack
npm start
```

## Optional: Docker end-to-end
```bash
docker build -t delhi-broker-crm .
docker run --network delhi-broker-crm_default -p 3000:3000 \
  -e DATABASE_URL="postgresql://crm:crm_dev_password@delhi-broker-crm-postgres-1:5432/delhi_broker_crm?schema=public" \
  -e AUTH_SECRET="..." -e NEXTAUTH_URL="https://localhost:3000" \
  -e NEXT_PUBLIC_APP_URL="https://localhost:3000" -e AUTH_TRUST_HOST="true" \
  -e REDIS_URL="redis://delhi-broker-crm-redis-1:6379" \
  delhi-broker-crm
```
Runs against the same `docker-compose.yml` network as step 2. See `DEPLOYMENT.md` §9 for the production-shaped `docker-compose.prod.yml`.

## Troubleshooting
See `OPERATIONS.md` "Troubleshooting" for common startup errors (env validation failures, Prisma engine/OpenSSL mismatches, port conflicts).
