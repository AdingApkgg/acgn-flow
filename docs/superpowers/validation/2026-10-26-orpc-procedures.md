# oRPC 业务接口逐项对照

本表对照迁移前的 118 个 procedure。路径、输入输出的业务语义与权限层级保留；实现统一改为 oRPC handler 与直接 Drizzle 查询，不保留 Prisma 形状代理。

本地分支 `codex/rr8-stack-migration` 的源码副本已在构建机 `localhost-1` 的隔离数据库 `acgn_flow_test` 完成真实运行验证，非生产环境。主验证流程于 2026-10-26 回传以下最新结果：

| 范围                  | 结果                  | 已确认的证据边界                                                                                                                                                                                               |
| --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 业务数据库集成        | 22/22 通过，90 个断言 | 118 个接口路径数量；匿名、封禁、管理员 scope 与站长边界；缓存可见性；稳定分页与关联计数；注册/重置验证码；旧邮箱大小写与碰撞；认证账号与真会话撤销；评论计数；剧集互换顺序；故障注入回滚及超过连接池容量的并发 |
| Better Auth 认证验证  | 9/9 通过，21 个断言   | 真实 Cookie 登录、封禁、撤销与原生平行入口保护；不等于真实第三方 OAuth 验收                                                                                                                                    |
| HTTP 资源与验证码验证 | 14/14 通过，74 个断言 | 包含弹幕保存权限和文件边界；浏览器结果见主报告                                                                                                                                                                 |
| 本地指定文件 Biome    | 13 个业务文件检查通过 | 仅轻量静态检查，未在本机运行安装、构建或服务                                                                                                                                                                   |

第一轮业务集成曾出现 4 项失败，已修复无 JOIN 时相关计数外层列被去除限定名、合成邮箱验证码键大小写不一致等原因，最初重跑 13/13、38 个断言通过，追加用例后又取得 21/21、75 个断言通过。118 个路径数量经过检查不代表每个接口的全部输入、管理员权限组合与并发情形均已动态覆盖；整库类型、构建、完整浏览器与部署状态仍以主验证报告为准。生产数据、生产服务和真实 OAuth 均未在本子任务中操作。

## 需要前后端同时适配的认证边界

- user.register、user.resetPassword 必须提交六位 code；user.updateAccount 真正更换邮箱时必须提交 CHANGE_EMAIL 类型的 code。验证码在动作事务内单次消费，预检接口只读。
- 密码、OAuth 绑定读写 AuthAccount；撤销设备同步删除 AuthSession，旧 LoginSession 只保留设备与历史信息。修改密码撤销其他设备，重置密码撤销全部设备。
- generateSwitchToken 仅返回会话 ID；verifySwitchToken 只验证当前 Cookie 已授权的 multiSession 设备会话，不再签发或接受独立登录 JWT。
- 昵称更新同步 Better Auth 的 name，新邮箱校验同步布尔 authEmailVerified 和旧验证日期。
- 注册查重、重置密码与换邮箱使用大小写无关的唯一邮箱匹配；历史大小写碰撞明确拒绝且不改数据，正常匹配保留原邮箱值。验证码使用规范化邮箱键，SMTP 可使用匹配到的原始邮箱地址。
- 公开 getById 即使命中缓存也重新验证当前 PUBLISHED 状态。

## 查询与事务处理

关联计数保留 _count 对象；计数子查询的内部表使用独立 SQL 别名，外层列包装成嵌套 SQL 片段，避免关系查询重命名或单表投影去除限定名后改变作用域。游标分页包含被上一页保留的边界行，并为相同排序值补充 ID 次序。LIKE 搜索转义用户输入中的百分号、下划线与反斜杠。

评论/留言反应和计数同事务更新，视频反应在每用户/视频锁内互斥；站长转让、OAuth 解绑、标签合并和评论硬删除使用事务。剧集重排先使用临时负序号，允许唯一索引下互换顺序。

## 重点复核与追加验证

首轮 13 条集成通过后，又按管理员权限、SQL 与事务连接范围进行只读复核，发现并经授权修复：

- 7 个事务中的 23 处写入仍引用外层连接，导致回滚无法覆盖全部写入，池满时可能等待额外连接；现已统一使用当前 `tx`，AST 核对最初 20 个事务闭包不含外层 `context.db` 引用；追加批量状态动作事务后为 21 个，并同时检查 `tx` 的词法绑定。
- 旧管理员别名缺少与后台一致的 scope 检查。`video.moderate`、`tag.create/delete`、`user.listUsers` 现复用统一 scope 中间件；管理员替他人管理评论或留言同样需要 `comment:manage`。普通用户删除自己的内容、上传者置顶，以及上传/编辑自有视频时调整标签的权限保留。
- 真实 SSR 验证暴露原始 SQL `EXISTS/NOT EXISTS` 缺少子查询括号，造成标签页 500。已按 AST 全量补齐 12 处，覆盖标签过滤、关联筛选、历史、会话与空标签清理。

