# ACGN Flow 部署指南

## 架构概览

```
公网机 (Nginx + Rathole Server)
         |
         | TCP 隧道 (:2333)
         v
内网机 (Rathole Client)
    |-- Next.js (:3000)
    |-- PostgreSQL (:5432)
    |-- Redis (:6379)
```

## 技术栈

- **前端**: Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Three.js
- **后端**: tRPC, Prisma 7, NextAuth.js v5
- **数据库**: PostgreSQL, Redis
- **部署**: Podman/Docker, Nginx, Rathole

## 内网机部署

### 1. 环境准备

```bash
git clone https://github.com/your-repo/acgn-flow.git
cd acgn-flow
cp .env.example .env
# 编辑 .env 配置
```

### 2. 启动服务

```bash
# Podman
podman-compose up -d --build

# Docker
docker compose up -d --build
```

### 3. 初始化数据库

```bash
podman exec -it acgn-flow-app pnpm db:push
podman exec -it acgn-flow-app pnpm db:seed
```

### 4. 配置 Rathole 客户端

```bash
cp deploy/rathole-client.example.toml deploy/rathole-client.toml
# 编辑 remote_addr 和 default_token
rathole -c deploy/rathole-client.toml
```

## 公网机部署

### 1. 安装 Rathole

```bash
wget https://github.com/rapiz1/rathole/releases/latest/download/rathole-x86_64-unknown-linux-musl.zip
unzip rathole-x86_64-unknown-linux-musl.zip
sudo mv rathole /usr/local/bin/
```

### 2. 配置 Rathole 服务端

```bash
cp deploy/rathole-server.example.toml deploy/rathole-server.toml
# 编辑 default_token
rathole -s deploy/rathole-server.toml
```

### 3. 配置 Nginx

```bash
sudo cp deploy/nginx-public.conf /etc/nginx/sites-available/acgn-flow.conf
sudo ln -s /etc/nginx/sites-available/acgn-flow.conf /etc/nginx/sites-enabled/
sudo certbot certonly --webroot -w /var/www/certbot -d af.saop.cc
sudo nginx -t && sudo systemctl reload nginx
```

## SEO 和 AI 端点

| 路径 | 说明 | 缓存 |
|------|------|------|
| `/sitemap.xml` | 动态站点地图 | 1h |
| `/robots.txt` | 爬虫规则 | 1d |
| `/feed.xml` | RSS 订阅 | 1h |
| `/llms.txt` | AI/LLM 友好说明 | 1d |
| `/.well-known/ai-plugin.json` | ChatGPT 插件发现 | 1d |

## 防火墙

```bash
# 公网机
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 2333/tcp
```

## 备份

```bash
# 数据库
podman exec acgn-flow-postgres pg_dump -U postgres acgn_flow > backup.sql

# 上传文件
tar -czvf uploads-backup.tar.gz uploads/
```

## 更新

```bash
git pull
podman-compose down
podman-compose up -d --build
podman exec -it acgn-flow-app pnpm db:push
```
