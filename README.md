# ACGN Flow

ACGN Fans 流式媒体内容分享平台。不存储视频文件，仅通过用户提供的直链加载视频。

## 技术栈

- **框架**: Next.js 15 + TypeScript + Turbopack
- **样式**: Tailwind CSS + shadcn/ui
- **状态**: Zustand + TanStack Query
- **API**: tRPC + Zod
- **认证**: NextAuth.js
- **数据库**: PostgreSQL + Prisma
- **缓存**: Redis + ioredis
- **播放器**: react-player + hls.js

## 开始开发

### 1. 安装依赖

```bash
pnpm install
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
| `pnpm dev` | 启动开发服务器 (Turbopack) |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 运行 ESLint |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:push` | 推送 schema 到数据库 |
| `pnpm db:migrate` | 运行数据库迁移 |
| `pnpm db:studio` | 打开 Prisma Studio |
| `pnpm db:seed` | 填充初始数据 |

## 容器化部署

### 使用 Podman Compose

```bash
# 构建并启动所有服务
podman-compose up -d --build

# 查看日志
podman-compose logs -f app

# 停止服务
podman-compose down
```

### 服务说明

| 服务 | 端口 | 说明 |
|------|------|------|
| app | 3000 | Next.js 应用 |
| postgres | 5432 | PostgreSQL 数据库 |
| redis | 6379 | Redis 缓存 |
| nginx | 80/443 | 反向代理 |
| artalk | 8080 | Artalk 评论系统 |

## 目录结构

```
anime-flow/
├── prisma/              # Prisma schema 和迁移
├── src/
│   ├── app/             # Next.js App Router 页面
│   ├── components/      # React 组件
│   │   ├── layout/      # 布局组件
│   │   ├── ui/          # shadcn/ui 组件
│   │   └── video/       # 视频相关组件
│   ├── lib/             # 工具函数
│   ├── server/          # 服务端代码
│   │   └── routers/     # tRPC routers
│   └── stores/          # Zustand stores
├── nginx/               # Nginx 配置
├── uploads/             # 上传文件目录
├── compose.yaml         # Docker Compose 配置
└── Dockerfile           # Docker 构建文件
```

## 默认账户

运行 `pnpm db:seed` 后：

- 管理员: admin@animeflow.com / admin123

## License

[GNU AGPLv3](LICENSE)
