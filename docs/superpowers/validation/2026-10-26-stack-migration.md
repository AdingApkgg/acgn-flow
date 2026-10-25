# 全栈迁移最终验证

日期：2026-10-26。工作分支：`codex/rr8-stack-migration`，基线：`31faa90`。

## 交付范围

应用改为 Bun/Hono 同源入口，React Router 8 Framework Mode / Vite 8 提供 SSR 与客户端路由，118 个业务 procedure 改为 oRPC 和直接 Drizzle 查询。保留原页面路径、24 张业务表的物理名称、业务 ID、关联、上传路径和 PostgreSQL / Redis。

Better Auth 使用 Drizzle adapter、用户名登录、多账号设备会话和可即时撤销的数据库会话。增量迁移保留旧 bcrypt 哈希、OAuth 外部账号映射及历史字段；旧登录态切换后需要重新登录。迁移成功标记防止重跑恢复用户已解绑的历史 OAuth 账号。

播放器使用 Video.js 10 官方 React 组件与媒体适配器，保留控制、字幕、弹幕和播放记录。HLS 使用 HlsJsVideo，支持原有 MPEG-TS 分片。Serwist 依赖、配置、注册和旧编译 worker 已删除；`/sw.js` 仅提供退役逻辑，不注册新 worker。

旧 Next.js、NextAuth、tRPC、Prisma、ReactPlayer、ESLint 和 pnpm 运行入口与直接依赖已移除。Better Auth 自带的未使用 adapter 和可选 peer 元数据可能仍在锁文件中；没有安装或调用 Prisma Client。`next-themes` 是保留的独立主题库。

## 锁定版本

| 组件                                  | 验证版本                 |
| ------------------------------------- | ------------------------ |
| Bun                                   | 1.4.2                    |
| React Router / dev                    | 8.5.0                    |
| Vite                                  | 8.3.5                    |
| React / React DOM                     | 19.3.1                   |
| Hono / Bun adapter / Vite dev server  | 4.13.14 / 1.0.1 / 0.26.1 |
| oRPC server / client / TanStack Query | 1.16.1                   |
| Drizzle ORM / Kit                     | 0.45.4 / 0.31.11         |
| Better Auth / Drizzle adapter         | 1.7.13                   |
| Biome                                 | 2.6.3                    |
| Video.js React 及官方媒体适配器       | 10.2.0                   |
| TypeScript / Playwright               | 5.9.3 / 1.64.1           |

## 验证环境

- SSH 目标：`localhost-1.tailac9c6f.ts.net`。已核实远程 Linux hostname 为 `localhost`，不是本机 Mac。
- 隔离目录：`/home/i/acgn-flow-migration-20261026`，原 `/home/i/acgn-flow` 没有覆盖。
- 专用合成数据库 `acgn_flow_test`，PostgreSQL / Redis 仅回环端口 `55439` / `56379`；测试强制要求显式 `TEST_DATABASE_URL`。
- 生产构建预览 `127.0.0.1:31270`；容器烟测 `127.0.0.1:31271`；开发预览验证使用 `127.0.0.1:31272`。
- 开发预览完成后已停止，保留生产构建预览和容器供复查。
- 安装、整库类型检查、构建、全量测试、浏览器和容器均在远程执行。本机只编辑代码、Git 和轻量定向检查。
- 境外下载使用构建机已有 `127.0.0.1:11090` 代理，没有保存代理凭据或将测试环境密钥提交到仓库。

## 检查结果

| 范围           | 命令 / 方法                                                                                     | 结果                                             |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 锁文件安装     | `bun install --frozen-lockfile`，容器内另有生产依赖安装                                         | 通过                                             |
| Biome          | `bun run lint`                                                                                  | 221 个文件，0 错误、0 警告；52 条信息级提示      |
| 整库类型       | `bun run typecheck`                                                                             | RR typegen 和 TypeScript 通过                    |
| 生产构建       | `bun run build`                                                                                 | Vite 客户端与 SSR 构建通过                       |
| 客户端秘密扫描 | 扫描最终 JS / CSS / HTML / JSON / map 的实际环境值                                              | `clientSecretLeakKeys: []`                       |
| 旧运行依赖     | 检查 node_modules 中旧框架、ORM、RPC 与播放器运行包                                             | `removedRuntimePackagesStillInstalled: []`       |
| 单元测试       | `bun run test`                                                                                  | 40 通过，72 个断言                               |
| 数据迁移       | `bun test src/db/__tests__/migration.test.ts`                                                   | 4 通过，65 个断言                                |
| 业务数据库     | `RUN_BUSINESS_INTEGRATION=1 bun test src/server/routers/__tests__/business.integration.test.ts` | 22 通过，90 个断言                               |
| 认证           | `RUN_AUTH_INTEGRATION=1 bun test tests/auth.integration.test.ts`                                | 9 通过，21 个断言                                |
| HTTP 资源      | `RUN_HTTP_INTEGRATION=1 bun test tests/http.integration.test.ts`                                | 14 通过，74 个断言                               |
| 生产构建 SSR   | `RUN_ROUTES_INTEGRATION=1 bun test tests/routes.integration.test.ts`                            | 4 通过，48 个断言                                |
| 生产构建浏览器 | `bun run test:browser`，远程现有 Chromium                                                       | 5 通过                                           |
| 开发浏览器     | 同一浏览器套件选择桌面 / 移动与登录流程                                                         | 3 通过，属于重复验证，不追加到 98 项总数         |
| Compose        | 两份 Compose 的 `config --quiet`                                                                | 通过，没有启动生产 Compose                       |
| 最终镜像       | `docker build`，通过已有代理、host 构建网络                                                     | 通过，镜像 ID 见下                               |
| 旧卷兼容烟测   | 最终容器、`1001:1001` / `0755` 旧上传卷合成夹具                                                 | 健康、旧文件读取、真实登录后上传字幕及读回均通过 |

