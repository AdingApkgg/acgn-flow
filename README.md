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
- **播放器**: react-player + hls.js
- **3D**: Three.js + React Three Fiber

## 开始开发

### 1. 安装依赖

```bash
pnpm install
pnpm approve-builds  # 批准依赖的构建脚本
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并填写配置：

```bash
cp .env.example .env
```

### 3. 初始化数据库

```bash
# 生成 Prisma Client
pnpm db:generate

# 推送数据库 schema
pnpm db:push

# (可选) 填充初始数据
pnpm db:seed
```

### 4. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

## 可用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 (Turbopack, 端口 3000) |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 运行 ESLint |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:push` | 推送 schema 到数据库 |
| `pnpm db:migrate` | 运行数据库迁移 |
| `pnpm db:studio` | 打开 Prisma Studio |
| `pnpm db:seed` | 填充初始数据 |

## 生产部署

### 架构概览

```
公网机 (Nginx + Rathole Server)
         ↑
    Rathole 隧道 (:2333)
         ↑
内网机 (Rathole Client + App)
    |-- Next.js App (:1270)
    |-- PostgreSQL (:5432)
    |-- Redis (:6379)
```

### 使用 Podman Compose

```bash
# 构建并启动应用
podman compose up -d --build

# 查看日志
podman compose logs -f app

# 重启服务
podman compose restart

# 停止服务
podman compose down
```

### 端口配置

| 环境 | 端口 | 说明 |
|------|------|------|
| 开发环境 | 3000 | `pnpm dev` |
| 生产环境 | 1270 | `podman compose` (host 网络模式) |

### Rathole 隧道配置

**内网机** (`/etc/rathole/client.toml`):
```toml
[client]
remote_addr = "公网机IP:2333"
default_token = "your-secret-token"

[client.services.acgn-flow]
local_addr = "127.0.0.1:1270"
```

**公网机** (`/etc/rathole/server.toml`):
```toml
[server]
bind_addr = "0.0.0.0:2333"
default_token = "your-secret-token"

[server.services.acgn-flow]
bind_addr = "127.0.0.1:1270"
```

详细部署说明见 [deploy/README.md](deploy/README.md)

## 目录结构

```
acgn-flow/
├── prisma/              # Prisma schema 和种子数据
├── src/
│   ├── app/             # Next.js App Router 页面
│   ├── components/      # React 组件
│   │   ├── layout/      # 布局组件
│   │   ├── ui/          # shadcn/ui 组件
│   │   ├── three/       # Three.js 3D 组件
│   │   └── video/       # 视频相关组件
│   ├── lib/             # 工具函数
│   ├── server/          # 服务端代码
│   │   └── routers/     # tRPC routers
│   └── stores/          # Zustand stores
├── deploy/              # 部署配置文件
├── uploads/             # 上传文件目录
├── compose.yaml         # Podman/Docker Compose 配置
└── Dockerfile           # Docker 构建文件
```

## 默认账户

运行 `pnpm db:seed` 后：

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
