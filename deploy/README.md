# ACGN Flow 部署指南

全容器化部署：内网机上 **app + PostgreSQL + Redis** 跑在 docker/podman compose 里，
宿主机不再有 pm2 / systemd / postgres / redis。

对外暴露走 **Cloudflare Tunnel**：
- 不需要公网机、不需要 Nginx、不需要开放任何入站端口、不需要 certbot
- TLS、HTTP/3、CDN、防护都由 Cloudflare 边缘负责
- **推荐由宿主机上的 cloudflared 统一管隧道**（一条隧道扛多个站点），各站点回源到自己的
  `http://localhost:<端口>`；本应用回源 `http://localhost:1270`（compose 已把 app 发布到 `127.0.0.1:1270`）。
- compose 也内置了 `cloudflared` / `rathole` 两个**可选 profile**（默认不启动），见对应小节。

> 原先的 rathole + 公网机 Nginx 方案已停用，保留为备用 profile，见文末「切回 rathole」。

## 架构概览

```
Cloudflare 边缘 (TLS / HTTP3 / CDN / WAF)
         ↑  Cloudflare Tunnel（宿主机 cloudflared，回源 http://localhost:1270）
内网机
   ├─ 宿主机 cloudflared（多站点共享，systemd 管）
   └─ docker compose ───────────────────────────
        ├─ app       Next.js standalone（发布到 127.0.0.1:1270）
        ├─ postgres  PostgreSQL 16（命名卷 acgn-flow-postgres-data）
        ├─ redis     Redis 7（命名卷 acgn-flow-redis-data）
        └─ migrate   一次性 prisma db push
```

依赖与启动顺序由 compose 编排：`postgres`/`redis` 健康 → `migrate` 建表完成 → `app` 健康。隧道由宿主机 cloudflared 负责。

---

## 一、Cloudflare Tunnel 配置（先做一次）

**推荐：用宿主机上的 cloudflared 统一管隧道**（一条隧道可扛多个站点）。

1. 把域名接入 Cloudflare（在域名商把 NS 指向 Cloudflare 分配的 nameserver）。
2. **Zero Trust → Networks → Tunnels**：选一条已有隧道复用，或 Create a tunnel → Cloudflared。
   宿主机若已在跑该隧道的 cloudflared 就直接用；新建的话在宿主机以该 token 运行并做成 systemd 服务：
   `cloudflared --no-autoupdate tunnel run --token <token>`。
3. 在该 tunnel 的 **Public Hostname** 里加一条：
   - Subdomain / Domain：你的对外域名（如 `af.saop.cc`）
   - Service：`HTTP`　URL：**`localhost:1270`**
   - ⚠️ cloudflared 跑在宿主机，回源必须用 `localhost:1270`（compose 已把 app 发布到 `127.0.0.1:1270`）。
     **别填 `app:1270`** —— 那是容器服务名，只有 cloudflared 也在 compose 内（见下）才对；
     填错会出现 `dial tcp: lookup app ... no such host` → 502。

> 原 Nginx 做的限流 / 安全响应头 / 缓存，现在用 Cloudflare 侧的 WAF、Rate Limiting、
> Transform Rules、Cache Rules 实现；或保留在应用层（`next.config.ts` headers）。

### （可选）把隧道也塞进 compose

想单机自包含、隧道跟着 `docker compose` 起停：把 token 填进 `.env` 的 `CLOUDFLARE_TUNNEL_TOKEN`，
`docker compose --profile cloudflared up -d`，并把该 tunnel 的 Public Hostname 回源改成 **`http://app:1270`**。
别和宿主机那份 cloudflared 用同一条隧道同时跑（两副本回源不一致会时好时坏）。

---

## 二、内网机：全新部署

```bash
git clone <repo> acgn-flow && cd acgn-flow

# 1) 环境变量（compose 从同目录 .env 读取）
cp .env.example .env
#   必填: POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
#         AUTH_SECRET(openssl rand -base64 32) / AUTH_URL(你的域名)
#         NEXT_PUBLIC_APP_URL(你的域名，注意会在构建时内联进前端，改了要重建镜像)
#         （CLOUDFLARE_TUNNEL_TOKEN 仅当用 --profile cloudflared 把隧道塞进 compose 时才需要）

# 2) 起栈（首启会构建镜像；默认不含隧道）
docker compose up -d --build          # 或 podman compose up -d --build

# 3) 看状态 / 日志
docker compose ps
docker compose logs -f app
curl -fsS http://127.0.0.1:1270/api/health    # {"status":"ok"}
# 宿主机 cloudflared 把 <域名> 回源到 localhost:1270 后，直接访问 Cloudflare 域名验证
# 查隧道连接：journalctl -u <你的 cloudflared 单元> | grep "Registered tunnel connection"
```

### 填充种子数据（仅全新库需要）

`migrate` 镜像只含 prisma CLI，不含 tsx/源码，无法直接跑 seed。临时从本机源码连库执行即可
（先在 compose.yaml 里临时取消 `postgres.ports` 的 loopback 注释）：

```bash
DATABASE_URL='postgresql://<user>:<pass>@127.0.0.1:5432/<db>?schema=public' nub run db:seed
```

> 用 `nub run compose:migrate` 可随时手动重跑一次 schema 同步（`prisma db push`，幂等）。

---

## 三、从旧的 pm2 + 宿主机 PostgreSQL 迁移（数据无损切换）

> 目标：把宿主机上 pm2 跑的 app 和 host 安装的 PostgreSQL 数据，整体搬进 compose，**不丢数据**。
> Redis 是缓存，不迁移（容器内会重建）。建议低峰期操作，全程约几分钟停机。