业务集成由 13 条追加到 21 条后，真实运行已全部通过，75 个断言。覆盖增加了真实标签筛选、历史/会话查询、12 并发互动、管理员 scope 反例与正例、普通用户原有管理流程。

随后整库类型检查发现两个评论硬删除事务的参数仍为 `_tx`，正文却使用 `tx`；原回滚用例只断言发生异常，会把这种 `ReferenceError` 也误判为预期故障。现已修正参数名，回滚测试改为严格断言注入错误消息，只有执行到指定最终写入才可通过；同时添加单条硬删除成功验证、批量 hide/show/delete/restore 与批量硬删除成功/回滚回归，业务套件现为 22 条。故障代理的 `Reflect.apply` 调用也已增加函数类型收窄。最终远程复核为 22/22、90 个断言全部通过，最新整库类型检查通过。

## 118 个接口

| 路径                            | 原调用类别 | 服务端权限         | 新实现                 |
| ------------------------------- | ---------- | ------------------ | ---------------------- |
| `admin.getMyPermissions`        | query      | protectedProcedure | oRPC handler + Drizzle |
| `admin.getPublicStats`          | query      | protectedProcedure | oRPC handler + Drizzle |
| `admin.getGrowthStats`          | query      | protectedProcedure | oRPC handler + Drizzle |
| `admin.getGrowthTrend`          | query      | protectedProcedure | oRPC handler + Drizzle |
| `admin.getUserStats`            | query      | adminProcedure     | oRPC handler + Drizzle |
| `admin.listUsers`               | query      | adminProcedure     | oRPC handler + Drizzle |
| `admin.banUser`                 | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.unbanUser`               | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.batchBanUsers`           | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.batchUnbanUsers`         | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.updateUserRole`          | mutation   | ownerProcedure     | oRPC handler + Drizzle |
| `admin.updateAdminScopes`       | mutation   | ownerProcedure     | oRPC handler + Drizzle |
| `admin.getVideoStats`           | query      | adminProcedure     | oRPC handler + Drizzle |
| `admin.listAllVideos`           | query      | adminProcedure     | oRPC handler + Drizzle |
| `admin.moderateVideo`           | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.deleteVideo`             | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.batchModerateVideos`     | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.batchDeleteVideos`       | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.getTagStats`             | query      | adminProcedure     | oRPC handler + Drizzle |
| `admin.createTag`               | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.listTags`                | query      | adminProcedure     | oRPC handler + Drizzle |
| `admin.updateTag`               | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.deleteTag`               | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.batchDeleteTags`         | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.mergeTags`               | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.listComments`            | query      | adminProcedure     | oRPC handler + Drizzle |
| `admin.toggleCommentHidden`     | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.deleteComment`           | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.restoreComment`          | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.getCommentStats`         | query      | adminProcedure     | oRPC handler + Drizzle |
| `admin.batchCommentAction`      | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.hardDeleteComment`       | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `admin.batchHardDeleteComments` | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `comment.listRecent`            | query      | publicProcedure    | oRPC handler + Drizzle |
| `comment.list`                  | query      | publicProcedure    | oRPC handler + Drizzle |
| `comment.getReplies`            | query      | publicProcedure    | oRPC handler + Drizzle |
| `comment.getCount`              | query      | publicProcedure    | oRPC handler + Drizzle |
| `comment.create`                | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `comment.update`                | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `comment.delete`                | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `comment.react`                 | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `comment.pin`                   | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `guestbook.list`                | query      | publicProcedure    | oRPC handler + Drizzle |
| `guestbook.getReplies`          | query      | publicProcedure    | oRPC handler + Drizzle |
| `guestbook.getCount`            | query      | publicProcedure    | oRPC handler + Drizzle |
| `guestbook.create`              | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `guestbook.update`              | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `guestbook.delete`              | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `guestbook.react`               | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `guestbook.pin`                 | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `series.listByUser`             | query      | publicProcedure    | oRPC handler + Drizzle |
| `series.getById`                | query      | publicProcedure    | oRPC handler + Drizzle |
| `series.getByVideoId`           | query      | publicProcedure    | oRPC handler + Drizzle |
| `series.create`                 | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `series.update`                 | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `series.delete`                 | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `series.addVideo`               | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `series.removeVideo`            | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `series.updateEpisode`          | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `series.reorderEpisodes`        | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `tag.getBySlug`                 | query      | publicProcedure    | oRPC handler + Drizzle |
| `tag.list`                      | query      | publicProcedure    | oRPC handler + Drizzle |
| `tag.popular`                   | query      | publicProcedure    | oRPC handler + Drizzle |
| `tag.create`                    | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `tag.delete`                    | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `user.register`                 | mutation   | publicProcedure    | oRPC handler + Drizzle |
| `user.getProfile`               | query      | publicProcedure    | oRPC handler + Drizzle |
| `user.getVideos`                | query      | publicProcedure    | oRPC handler + Drizzle |
| `user.me`                       | query      | protectedProcedure | oRPC handler + Drizzle |
| `user.generateSwitchToken`      | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.verifySwitchToken`        | mutation   | publicProcedure    | oRPC handler + Drizzle |
| `user.updateProfile`            | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.getDevices`               | query      | publicProcedure    | oRPC handler + Drizzle |
| `user.recordDevice`             | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.removeDevice`             | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.getLoginSessions`         | query      | protectedProcedure | oRPC handler + Drizzle |
| `user.revokeLoginSession`       | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.revokeAllOtherSessions`   | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.updateAccount`            | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.changePassword`           | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.resetPassword`            | mutation   | publicProcedure    | oRPC handler + Drizzle |
| `user.deleteAccount`            | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.getAvatarGallery`         | query      | protectedProcedure | oRPC handler + Drizzle |
| `user.updateAvatar`             | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `user.listUsers`                | query      | adminProcedure     | oRPC handler + Drizzle |
| `user.setUserRole`              | mutation   | ownerProcedure     | oRPC handler + Drizzle |
| `user.transferOwnership`        | mutation   | ownerProcedure     | oRPC handler + Drizzle |
| `user.getLinkedAccounts`        | query      | protectedProcedure | oRPC handler + Drizzle |
| `user.unlinkAccount`            | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.recordSearch`            | mutation   | publicProcedure    | oRPC handler + Drizzle |
| `video.getHotSearches`          | query      | publicProcedure    | oRPC handler + Drizzle |
| `video.searchSuggestions`       | query      | publicProcedure    | oRPC handler + Drizzle |
| `video.getPublicStats`          | query      | publicProcedure    | oRPC handler + Drizzle |
| `video.list`                    | query      | publicProcedure    | oRPC handler + Drizzle |
| `video.getById`                 | query      | publicProcedure    | oRPC handler + Drizzle |
| `video.getMyVideos`             | query      | protectedProcedure | oRPC handler + Drizzle |
| `video.getForEdit`              | query      | protectedProcedure | oRPC handler + Drizzle |
| `video.incrementViews`          | mutation   | publicProcedure    | oRPC handler + Drizzle |
| `video.submitBatchToIndexNow`   | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.create`                  | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.update`                  | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.delete`                  | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.batchDelete`             | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.like`                    | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.dislike`                 | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.confused`                | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.favorite`                | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.getInteractionStatus`    | query      | protectedProcedure | oRPC handler + Drizzle |
| `video.moderate`                | mutation   | adminProcedure     | oRPC handler + Drizzle |
| `video.getFavorites`            | query      | protectedProcedure | oRPC handler + Drizzle |
| `video.getHistory`              | query      | protectedProcedure | oRPC handler + Drizzle |
| `video.recordHistory`           | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.clearHistory`            | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.removeHistoryItem`       | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.unfavorite`              | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.batchUnfavorite`         | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.batchRemoveHistory`      | mutation   | protectedProcedure | oRPC handler + Drizzle |
| `video.getRecommendations`      | query      | publicProcedure    | oRPC handler + Drizzle |

## 验证入口

- `bun test src/server/services/__tests__/query.test.ts`：纯 SQL、游标别名、稳定边界、LIKE 转义与缺失记录。
- 在隔离 PostgreSQL 和 Redis 夹具中：`RUN_BUSINESS_INTEGRATION=1 bun test src/server/routers/__tests__/business.integration.test.ts`。验证 118 路径、匿名/封禁/管理员 scope/站长、缓存可见性、分页和关联计数、注册/重置验证码、AuthAccount 密码、AuthSession 撤销、评论计数、旧大小写邮箱/历史碰撞与剧集换序。该测试单独进程运行并在结束时关闭连接，不能指向生产数据库。
- 真实 OAuth、生产数据库升级和生产发布不在本表的通过范围内。
