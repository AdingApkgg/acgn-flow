# ACGN Flow 全栈迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. 用户已授权直接实施并跳过设计审批，不再请求计划审批。

**Goal:** 在保留全部现有功能、URL、业务 ID 和数据的前提下，彻底替换指定技术栈并完成隔离远程验证。

**Architecture:** Bun/Hono 提供同源应用，RR8 Framework Mode/Vite8 负责 SSR，oRPC/Zod/TanStack Query 承接全部业务，Drizzle 直接访问既有 PostgreSQL 业务表。Better Auth 通过增量认证表承接登录与会话，Video.js 替换媒体引擎。

**Tech Stack:** React Router 8、Vite 8、React 19、Hono、oRPC、Drizzle、Bun、Better Auth、Biome、Video.js、PostgreSQL、Redis。

**Spec:** `docs/superpowers/specs/2026-10-26-stack-migration-design.md`

## Global Constraints

- 保留 27 页面、118 procedure、24 原始模型及资源路由；无生产推送、切换或数据修改授权。
- 本机不安装、不构建、不启动服务、不运行整库类型检查或浏览器回归；在 localhost-1 隔离目录执行，先核实 hostname。
- 境外访问使用已配置代理；远程现有目录和生产数据库不作复用。
- RR8、Vite8 不降级，其他包采用兼容稳定版本；清除旧框架依赖与配置。
- 模块分工使用同一工作区且严格限定写入目录；各完成项在本计划更新，主代理统一集成与提交。

## Review Focus

- 旧 bcrypt 密码、OAuth 外部 ID、撤销会话：用旧结构夹具迁移后实际登录、拒绝撤销会话。
- 验证码绕过/重复消费：注册与重置接口在服务端验证，不只依赖前端预检。
- Prisma 隐式默认值/事务/关联计数：Drizzle 显式表达并对照旧数据与分页结果。
- SSR/客户端边界和环境泄漏：公开页面 SSR、404、受保护页面与浏览器构建源码检查。
- 播放器切源/StrictMode 与旧 SW 控制：受控媒体回归及安装旧 worker 后退役。

## Task 1：Drizzle schema、认证增量迁移与种子

Files: `src/db/*`、`drizzle/*`、`scripts/db-*`、`drizzle.config.ts`；删除旧 Prisma 代码在集成阶段执行。

Interfaces: `src/db/index.ts` 导出 `db` 与 `pool`；`src/db/schema.ts` 按原模型 lowerCamel 导出 `user`, `video`, `tag`, `tagOnVideo` 等全部业务表，字段保持原 camelCase；额外导出 `authAccount`, `authSession`, `authVerification`。`user` 增加 `name`、`authEmailVerified`，`avatar` 继续作为 image 映射，原 emailVerified DateTime 保留。所有新增 ID 使用 nanoid 默认生成，保留既有 ID。

- [x] 建立全新安装 schema 和旧库 baseline，保留原业务表物理名。
- [x] 写增量认证迁移/演练夹具，复制 bcrypt 和 OAuth account，原表不删除；重复执行安全。
- [x] 实现 Drizzle 连接、关系、唯一索引、默认值与种子。
- [x] 隔离数据库执行新建和旧库升级，对照数量、ID、关联及日期。

## Task 2：oRPC 与业务层

Files: `src/server/orpc.ts`、`src/server/routers/*`、`src/lib/email.ts`。

Interfaces: `createContext({req: Request})` 提供 `db`、`redis`、`session` 与 IP/UA；`publicProcedure/protectedProcedure/adminProcedure/ownerProcedure` 使用 oRPC middleware。`appRouter` 为嵌套 plain object。从 `@/lib/auth` 导入 `getSession(headers: Headers)`，返回 `{user, jti, session}` 或 null；`jti` 为 Better Auth session ID。`user.role` 类型为 USER/ADMIN/OWNER。

- [x] 建立 118 procedure 对照并迁移 oRPC；全部数据库调用改为直接 Drizzle。
- [x] 保留权限、分页、关联计数、事务和缓存语义。
- [x] 用户密码/绑定/会话改读写 authAccount/authSession；验证码验证在服务端落实。
- [x] 远程类型检查和真实数据库接口测试，覆盖匿名/普通/管理/站长。

## Task 3：RR8 页面、客户端与 HTTP 资源

Files: `src/app/**`、`src/root.tsx`、`src/routes.ts`、`src/routes/**`、`src/server/http/**`、`src/components/**`（排除 `video/video-player.tsx`）、`src/lib/orpc.ts`、`src/lib/hooks.ts`、`src/stores/**`。

Interfaces: `src/lib/orpc.ts` 导出类型安全 `orpc` TanStack utils 与 `rpc` client；组件使用 queryOptions/mutationOptions/infiniteOptions。认证客户端从 `@/lib/auth-client` 导入 `authClient`、`useSession`、`signIn`、`signOut`；useSession 暂保留 `{data,status,update}` UI 适配形状，底层为 Better Auth。`src/server/http/index.ts` 导出 Hono 子应用 `httpApp`，保留原非 RPC/auth 资源路径；使用 `getSession(headers)`。

- [x] 建立 RR8 根布局/路由/loader/meta 与 27 页面映射，移除 Next API 和 metadata。
- [x] 接通真实 oRPC TanStack 客户端，迁移全部调用与 invalidation。
- [x] 迁移上传、B 站、邮件、验证码、SEO/图标/OG 资源为标准 HTTP/Hono。
- [x] 远程公开 SSR、404、受保护导航和桌面/移动用户流程验证。

## Task 4：认证、播放器与应用集成

Files: `src/lib/auth.ts`、`src/lib/auth-client.ts`、`src/components/video/video-player.tsx`、`src/env.ts`、`src/server/index.ts`、`vite.config.ts`、`react-router.config.ts`、`package.json`、`biome.json`、`tsconfig.json`。

- [x] 设置兼容依赖、Bun lock、Vite8/RR8/Hono 入口和环境隔离。
- [x] Better Auth Drizzle adapter、用户名、多会话、bcrypt、OAuth、服务端 session 映射和撤销。
- [x] Video.js 生命周期/媒体切换适配现有字幕弹幕与控制逻辑，删除 react-player。
- [x] 删除 Serwist 注册/依赖并提供限定范围的旧 worker 退役。
- [x] 远程 frozen install、全库类型检查、构建、lint 和有意义的认证/播放回归。

## Task 5：部署文档、验收与提交

Files: Dockerfile、Compose、PM2、环境模板、README、deploy/README、验证报告。

- [x] 更新 Bun 部署入口与独立迁移命令，保留卷/挂载/1270 端口。
- [x] 构建机验证容器启动、健康检查、隔离预览及旧数据演练；真实 OAuth/生产验收明确留待授权。
- [x] 独立审阅代码，修复发现，按模块原子提交；不推送。

## 执行记录

- 2026-10-26：用户授权直接实施；远程 SSH 沙箱限制已申请例外，首次回传 hostname 为 localhost（SSH 目标是指定构建机）。进一步核实身份与工具后才执行重负载任务。

- 2026-10-26：全部实现与独立审阅修复完成；远程 98 项测试、类型检查、Biome、生产构建、开发回归、最终镜像和 UID 1001 旧上传卷夹具验证通过。最终结果见 `docs/superpowers/validation/2026-10-26-stack-migration.md`；按功能整理本地提交，不推送、不切换生产。