```bash
# 0) 准备 .env（POSTGRES_* 用新容器库账号；AUTH_SECRET 沿用原值否则会话失效；填好 CLOUDFLARE_TUNNEL_TOKEN）
cp .env.example .env && $EDITOR .env

# 1) 停掉旧的 pm2 应用，避免迁移期间继续写库
pm2 stop acgn-flow && pm2 delete acgn-flow && pm2 save
pm2 unstartup systemd || true        # 取消 pm2 开机自启（彻底退役）

# 2) 从宿主机现有 PostgreSQL 导出全量数据（schema + data，custom 格式）
#    按你宿主机实际的库名/用户/端口改参数
pg_dump -Fc -h 127.0.0.1 -p 5432 -U <旧库用户> -d <旧库名> -f acgn-flow.dump

# 3) 先只拉起容器 PostgreSQL（用 .env 的账号初始化空库）
docker compose up -d postgres
docker compose exec postgres sh -c 'until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do sleep 1; done'

# 4) 把 dump 恢复进容器库（先把 .env 导进当前 shell 才能用 $POSTGRES_*）
set -a && . ./.env && set +a
docker compose exec -T postgres pg_restore \
  --no-owner --no-acl --clean --if-exists \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" < acgn-flow.dump

# 5) 把历史上传文件导入 uploads 卷（旧 app 的 UPLOAD_DIR 默认是 ./uploads）
bash scripts/import-uploads-to-volume.sh

# 6) 起全栈：migrate 跑 prisma db push 对齐 schema（数据已在，通常 no-op），再起 app（隧道由宿主机 cloudflared 管）
docker compose up -d --build

# 7) 验证
docker compose ps
docker compose logs -f app
curl -fsS http://127.0.0.1:1270/api/health
#   再走 Cloudflare 域名跑一遍真实页面，确认用户/视频/登录态都在

# 8) 确认无误后，退役宿主机的 postgres / redis
sudo systemctl disable --now postgresql
sudo systemctl disable --now redis-server      # 或 redis
```

回滚：第 8 步之前宿主机旧库一直原封不动，发现问题 `docker compose down` 后重新 `pm2 start` 旧应用即可。

---

## 四、日常运维

### 更新发布

```bash
git pull
docker compose up -d --build      # migrate 会自动对齐 schema，无需手动 db push
docker compose logs -f app
```

### 备份

```bash
# 数据库（从容器内导出）
set -a && . ./.env && set +a
docker compose exec -T postgres pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).dump

# 上传文件（从命名卷导出）
docker run --rm -v acgn-flow-uploads:/src:ro -v "$PWD":/dst alpine \
  tar -czf /dst/uploads-$(date +%F).tar.gz -C /src .
```

### 常用命令

| 操作 | 命令 |
|------|------|
| 起栈 | `docker compose up -d --build` |
| 停栈 | `docker compose down` |
| 看 app 日志 | `docker compose logs -f app` |
| 看隧道日志 | `journalctl -u <宿主机 cloudflared 单元> -f`（compose profile 则 `docker compose logs -f cloudflared`） |
| 重启 app | `docker compose restart app` |
| 手动同步 schema | `docker compose run --rm migrate` |
| 进 app 容器 | `docker compose exec app sh` |
| 进库 | `docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"` |

> Podman 用户把上面的 `docker compose` 换成 `podman compose` 即可。

---

## 五、（已停用·备用）切回 rathole + 公网机

rathole 客户端仍在仓库里，挂在 compose 的 `rathole` profile 下，默认不启动。切回步骤：

```bash
# 1) 在 Cloudflare 侧停掉/删掉该 tunnel 的 Public Hostname（避免双通道）
#    宿主机 cloudflared:  sudo systemctl stop <你的 cloudflared 单元>
#    （若用的是 compose profile:  docker compose stop cloudflared）

# 2) 准备 rathole 客户端配置
cp deploy/rathole-client.example.toml deploy/rathole-client.toml
#   填 remote_addr=公网机IP:2333 与 default_token；local_addr 保持 app:1270

# 3) 启动 rathole（profile）
docker compose --profile rathole up -d rathole
```

公网机（另一台机器）侧的 Nginx + Rathole Server（systemd）配置仍在 `deploy/`：
- `deploy/nginx-public.conf`、`deploy/rathole-server.example.toml`、`deploy/rathole-server.service`

```bash
# 公网机安装 rathole（v0.5.0 的 x86_64 为 gnu 版）
wget https://github.com/rapiz1/rathole/releases/download/v0.5.0/rathole-x86_64-unknown-linux-gnu.zip
unzip rathole-x86_64-unknown-linux-gnu.zip && sudo mv rathole /usr/local/bin/

cp deploy/rathole-server.example.toml /opt/rathole/rathole-server.toml   # 编辑 token
sudo cp deploy/rathole-server.service /etc/systemd/system/
sudo systemctl enable --now rathole-server

sudo cp deploy/nginx-public.conf /etc/nginx/sites-available/acgn-flow.conf
sudo ln -s /etc/nginx/sites-available/acgn-flow.conf /etc/nginx/sites-enabled/
sudo certbot certonly --webroot -w /var/www/certbot -d af.saop.cc
sudo nginx -t && sudo systemctl reload nginx

# 公网机防火墙
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 2333/tcp
```

## SEO 和 AI 端点

| 路径 | 说明 | 缓存 |
|------|------|------|
| `/sitemap.xml` | 动态站点地图 | 1h |
| `/robots.txt` | 爬虫规则 | 1d |
| `/feed.xml` | RSS 订阅 | 1h |
| `/llms.txt` | AI/LLM 友好说明 | 1d |
| `/.well-known/ai-plugin.json` | ChatGPT 插件发现 | 1d |
