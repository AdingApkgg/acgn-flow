# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Dependencies stage
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile

# Builder stage
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1
# Dummy DATABASE_URL for build time (actual URL provided at runtime)
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"

RUN pnpm run build

# Runner stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated

# Create uploads directory
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 1270

ENV PORT=1270
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