共 **98 项测试通过**；Bun 测试包含 370 个断言，另有 Playwright 浏览器断言。开发与容器中的重复用例单列，不重复累计。

镜像标签为 `acgn-flow:migration-20261026`，ID 为 `sha256:75f1123c1b81f2f955783a6489c53e3d1318c84c5220b677f6d8c2ceaed76038`。运行用户保持旧容器的 `1001:1001`，没有更改现有生产上传卷属主。

## 关键动态覆盖

- 在真实 PostgreSQL 中初始化空库、升级完整 24 张旧表，逐表比较 ID、计数和 209 个原字段摘要；验证超过 500 行分批迁移、重跑、解绑保护和冲突回滚。
- 实际验证旧密码、中文及包含 `@` 的旧用户名、大小写邮箱、历史邮箱冲突、验证码单次消费、封禁、改密和会话撤销；认证原生平行入口不能绕过业务规则。
- 业务覆盖权限 scope、匿名与站长边界、公开缓存可见性、分页计数、剧集换序、事务故障注入及超过连接池容量的 12 并发操作。118 路径一致不等于每个接口全部输入组合均已动态穷尽。
- HTTP 覆盖图标 / SEO 资源、真实 404、字幕 MIME、路径穿越及符号链接边界、上传匿名拒绝、弹幕保存鉴权和整批预检。
- 浏览器使用 1440px 和 390px，实际播放合成 MP4 与 MPEG-TS HLS，检查时间推进、字幕、进度和导航；真实数学验证码表单登录后上传并读回字幕。
- 旧 worker 夹具先注册，再更新到退役脚本，确认注销以及仅删除已识别的本站缓存条目，无关缓存条目保留。
- YouTube 使用真实官方适配器和受控 SDK 事件，只证明适配器契约、骨架解除和控制响应；不宣称外部平台实际网络播放验收。

## 集成中已修复的问题

- Drizzle 的 EXISTS 括号与相关计数别名、池外事务调用、评论故障回滚用例误接受 ReferenceError、管理员动作别名 scope。
- 认证邮箱大小写兼容、历史账号回灌、原生会话切换 / 改密 / 解绑平行入口以及验证码校验。
- 弹幕保存的权限、来源校验、批量预检、上传根目录与文件原子替换；批量导入使用实际创建 ID 和对应分P来源。
- Video.js 嵌入适配器仅发 metadata 时的就绪状态；使用 HlsJsVideo 恢复 MPEG-TS HLS。
- CountUp 默认导出的模块互操作、动画包装器挂载后替换子树导致首次交互丢失。包装器现在保持相同元素类型，SSR 首包仍可见。
- 开发中间件让上传 `.ts` 分片和 `/sw.js` 进入 Hono，不再被 Vite 转换；忽略构建与上传文件的开发热更新。
- 保持容器 UID/GID 1001 兼容旧上传卷；生产依赖阶段复用已完成下载的依赖缓存，避免同时安装时争用代理。

## 边界与交付状态

本次没有 push、创建 PR、生产部署、生产数据写入、现网 Nginx / OAuth 控制台 / 防火墙或隧道修改。生产迁移、发布与真实快照验收需要单独授权。

真实 GitHub / Google / Discord OAuth 回调、SMTP 投递、B 站外网导入以及所有第三方媒体平台的实际播放仍需相应凭据和网络验收。合成账号映射和受控适配器不能替代这些结果。

数据库细节见 [迁移记录](../../../drizzle/verification-2026-10-26.md)，业务对照见 [118 procedure](2026-10-26-orpc-procedures.md)，HTTP 细节见 [RR8 / HTTP](2026-10-26-rr8-http.md)，运维步骤见 [部署指南](../../../deploy/README.md)。
