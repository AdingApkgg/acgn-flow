# ACGN Flow 全栈迁移设计

日期：2026-10-26。状态：用户已确认方案 1，并授权直接实施、跳过设计审批。本文记录迁移范围与验收条件，不代表应用已迁移或获得生产操作授权。

只读审阅结果：除方案选择需要用户确认外，没有阻碍制定实施计划的关键未决问题。

## 需求与现状

用户要求彻底迁移到 React Router 8、Vite 8、Hono、oRPC、Drizzle、Bun、Better Auth、Biome、Video.js，并移除 Serwist。

本次只读盘点基于本地 `main` 的 `31faa90`，工作区原先干净。当前使用 Next.js 16.1.6、NextAuth 5 beta、tRPC 11、Prisma 7、pnpm、ESLint、react-player。`src` 下 TypeScript/TSX 约 34,862 行，包含 27 个页面、118 个业务 procedure、24 个数据库模型。

本地仓库没有项目级 AGENTS.md，也没有绑定具体构建主机的操作说明。`ecosystem.config.cjs` 记录部署目录 `/home/i/acgn-flow`，无法据此确认当前运行主机、分支或生产数据库状态。没有连接远程或生产服务进行核验。

## 方案比较

1. **建议：保留全部现有功能与数据，在一个迁移分支内分模块替换，完成验证后整体交付。** RR8 Framework Mode 保留 SSR，Hono 在 Bun 中提供同源服务，oRPC 负责业务调用，Drizzle 映射现有 PostgreSQL 业务表。认证用独立的新表接管，保留旧认证数据用于演练和回退。迁移过程无需生产并行运行两套框架；代价是切换前必须完成全功能验收。
2. 前后端分开部署为 RR8 网站和 Hono API 服务。可以分开扩缩容，但引入跨域、Cookie、OAuth 回调和两套部署协调；当前项目没有这项需求，不建议增加这些复杂度。
3. 长期保留 Next.js，与新架构逐路由共存。方便分批上线，但不能直接达到彻底替换旧技术栈的要求，额外增加双框架维护与会话桥接，不建议采用。

用户已选择方案 1；不包含 UI 重设计、数据库品类更换或功能裁剪。

## 目标架构

```text
浏览器
  └─ Bun / Hono 同源应用
       ├─ RR8 Framework Mode / Vite 8：SSR、页面路由、静态构建资源
       ├─ /api/rpc/*：oRPC + Zod + TanStack Query
       ├─ /api/auth/*：Better Auth
       ├─ 原有上传、B 站、邮件、SEO 等 HTTP 端点
       ├─ Drizzle → PostgreSQL
       └─ ioredis → Redis
```

RR8 和 Vite 均必须使用用户指定的主版本。安装前在构建机通过已配置代理核实包版本、peer dependencies 和 Bun 兼容性，使用相互兼容的稳定版本并提交 `bun.lock`。不得因脚手架默认值而回落到 RR7 或 Vite7。其他库默认使用相容的稳定版本，不擅自选择预发布版本。

React 19、Tailwind v4、shadcn/ui、Zustand、TanStack Query、Redis、现有邮件和地理位置组件继续使用；有框架依赖的部分进行适配。服务端环境通过 Zod 校验，浏览器只获得显式允许的站点名称和 URL，不把服务器环境整体暴露到 Vite。

## 页面和资源路由

以下 27 个页面保持可访问路径、主要功能及权限：

- `/`、`/search`、`/tags`、`/tag/:slug`、`/video/:id`、`/user/:id`、`/comments`。
- `/login`、`/register`、`/forgot-password`。
- `/upload`、`/video/edit/:id`、`/my-videos`、`/favorites`、`/history`、`/profile`。
- `/settings`、`/settings/account`、`/settings/connections`、`/settings/sessions`、`/settings/danger`。
- `/dashboard`、`/dashboard/users`、`/dashboard/videos`、`/dashboard/tags`、`/dashboard/comments`、`/dashboard/settings`。

将 `next/link`、导航 hooks、Image、动态导入、服务端 metadata、路由 params、布局和错误边界改为 RR8 / 浏览器原生方案。直接使用新的框架 API，不保留模拟 Next.js 的整套兼容框架。

首页、视频、用户、标签和搜索等公开内容继续具有 SSR 页面内容及逐页 title、description、canonical、OpenGraph、Twitter 和结构化数据。分页、过滤参数及浏览器前进后退保持工作。不存在的资源返回真实 404；未发布视频继续执行原有可见性限制。

