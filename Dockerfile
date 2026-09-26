# Multi-stage production Dockerfile for Delhi Broker / KP Properties CRM
# Next.js 16 (App Router, Standalone Output) + Node 22 Slim + Prisma 6
#
# Prisma's package.json postinstall runs `prisma generate`, which needs
# prisma/schema.prisma (and dummy DATABASE_URL / DIRECT_URL) before `npm ci`.
# Test-only files are excluded by .dockerignore so `next build` does not
# typecheck Playwright/Vitest config against a missing tests/ tree.

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: Build application
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment for Prisma generate and Next.js.
# Runtime secrets come from .env.production. NEXT_PUBLIC_* is inlined at
# build time, so pass the real public URL (compose forwards it from env).
ARG NEXT_PUBLIC_APP_URL=https://crm.kpproperties.co.in
ARG NEXTAUTH_URL=https://crm.kpproperties.co.in
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"

RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: Production runtime (standalone output)
# ---------------------------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

RUN groupadd -r -g 1001 nodejs && useradd -r -u 1001 -g nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
