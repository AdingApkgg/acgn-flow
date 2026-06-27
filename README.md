# ACGN Flow

ACGN Fans 流式媒体内容分享平台。不存储视频文件，仅通过用户提供的直链加载视频。

## 技术栈

- **框架**: Next.js 16 + React 19 + TypeScript + Turbopack
- **样式**: Tailwind CSS v4 + shadcn/ui
- **状态**: Zustand + TanStack Query
- **API**: tRPC + Zod
- **认证**: NextAuth.js v5
- **数据库**: PostgreSQL + Prisma 7
- **缓存**: Redis + ioredis
- **播放器**: 原生 `<video>` + hls.js
- **3D**: Three.js + React Three Fiber

## 开始开发

### 1. 安装依赖

```bash
nub install
nub approve-builds  # 批准依赖的构建脚本
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

### 3. 初始化数据库

```bash
# 生成 Prisma Client
nub run db:generate

# 推送数据库 schema
nub run db:push

# (可选) 填充初始数据
nub run db:seed
```

### 4. 启动开发服务器

```bash
nub run dev
```

访问 http://localhost:3000

## 可用脚本

| 命令 | 说明 |
|------|------|
| `nub run dev` | 启动开发服务器 (Turbopack, 端口 3000) |
| `nub run build` | 构建生产版本 |
| `nub run start` | 启动生产服务器 |
| `nub run lint` | 运行 ESLint + tsc |
| `nub run db:generate` | 生成 Prisma Client |
| `nub run db:push` | 推送 schema 到数据库 |
| `nub run db:migrate` | 运行数据库迁移 |
| `nub run db:studio` | 打开 Prisma Studio |
| `nub run db:seed` | 填充初始数据 |
| `nub run compose:up` | 构建并启动整套容器栈 (`docker compose up -d --build`) |
| `nub run compose:down` | 停止整套容器栈 |
| `nub run compose:restart` | 重启 app 容器 |
| `nub run compose:logs` | 跟随 app 日志 |
| `nub run compose:migrate` | 手动跑一次数据库 schema 同步 |

## 生产部署

**全容器化**：app、PostgreSQL、Redis、Cloudflare Tunnel(cloudflared) 都跑在 compose 里，**宿主机不再安装 pm2 / systemd / postgres / redis**，对外暴露走 Cloudflare Tunnel（无需公网机 / nginx / 入站端口）。

### 架构概览

```
Cloudflare 边缘 (TLS / HTTP3 / CDN)
         ↑  Cloudflare Tunnel（宿主机 cloudflared，回源 http://localhost:1270）
内网机  ── docker compose ───────────────────────────
   ├─ app       Next.js standalone（发布到 127.0.0.1:1270）
   ├─ postgres  PostgreSQL 16（命名卷，不暴露宿主机端口）
   ├─ redis     Redis 7（命名卷）
   └─ migrate   一次性 prisma db push（建表 / 对齐 schema）

隧道默认由宿主机 cloudflared 统一管（多站点共享一条隧道）；
compose 内置的 cloudflared / rathole 均为可选 profile，默认不启动。
```

### 一键起停

```bash
cp .env.example .env   # 填好 POSTGRES_*、AUTH_SECRET、NEXT_PUBLIC_APP_URL、CLOUDFLARE_TUNNEL_TOKEN

nub run compose:up     # docker compose up -d --build
nub run compose:logs   # 跟随 app 日志
nub run compose:down   # 停服
```

启动顺序由 compose 自动编排：postgres/redis 健康 → migrate 建表完成 → app 健康。对外暴露由**宿主机 cloudflared** 负责（回源 `http://localhost:1270`），compose 默认不起隧道。

> 推荐用宿主机上的 cloudflared 把域名回源到 `http://localhost:1270`。若要把隧道也塞进 compose：`docker compose --profile cloudflared up -d`（那时 Public Hostname 回源用 `http://app:1270`）。详见 [deploy/README.md](deploy/README.md)。

### 端口与暴露

| 服务 | 端口 | 暴露范围 |
|------|------|----------|
| app | 1270 | 发布到 `127.0.0.1:1270`，供宿主机 cloudflared 回源；对外走 Cloudflare Tunnel |
| postgres / redis | 5432 / 6379 | 仅容器内网，**不**向宿主机暴露 |

> Cloudflare Tunnel 控制台配置、从旧的 **pm2 + 宿主机 PostgreSQL** 迁移过来（含历史数据无损迁移）的完整步骤，
> 以及切回 rathole 的方式，见 **[deploy/README.md](deploy/README.md)**。

## 目录结构

```
acgn-flow/
├── prisma/              # Prisma schema 和种子数据
├── src/
│   ├── app/             # Next.js App Router 页面
│   │   └── api/health/  # 容器存活探针
│   ├── components/      # React 组件
│   │   ├── layout/      # 布局组件
│   │   ├── ui/          # shadcn/ui 组件
│   │   ├── three/       # Three.js 3D 组件
│   │   └── video/       # 视频相关组件
│   ├── lib/             # 工具函数
│   ├── server/          # 服务端代码
│   │   └── routers/     # tRPC routers
│   └── stores/          # Zustand stores
├── deploy/              # 公网机部署配置（Nginx / Rathole Server）
├── uploads/             # 上传文件目录（生产用命名卷）
├── compose.yaml         # Docker / Podman Compose 配置
├── Dockerfile           # 应用镜像（多阶段：deps / builder / migrator / runner）
└── Dockerfile.rathole   # Rathole 隧道客户端镜像
```

## 默认账户

运行 `nub run db:seed` 后：

- **管理员**: admin@acgnflow.com / admin123

## SEO & AI 端点

| 路径 | 说明 |
|------|------|
| `/sitemap.xml` | 动态站点地图 |
| `/robots.txt` | 爬虫规则 |
| `/feed.xml` | RSS 订阅 |
| `/llms.txt` | AI/LLM 友好说明 |
| `/.well-known/ai-plugin.json` | ChatGPT 插件发现 |

## License

[GNU AGPLv3](LICENSE)
