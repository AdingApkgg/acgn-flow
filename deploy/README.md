# ACGN Flow 部署指南

## 架构与隔离

Bun/Hono 提供 RR8 SSR、Vite 静态资源、oRPC、Better Auth 和原 HTTP 端点。应用、PostgreSQL、Redis 使用 Compose；数据库和 Redis 不发布宿主机端口，应用仅绑定 `127.0.0.1:1270`。默认沿用宿主机的共享 Cloudflare Tunnel，公网 `af.saop.cc` 回源到该端口，不重复启动同一隧道。

安装、构建和验证都在指定构建机执行，先确认 `hostname`。本次迁移测试使用 `localhost-1.tailac9c6f.ts.net:/home/i/acgn-flow-migration-20261026` 和独立合成数据库；该目录不能当作生产数据源。本机 Mac 不安装、不构建、不运行服务。境外下载保留机器已有大小写 HTTP(S) 代理。

## 配置

从 `.env.production.example` 准备私有 `.env`，权限设为 600。必须配置独立数据库密码、随机认证密钥、公开 APP_URL / BETTER_AUTH_URL、镜像标签及 APP_REVISION；不要将真实配置提交 Git。公开 APP_URL / APP_NAME 在构建时进入客户端，修改后需重建。

复用旧 bcrypt、用户 ID、OAuth 外部账号和历史字段。原 JWT 会话不会导入新认证，会要求重新登录。GitHub / Google / Discord 的回调仍是 `https://你的域名/api/auth/callback/<provider>`；发布时核实控制台实际值，不更换现有凭据。

Compose 的默认数据库仍为 PostgreSQL 16，避免对已有16卷隐式执行大版本升级。本次宿主生产为18.6，应显式配置 `POSTGRES_IMAGE=postgres:18.6-alpine` 和 `POSTGRES_DATA_PATH=/var/lib/postgresql`，用逻辑备份恢复到新的18卷。不要直接把16数据目录交给18，也不要把18备份恢复到16。

## 构建与全新安装

```bash
# 仅在构建机执行
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run build
# Ruffle 资产由 prepare:assets 从锁定依赖复制，不依赖外部 CDN。
docker compose build app
docker compose up -d postgres redis
# 仅新建的空库允许 init，不可用于既有库
docker compose run --rm --no-deps app bun scripts/db-init.ts --confirm-database=acgn_flow
docker compose run --rm --no-deps app bun scripts/db-seed.ts --confirm-database=acgn_flow
docker compose up -d app
curl --fail http://127.0.0.1:1270/healthz
```

镜像使用 Bun1.4.2，生产依赖阶段复用已经完成下载的缓存；构建阶段通过 host 网络和已有代理下载。运行镜像不保存代理参数，不包含 `.env`。运行身份固定 `1001:1001`，兼容旧容器上传卷。

## 既有生产迁移

先备份、真实副本演练、记录字段摘要，再执行已批准的切换。普通 `compose up` 不自动改库，`maintenance` profile 提供显式迁移入口，代替旧 PR 的自动 Prisma schema push。

1. 记录旧应用版本、进程、数据库版本与数量、Flash 类型、上传根目录、现有隧道及公开入口。保留旧程序目录和依赖，不覆写唯一回退副本。
2. 用当前服务器对应版本的 `pg_dump -Fc --no-owner --no-acl` 备份数据库，并备份上传和私有环境。凭据通过环境传递，不放进命令行或日志。
3. 在相同数据库大版本的隔离库恢复备份，执行 `scripts/db-upgrade.ts --confirm-database=<实际库名>`。比较24张旧业务表、209个冻结字段及已存在的 contentType 按ID摘要；已有 FLASH 不得改为 VIDEO。
4. 验证旧 bcrypt / OAuth 映射、SSR、真实404、上传和MP4/HLS/Flash。真实副本的预览不发送邮件、不调用索引写接口。
5. 构建最终 main 的不可变镜像，APP_REVISION 使用该提交 SHA。确认镜像、回退文件和目标服务都已准备好，再短暂停止旧应用的写入；不要关闭共享 PostgreSQL / Redis / PM2 / Cloudflare 服务。
6. 生成维护窗口内最终数据库和上传备份，恢复到全新目标库和空上传卷，再执行显式增量迁移。上传导入脚本拒绝覆盖非空卷，仅对新目标副本设 `1001:1001`：

```bash
# 只对新目标副本操作；源目录保持只读
bash scripts/import-uploads-to-volume.sh acgn-flow-uploads /原上传目录
# 已恢复旧库才执行 upgrade，不执行 init
docker compose --profile maintenance run --rm migrate
docker compose up -d app
```

7. 校验 `/healthz` 的 revision、公开实际域名、首页/搜索/视频/Flash/登录/上传与资源URL，并核对数据数量和摘要。域名继续走原宿主机共享隧道，无需改 Cloudflare 配置。
8. 验收后仅移除旧的 `acgn-flow` PM2 应用自动启动记录；保留旧目录、原数据库和备份，不关闭其他项目共用的PM2或数据库服务。

升级是事务操作：新增认证表和 contentType 结构、账号复制、记录核对共同成功才提交。`auth-v1` 完成后重跑不会恢复用户已解绑账号。详情见 [数据库指南](../drizzle/README.md)。

## 日常更新与回退

更新必须绑定已验证的 main SHA，先准备镜像与备份，再显式执行需要的数据库迁移并替换 app。禁止 `down -v`、自动 schema push、覆盖唯一备份或绕过迁移检查。`/sw.js` 仅用于旧客户端注销和清理本站旧缓存，不注册新 worker。

切换前备份应包含数据库、上传、原环境、应用版本与旧进程启动信息。若验收失败，停止新应用写入，回到保留的旧程序与数据库；已经产生新认证/内容写入后，先保存新库并对账，再决定恢复，不能用旧密码字段覆盖新认证数据。回退时共享隧道继续回源原1270端口。

## 可选隧道

通常使用宿主机共享 Cloudflare Tunnel；Compose 的 `cloudflared` profile 默认关闭。只有决定将隧道独立放进本项目时才配置 `CLOUDFLARE_TUNNEL_TOKEN`，将回源设为 `http://app:1270`，并停用同一隧道的旧连接，避免不同回源混用。

Rathole 作为备用 profile 保留，模板中的 `local_addr=app:1270` 适用于容器。宿主机运行客户端时应改为 `127.0.0.1:1270`。公网 Nginx 模板的接口路径为 `/api/rpc/`，静态资源为 `/assets/`；模板更新不代表现网配置已修改。
