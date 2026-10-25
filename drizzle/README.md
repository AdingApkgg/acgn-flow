# 数据库初始化与旧库升级

合成夹具验证结果及未覆盖边界见 [2026-10-26 验证记录](verification-2026-10-26.md)。

应用启动只创建连接池，不自动建表或迁移。执行前确认主机、数据库和备份。以下命令只能在项目指定的远程构建机或已授权的运维环境执行，本机不启动数据库或容器。

## 全新安装

`DATABASE_URL` 指向专用空数据库。`db:init` 拒绝包含任何表的 public schema，不能用于升级既有数据库。

```sh
bun scripts/db-init.ts --confirm-database=acgn_flow
bun scripts/db-seed.ts --confirm-database=acgn_flow
bun scripts/db-check.ts
```

## 既有数据库升级

先备份并在隔离副本演练，再单独审批真实数据变更。升级会锁定旧业务表阻止并发写入，需安排维护窗口。事务失败会回滚。不得把 `baseline/0000_legacy.sql` 用在既有库，也不得用 schema push 绕过增量迁移。

```sh
bun scripts/db-check.ts --legacy
bun scripts/db-upgrade.ts --confirm-database=acgn_flow
bun scripts/db-check.ts
```

升级前使用 `db:check --legacy` 只核对旧表；默认 `db:check` 还要求新认证表存在。可在独立演练中保存升级命令输出，其中包含 24 张原表迁移前后的数量、ID 摘要和原字段内容摘要。升级会校验这些结果完全相同。摘要在同一 PostgreSQL 实例、同一版本内用于比较，不是跨版本备份校验和。

`baseline/0000_legacy.sql` 继续冻结原 209 列结构。初始化与升级都显式执行 `migrations/0002_content_type.sql`：缺少 `ContentType` / `Video.contentType` 的旧库补上枚举与默认 `VIDEO` 列；已有该列的 210 列库保留原 `VIDEO` / `FLASH` 值。该增量独立于 `auth-v1` 的账号复制完成标记，因此早期已完成认证升级的数据库也可重复执行来补列。

迁移前已存在的 `contentType` 使用与业务 ID 绑定的独立内容摘要核对，能够发现两个视频之间的类型互换。迁移前不存在该列时，本轮升级只比较原 209 列，避免新增默认值导致误报；升级后的独立 `db:check` 会包含新列摘要，并拒绝缺少内容类型增量的数据库。认证与内容类型变更在同一事务内，任何失败都会一起回滚。

认证迁移规则：

- 原 `User`、`Account`、`Session`、`LoginSession`、验证码与所有业务表完整保留；物理表名、原列名、枚举、索引、外键动作和毫秒精度保持一致。
- `User.name` 使用非空昵称或用户名回填；`authEmailVerified` 从旧 `emailVerified` 日期是否存在初始化，日期字段仍保留。Better Auth 将 `avatar` 映射为 `image`、`authEmailVerified` 映射为布尔 `emailVerified`。
- 旧密码复制到新 `AuthAccount`，`providerId=credential`、`accountId=user.id`，bcrypt 哈希原样保存，由认证层使用 bcrypt 验证。
- OAuth 按 provider 和外部账号 ID 迁移，Unix 秒到期时间转换为 UTC 毫秒时间。旧 token_type、session_state 等没有目标字段的内容继续保存在原 Account 表。
- 新 ID 使用 nanoid；既有业务 ID 不变。首次账号复制遇到归属冲突会使整个事务失败。事务成功写入 `auth-v1` 完成标记后，重跑不再从旧认证表回灌账号，避免恢复用户已主动解绑的 OAuth 登录方式；也不覆盖新密码、令牌或新的布尔邮箱验证状态。失败事务没有完成标记，可以安全重试。
- `db:check` 校验成功迁移标记。`legacyCredentialsWithoutLiveAccount`、`legacyOAuthWithoutLiveAccount` 是切换后与历史源数据的对账信息，可能来自主动解绑，不自动视为迁移失败，也不能据此自动恢复旧绑定。
- 旧会话及验证码不转为有效 Better Auth 会话，切换后必须重新登录。会话撤销由认证层删除或失效新 AuthSession。业务层的旧 LoginSession 继续作为历史记录。
- 旧 `@updatedAt` 语义使用 Drizzle `$onUpdate`，与原应用一样由 ORM 执行更新；原 SQL 无默认值的列不擅自加入数据库默认值。所有新增 ID 默认值也在应用层执行。
- 种子只补缺少标签，遇到名称或 slug 冲突保留原记录，不删除或重命名旧标签及视频关系。

## 真实 PostgreSQL 迁移测试

测试只读取 `TEST_DATABASE_URL`，从不回退到 `DATABASE_URL`。数据库名必须含独立的 `test` 或 `fixture` 部分，例如 `acgn_flow_test`。数据库用户需有创建 schema 权限。每项测试在随机临时 schema 中创建合成旧结构，结束后只删除该临时 schema。

```sh
TEST_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/acgn_flow_test bun test src/db/__tests__/migration.test.ts
```

该文件验证新库初始化、24 表原字段/ID/计数、209/210 列旧库升级、已有 FLASH 保留及类型互换检测、已完成认证升级后补列、bcrypt、GitHub/Google/Discord 账号映射、令牌期限、重复迁移、认证失败时增量结构回滚、安全种子、关系查询、nanoid、默认值、更新时间、级联和 SetNull。未配置测试库会明确失败，不视为通过。

手动准备一次性旧结构夹具可使用：

```sh
TEST_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/acgn_flow_fixture bun scripts/db-fixture.ts --confirm-database=acgn_flow_fixture
```

该入口同样只允许专用测试库的空 public schema，数据全部使用 `example.invalid` 和合成令牌，不发送邮件。

## 回退

当前增量保留旧认证源数据，没有自动删除或降级入口。切换后的密码、账号绑定和认证状态可能已经更新，不能简单回滚应用并把旧字段视为最新值。真实切换前应备份数据库、停止写入并制定认证数据对账方案；切换后回退需要单独审阅差异和批准。不要删除新认证表来冒充无损回退。

## Drizzle 开发

`src/db/schema.ts` 是现行 ORM 结构，`baseline/0000_legacy.sql` 和 `src/db/legacy.ts` 是冻结的迁移前结构。`drizzle.config.ts` 将后续 schema 差异输出到 `drizzle/generated`，生成的差异必须人工审阅，并纳入显式运维入口执行。本次升级使用已经审阅的 `migrations/0001_auth.sql`、`migrations/0002_content_type.sql` 与事务内账号迁移，不使用生成器直接写库。
