# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
# nub 包管理器（预编译 Rust 二进制 + N-API addon）。
# 注意：alpine 是 musl；若 @nubjs/nub 无 musl 预编译产物，把基础镜像换成 node:22-slim（glibc）。
# alpine 下 prisma 引擎(schema engine 需 openssl) / sharp 需要 libc 兼容层。
RUN apk add --no-cache libc6-compat openssl \
  && npm install -g --ignore-scripts=false @nubjs/nub

# ---------- 依赖安装 ----------
FROM base AS deps
WORKDIR /app
# scripts/ 必须先于安装拷入：postinstall 会执行 scripts/copy-ruffle.cjs
COPY package.json lock.yaml ./
COPY prisma ./prisma/
COPY scripts ./scripts/
RUN nub ci

# ---------- 构建 ----------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* 会在构建时内联进客户端 bundle，运行时改了不生效（需重建镜像）
ARG NEXT_PUBLIC_APP_URL="http://localhost:1270"
ARG NEXT_PUBLIC_APP_NAME="ACGN Flow"
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME

ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1
# 构建期占位 DATABASE_URL（真实值在运行时由 compose 注入）
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"

# 确保 public/ruffle 存在（COPY . . 可能覆盖掉，且 deps 阶段没有 public/）
RUN node scripts/copy-ruffle.cjs
RUN nub run build

# ---------- 数据库 schema 初始化（一次性 prisma db push）----------
# 独立小镜像：standalone 运行镜像里没有 prisma CLI，建表只能在这里做
FROM base AS migrator
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma/
COPY prisma.config.ts package.json ./
# DATABASE_URL 由 compose 在运行时注入；db:deploy = prisma db push --skip-generate
CMD ["nub", "run", "db:deploy"]

# ---------- 运行 ----------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# standalone 产物 + 静态资源 + prisma schema + 生成的 client
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated

# 上传目录（compose 会用命名卷覆盖挂载）
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 1270

ENV PORT=1270
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