保留 `/api/upload`、`/uploads/*`、`/api/bilibili/{batch,danmaku,image,parse,random-image}`、验证码、邮件、IndexNow、RSS、robots、sitemap 索引及各分片、llms、manifest、站点图标、动态 OG 图和 `.well-known` 路由。资源端点从 Next Request/Response 转为标准 Request/Response 或 Hono；文件读取保留路径边界、内容类型和权限检查。需要图像渲染时选择 Bun 支持的独立实现，不能直接丢弃 OG/图标能力。

## oRPC 业务层

完整迁移 `user`、`video`、`tag`、`admin`、`comment`、`guestbook`、`series` 共 118 个 procedure，并记录逐项对照表。oRPC 使用真实的 middleware、handler 和 fetch RPCHandler；前端调用改为 oRPC 的 TanStack Query 集成，彻底移除 tRPC provider、client、server 及依赖。

上下文从请求读取 Better Auth 会话，并注入数据库、缓存和设备/IP 信息。所有鉴权在服务端执行，保留 USER/ADMIN/OWNER、adminScopes、封禁、资源所有者、站长转让、评论软删除/隐藏/永久删除等语义。输入、输出和错误保持可类型检查，日期、JSON、可空值和无限分页的序列化必须验证。

## Drizzle 与数据兼容

保留 PostgreSQL、Redis 以及业务 ID。24 个现有模型都要有迁移归属；视频、标签、合集、剧集、互动、历史、播放列表、评论、留言、设备、搜索记录等表继续映射现有物理表名和列名。Drizzle 取代所有 Prisma 查询、聚合、事务、种子脚本与配置，不使用 Prisma 形状的通用代理层作为最终交付。

先建立旧结构 baseline；在独立测试数据库恢复合成旧结构夹具，演练后再考虑用户批准的真实快照。认证变化使用增量、可重复执行的迁移，保留旧字段和旧表，不在本次自动删除历史数据。全新安装初始化和旧库升级必须有明确分开的入口，避免把建库 SQL 误用于既有数据库。

核对每表数量、业务 ID、关联完整性、枚举、默认值、唯一索引、级联/SetNull、JSON 与时区。重点验证 Prisma 的 `@updatedAt`、客户端 ID 默认值、筛选后计数、关系排序、cursor 分页和事务内计数更新在 Drizzle 中的等价行为。数据库变更不在应用启动时隐式执行。

## Better Auth

由 Better Auth 管理登录、密码、OAuth 和会话，使用 Drizzle adapter。保留邮箱/用户名登录、GitHub/Google/Discord、注册邮件验证码、密码重置、绑定/解绑、多账号切换、设备与会话列表、撤销会话、修改密码、账户删除及站长权限。

兼容方案：

- 用户 ID、用户名、昵称、头像、角色和业务关联保留；Better Auth 需要的 name、image、emailVerified 通过明确的认证结构/映射承接，不把原 DateTime 验证记录直接当布尔值使用。
- 为旧密码用户生成 `providerId = credential`、`accountId = user.id` 的认证 account 记录，复制原 bcrypt hash，并使用兼容的 bcrypt 验证；不要求用户统一重置密码，不把旧密码字段继续当作认证真源。
- OAuth 按 provider 和外部账号 ID 迁移，并明确转换 token 到期时间等字段。账号关联仅通过受信任 provider 的已验证身份或当前用户的显式绑定完成，不能只凭未经核验的同名邮箱合并账号。
- Better Auth 数据库会话成为权限判定依据；旧 JWT 不作格式兼容，切换后重新登录。旧 LoginSession 作为历史保留，新会话撤销必须真正使认证失效，多账号切换不得重新签发已撤销会话。
- 验证码的校验与消费必须在服务端的注册/重置/换邮箱动作中落实，不能仅依赖前端预检。保留限流与有效期。验证预览使用邮件接收夹具，不向真实收件人发信。
- OAuth 的生产回调 URI 调整属于外部服务配置，实施时整理准确变更清单，生产应用前单独确认。未配置凭据的 provider 在界面隐藏；有代码但未连真实 provider 不能宣称真实 OAuth 验收通过。

## Video.js

完全替换 react-player，采用 Video.js 兼容的稳定版本及其媒体能力。挂载在浏览器执行，SSR 不访问 DOM；StrictMode 重挂载、切源、路由离开正确销毁实例、事件与轨道。

保留现有 `VideoPlayer` 对外接口及功能：MP4/HLS、封面与加载状态、播放进度与续播、拖动、速度/音量/静音、画质/音轨选择、播放结束、全屏、画中画、移动触控、字幕 VTT/SRT/ASS、字幕样式和偏移、XML/JSON 弹幕及高级弹幕、弹幕筛选/速度/区域设置。Video.js 不覆盖的字幕或弹幕功能保留独立渲染层并对齐播放器时钟；不要用删除这些功能换取播放器迁移通过。

