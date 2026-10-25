# ACGN Flow

ACGN Fans 流式媒体内容分享平台。用户提交视频直链，平台提供视频和 Flash 播放、字幕弹幕、合集、搜索、收藏、历史、评论和管理功能。

技术栈：React Router 8 Framework Mode、Vite 8、React 19、Hono、oRPC、Drizzle、Bun、Better Auth、Biome、Video.js 10（`@videojs/react`）、PostgreSQL、Redis、Tailwind v4、shadcn/ui。

## 开发与验证

本机 Mac 仅编辑代码；安装、构建、预览、整库类型检查与浏览器测试在专用构建机执行。项目迁移验证使用 `localhost-1.tailac9c6f.ts.net` 的 `/home/i/acgn-flow-migration-20261026`，与旧 `/home/i/acgn-flow` 分开。

在构建机先核实 `hostname`，保留已配置 `http_proxy` / `https_proxy`，然后：

```bash
bun install --frozen-lockfile
cp .env.example .env
# 填好连接信息、随机认证密钥和公开站点地址
bun run db:init --confirm-database=acgn_flow
bun run db:seed --confirm-database=acgn_flow
bun run dev
```

`db:init` 只接受空库。已有数据库必须先备份并在独立副本演练，使用 `bun run db:migrate --confirm-database=<实际库名>` 升级。详细说明见 [数据库升级指南](drizzle/README.md)。应用启动不会自动迁移，也不会创建固定口令的管理员。

```bash
bun run typecheck
bun run lint
bun run build
bun run start
```

`APP_URL` 与 `APP_NAME` 是仅有的公开构建配置；修改后重建客户端。认证读取 `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`，升级期间兼容旧 `AUTH_SECRET` / `AUTH_URL`。

## 登录与播放器

Better Auth 管理密码、GitHub/Google/Discord OAuth 和数据库会话。旧 bcrypt 密码、用户 ID、OAuth 外部 ID 和业务关联通过增量迁移保留；旧登录态切换后需要重新登录。多账号使用 Better Auth 的设备会话，撤销后不能靠旧切换令牌恢复。OAuth 回调为 `/api/auth/callback/<provider>`，只有配置完整凭据的 provider 才显示。

Video.js 10 替换原媒体引擎，保留自定义控制、字幕和弹幕层。MP4 使用 Video.js 媒体组件，HLS 使用 HlsJsVideo 适配器；Flash 使用本地锁定的 Ruffle 资产。原 Serwist 缓存和新 worker 注册已移除；`/sw.js` 仅供旧客户端退役，不提供离线缓存。

## 路由与结构

公开页面保留 SSR 和逐页 SEO。业务接口在 `/api/rpc/*`；上传、B站导入、验证码、邮件、RSS、robots、站点地图、llms 与 `.well-known` 保留原路径。

- `src/root.tsx`、`src/routes.ts`：RR8 根布局与路由。
- `src/app/`：现有页面与全局样式。
- `src/server/index.ts`：Bun/Hono 应用入口。
- `src/server/routers/`：oRPC 业务接口。
- `src/server/http/`：HTTP 资源端点。
- `src/db/`、`drizzle/`：Drizzle 表、关系、迁移与夹具。
- `src/components/video/video-player.tsx`：Video.js 播放器和字幕弹幕。
- `tests/`：认证、HTTP、SSR 等隔离集成测试。

## 部署

默认生产端口 1270。Docker/Podman、Cloudflare Tunnel 与备用 Rathole 配置见 [部署指南](deploy/README.md)。`/healthz` 检查数据库与 Redis 连通。开发验证通过不代表生产已切换；生产数据升级、OAuth 应用配置和生产发布都单独确认。

[GNU AGPLv3](LICENSE)
