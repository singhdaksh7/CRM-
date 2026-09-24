# Multi-stage production Dockerfile for Delhi Broker / KP Properties CRM
# Next.js 16 (App Router, Standalone Output) + Node 20 Slim + Prisma 6

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies
# ---------------------------------------------------------------------------
FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 2: Build application
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables for Next.js and Prisma generate
# (Real runtime credentials are injected at container startup via env)
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder-not-used-at-runtime-0000"
ENV NEXTAUTH_URL="https://localhost:3000"
ENV NEXT_PUBLIC_APP_URL="https://localhost:3000"

RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: Production runtime (standalone output)
# ---------------------------------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# OpenSSL for Prisma Query Engine
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Run as non-root user
RUN groupadd -r -g 1001 nodejs && useradd -r -u 1001 -g nodejs nextjs

# Static public assets
COPY --from=builder /app/public ./public

# Standalone output server and dependencies
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start production Next.js standalone server
CMD ["node", "server.js"]
