# syntax=docker/dockerfile:1
FROM oven/bun:1.4.2 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ARG APP_URL=http://localhost:1270
ARG APP_NAME="ACGN Flow"
ENV APP_URL=$APP_URL APP_NAME=$APP_NAME
RUN bun run build

# 复用已完成下载的缓存，避免两个安装阶段同时争用代理连接。
FROM dependencies AS production-dependencies
RUN rm -rf node_modules && bun install --frozen-lockfile --production

FROM oven/bun:1.4.2 AS runner
WORKDIR /app
ARG APP_REVISION=development
ENV NODE_ENV=production PORT=1270 HOST=0.0.0.0 APP_REVISION=$APP_REVISION
LABEL org.opencontainers.image.revision=$APP_REVISION
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json
# 延续旧容器的 UID/GID，既有上传卷无需递归更改属主。
RUN mkdir -p /app/uploads /app/data && chown 1001:1001 /app/uploads /app/data
USER 1001:1001
EXPOSE 1270
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD bun -e 'fetch("http://127.0.0.1:" + (process.env.PORT || 1270) + "/healthz").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
CMD ["bun", "build/server/index.js"]
