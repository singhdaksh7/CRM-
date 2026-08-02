# Multi-stage build for Delhi Broker CRM (Next.js 16, Webpack - Turbopack is
# never enabled per project policy, and this Dockerfile never invokes it).

# ---------------------------------------------------------------------------
# Stage 1: install dependencies
# ---------------------------------------------------------------------------
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: build
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

# Must match the runner stage's OpenSSL version - `prisma generate` bundles
# a query-engine binary matched to whatever OpenSSL it detects *here*, and
# node:20-slim has no OpenSSL by default (see runner stage's comment). If
# this stage and the runner stage ever detect different OpenSSL versions,
# the app fails at startup with "could not locate the Query Engine".
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma needs a syntactically valid DATABASE_URL to generate the client
# (no real DB connection happens at generate time) - the real value is
# supplied at container runtime, not baked into the image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime-0000"
ENV NEXTAUTH_URL="http://localhost:3000"
ENV NEXT_PUBLIC_APP_URL="http://localhost:3000"

RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: production runtime - only what's needed to run `next start`
# ---------------------------------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Prisma's query engine needs OpenSSL present on the runtime image (node:*-slim
# doesn't include it by default) - without this it falls back to guessing the
# libssl version, which works most of the time but logs a warning on every
# start and can silently pick the wrong engine on some base images.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

# --chown so the non-root `nextjs` user can write into node_modules/@prisma
# (the Prisma CLI touches its engine cache there on `migrate deploy`) and
# .next/cache at runtime - a root-owned, read-only copy breaks both.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/system/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations, then start the server - see OPERATIONS.md for
# why this is safe to run on every container start (idempotent, no-op if
# already applied) and why it must NOT be `migrate dev`/`migrate reset`.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
