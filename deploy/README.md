# ACGN Flow 部署指南

## 运行架构

公网 Nginx 经 Rathole 将请求转到 Bun/Hono 的 1270 端口。同一应用提供 RR8 SSR、Vite 构建资源、oRPC、Better Auth 和原 HTTP 资源；PostgreSQL、Redis 和上传卷保持独立。

## 构建机

安装、构建、预览和测试均在专用构建机执行，先确认 `hostname`。本次隔离验证目录为 `localhost-1.tailac9c6f.ts.net:/home/i/acgn-flow-migration-20261026`，不能把它或其合成测试库当作生产数据源。境外下载使用机器现有代理，不清空 SSH 继承的代理环境。

## 生产准备

在生产副本完成升级演练与记录核对后，才申请生产切换。保留原程序版本、数据库完整备份和上传备份。旧认证表/字段会保留，密码迁入 `AuthAccount`，新会话使用 `AuthSession`；旧JWT登录态需要重新登录。

环境变量采用 `.env.production.example`，必须提供随机 `BETTER_AUTH_SECRET`、正确 `BETTER_AUTH_URL`、`APP_URL`、数据库和缓存连接。公开 `APP_URL`/`APP_NAME` 同时作为构建参数与运行配置，修改后重新构建。OAuth 控制台回调更新为：

```text
https://你的域名/api/auth/callback/github
https://你的域名/api/auth/callback/google
https://你的域名/api/auth/callback/discord
```

外部 OAuth 应用配置需要相应账户权限，合成测试不能替代真实 provider 登录验收。

## 容器

```bash
# 确认并批准发布后，在专用构建机执行
# 构建时下载使用构建机既有代理；Docker daemon也须已有可用代理。
docker compose build app
# 先启数据库/缓存，迁移命令不依赖正在运行的应用
docker compose up -d postgres redis
# 只对全新空库执行
docker compose run --rm app bun scripts/db-init.ts --confirm-database=acgn_flow
# 既有库改用以下命令（不要与上面同时执行）
# docker compose run --rm app bun scripts/db-upgrade.ts --confirm-database=acgn_flow
# 种子只补充标签，不清空内容、不创建固定口令管理员
docker compose run --rm app bun scripts/db-seed.ts --confirm-database=acgn_flow
docker compose up -d app
curl --fail http://127.0.0.1:1270/healthz
```

上传卷、PostgreSQL卷、Redis卷保留现有名称，禁止用 `down -v` 更新。应用继续使用旧容器的 UID/GID `1001:1001`，避免既有上传卷失去写权限；不要按 Bun 基础镜像默认的 1000 递归改属主。IP地理位置数据库仍以只读 `./data:/app/data:ro` 挂载。容器绑定 `HOST=0.0.0.0`，对外端口由 Compose 和现有反向代理约束。

Compose 构建阶段使用 Linux 构建机的 host 网络，并转发机器现有的大小写 HTTP(S) 代理变量；本次验证证实只传大写变量可能使容器安装停滞，显式同时传入后恢复。代理参数只用于构建，不写入运行环境或代码中的凭据。

## PM2

```bash
bun install --frozen-lockfile
bun run build
# 按数据库指南单独执行已批准的迁移
bun run pm2:start
# 后续经过批准的版本更新
pm2 reload ecosystem.config.cjs --update-env
```

默认 Bun 路径 `/home/i/.bun/bin/bun`，可用 `BUN_BIN` 覆盖。工作目录保持 `/home/i/acgn-flow`；迁移验证目录独立，不要覆盖已有工作区。

## 验收与回退

逐项检查 `/healthz`、公开页面首包SSR、404、登录/退出/会话撤销、上传、播放/续播/字幕/弹幕、管理权限、RSS/sitemap 和 OAuth。`/sw.js` 是退役脚本，应返回不缓存响应；新客户端不再注册 worker。

数据库升级前后用 `bun scripts/db-check.ts` 对照数量、摘要和外键；完整演练见 [数据库指南](../drizzle/README.md)。若切换失败，先停止新写入，再按记录恢复原程序和对应数据库备份；新认证产生后的数据不能通过回填旧密码字段假装无损回退。是否回滚及恢复窗口由用户确认。

Nginx 模板已将接口路径改为 `/api/rpc/`、静态资源改为 `/assets/`，保留 Rathole 的既有端口。发布前核实当前域名、证书、端口与隧道真实状态；模板检查不等于现网配置已生效。本次代码迁移不自动更改防火墙、隧道、生产数据库或生产服务。