需记录外部嵌入视频是否存在单独播放路径，并保持原有支持范围。使用受控媒体夹具验证核心流程，不把第三方防盗链失败误报为已修复或本地媒体播放通过。

## Serwist 退场

删除依赖、CLI、构建步骤、源 worker、Serwist 配置和新 worker 注册。为曾安装旧 `/sw.js` 的客户端提供短期、无 Serwist 依赖的退役脚本，并设置不缓存响应；脚本只负责清理原应用缓存、注销自己并让旧客户端转入新应用，不承担离线/运行时缓存。

清理仅针对确认属于本应用的注册和缓存（现有名称包括 `static-assets`、`images`、`fonts`、`api`、`pages`、`js-css`）；验证部署 origin 没有其他应用共享这些通用缓存名，不得不加区分地删除整个 origin 的 worker 或 caches。需要同时验收旧 worker 已控制页面和首次访问两种情形。Web manifest 可继续保留，但不再提供离线能力。

## Bun、Biome 与部署文件

包管理与应用运行统一使用 Bun，替换 pnpm lock 和脚本。使用 Biome 负责 lint/format，移除 ESLint/Next ESLint 配置。配置实际覆盖源代码和新增配置，不用全局关闭检查、忽略业务目录来制造通过。

更新 Dockerfile、Compose 示例、PM2 入口、环境变量示例、README、部署文档和忽略列表。容器用 Bun 构建和运行；数据库迁移为独立显式命令。保留上传卷、IP 数据库只读挂载、端口 1270 以及现有 Nginx/Rathole 接入方式。运行 Bun/Compose 示例不代表本次已发布。

## 验证与交付边界

本机只读改代码、运行针对改动文件的 lint 或单个轻量测试文件。依赖安装、生成/构建、整库类型检查、全量测试、容器与浏览器验收均在用户允许的专用构建机执行。

建议在 `localhost-1.tailac9c6f.ts.net` 使用新的隔离目录与独立数据库、Redis namespace、上传目录、预览端口。远程执行前确认 hostname 和已有环境，不重置已有 checkout。境外联网使用该机已配置代理；本机若有联网命令，显式携带用户指定的 `http://127.0.0.1:10808`。构建机不可用则报告阻塞，不退回本机重负载验证。

验收至少包括：

1. Bun frozen install、RR8 路由生成、全库类型检查、生产构建、Biome 均成功；扫描确认 Next.js、NextAuth、tRPC、Prisma、react-player、Serwist 不再出现在运行源码、直接依赖和执行配置中，退役 worker 文档允许说明旧缓存来源。
2. 27 个页面、资源路由以及 118 个业务接口有迁移/验收对照；公开 SSR 和 404、用户与管理员权限、分页、搜索、上传和 B 站批量导入不退化。
3. 旧结构夹具升级前后业务数量、关联和旧密码登录一致；新库初始化通过；迁移重复执行结果明确；合成 OAuth 账号映射和会话撤销通过。真实 OAuth 和生产快照验收单独标明证据状态。
4. 独立预览服务在构建机启动成功，服务端无私密环境泄漏。浏览器验证登录、注册、重置、退出、权限、视频切源/续播/字幕/弹幕、桌面/移动布局及旧 SW 退役。
5. 容器镜像在构建机通过启动与健康检查；数据迁移、生产切换、外部 OAuth 配置与回退演练分别记录结果。

实现按基础框架、数据层、认证、业务接口/页面、播放器/SW、部署文档等功能形成可独立审阅的提交。未经用户授权，不推送、合并、修改生产配置、生产数据库、生产服务或删除历史记录。

## 参考资料

- React Router 当前官方版本与 Framework Mode：<https://reactrouter.com/changelog>（本次读取显示 8.5.0）。
- Vite 8.1 官方说明：<https://vite.dev/blog/announcing-vite8-1>。
- Drizzle 接入既有 PostgreSQL：<https://orm.drizzle.team/docs/get-started/postgresql-existing>。
- Better Auth 从 NextAuth 迁移：<https://github.com/better-auth/better-auth/blob/main/docs/content/docs/guides/next-auth-migration-guide.mdx>。
- oRPC 从 tRPC 迁移：<https://github.com/dinwwwh/orpc/blob/main/apps/content/docs/migrations/from-trpc.mdx>。
- Video.js React 生命周期：<https://videojs.com/guides/react/>。

Context7 中部分 RR8 检索结果仍包含 RR7 future flag 示例，因此具体实现必须结合实际安装包类型和 RR8 官方文档核对，不能原样照搬过时配置。
