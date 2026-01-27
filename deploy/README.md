# 部署说明

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        公网机                                │
│  ┌─────────┐     ┌──────────────┐                           │
│  │  Nginx  │────▶│   Rathole    │                           │
│  │ :80/443 │     │   Server     │                           │
│  └─────────┘     └──────────────┘                           │
│                         │                                    │
└─────────────────────────│────────────────────────────────────┘
                          │ TCP 隧道
┌─────────────────────────│────────────────────────────────────┐
│                         ▼                     内网机         │
│               ┌──────────────┐                               │
│               │   Rathole    │                               │
│               │   Client     │                               │
│               └──────────────┘                               │
│                      │                                       │
│         ┌────────────┼────────────┐                          │
│         ▼            ▼            ▼                          │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│   │ Next.js  │ │  Artalk  │ │ PgSQL +  │                     │
│   │  :3000   │ │  :8080   │ │  Redis   │                     │
│   └──────────┘ └──────────┘ └──────────┘                     │
└──────────────────────────────────────────────────────────────┘
```

## 内网机部署

### 1. 启动服务

```bash
cd /path/to/acgn-flow
cp .env.example .env
# 编辑 .env 配置

# 使用 Podman Compose
podman-compose up -d --build

# 或 Docker Compose
docker compose up -d --build
```

### 2. 初始化数据库

```bash
podman exec -it acgn-flow-app pnpm db:push
podman exec -it acgn-flow-app pnpm db:seed
```

### 3. 配置 Rathole 客户端

编辑 `deploy/rathole-client.toml`:
- 修改 `remote_addr` 为公网机 IP
- 修改 `default_token` 为你的密钥

运行:
```bash
rathole -c deploy/rathole-client.toml
```

或使用 systemd 服务:
```bash
# /etc/systemd/system/rathole-client.service
[Unit]
Description=Rathole Client
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/rathole -c /path/to/rathole-client.toml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 公网机部署

### 1. 安装 Rathole

```bash
# 下载 rathole
wget https://github.com/rapiz1/rathole/releases/latest/download/rathole-x86_64-unknown-linux-musl.zip
unzip rathole-x86_64-unknown-linux-musl.zip
mv rathole /usr/local/bin/
```

### 2. 配置 Rathole 服务端

编辑 `deploy/rathole-server.toml`:
- 修改 `default_token` 为你的密钥

运行:
```bash
rathole -s deploy/rathole-server.toml
```

### 3. 配置 Nginx

```bash
# 复制配置
cp deploy/nginx-public.conf /etc/nginx/sites-available/acgn-flow.conf
ln -s /etc/nginx/sites-available/acgn-flow.conf /etc/nginx/sites-enabled/

# 修改域名
sed -i 's/your-domain.com/你的域名/g' /etc/nginx/sites-available/acgn-flow.conf

# 获取 SSL 证书
certbot certonly --webroot -w /var/www/certbot -d 你的域名

# 测试并重载
nginx -t
systemctl reload nginx
```

## 防火墙配置

### 公网机
```bash
# 开放端口
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2333/tcp  # rathole 端口
```

### 内网机
无需开放公网端口，所有流量通过 rathole 隧道。

## 更新部署

```bash
# 内网机
cd /path/to/acgn-flow
git pull
podman-compose down
podman-compose up -d --build
```

## 备份

```bash
# 备份数据库
podman exec acgn-flow-postgres pg_dump -U postgres acgn_flow > backup.sql

# 备份上传文件
tar -czvf uploads-backup.tar.gz /path/to/uploads
```
