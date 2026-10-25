# 数据迁移验证记录

日期：2026-10-26。此记录只覆盖合成夹具，不代表生产快照、生产切换或真实 OAuth 已验收。

## main 内容类型集成回归

本轮保留上述认证迁移基线，并适配 main 新增的 `ContentType` / `Video.contentType`。`baseline/0000_legacy.sql` 与 `src/db/legacy.ts` 的 209 列清单未修改；新增结构通过独立 `migrations/0002_content_type.sql` 执行。

- 主代理远程执行新增测试的 RED：7 tests，3 pass、4 fail。失败证据为新库与旧库读取 `contentType` 得到 `undefined`、已有 `FLASH` 读取不到，以及 `auth-v1` 已完成但缺内容列时核对没有拒绝。
- 新增覆盖：空库默认 `VIDEO` 与显式 `FLASH` 写入、含类型字段的 210 列旧库保留 `FLASH`、类型数量不变的双视频互换也能被快照发现、早期完成认证迁移后补列且不恢复已解绑 OAuth、首次认证失败回滚内容类型及认证 DDL。
- 本机只做四个改动 TS 文件的 Bun 语法扫描、已有 Biome 2.5.14 定向检查及 `git diff --check`，均通过；未运行数据库、安装、构建或 SSH。
- 最终远程 GREEN：7 pass、0 fail、82 个断言。另在 PostgreSQL18.6 上恢复真实生产备份并升级，20 个用户、1679 条内容（FLASH1 / VIDEO1678）保持，旧密码哈希与 OAuth 映射差异均为0。下面的四项绿色记录属于本轮集成前的认证迁移验证。

## 环境与边界

- 远程构建机 SSH 目标：`localhost-1.tailac9c6f.ts.net`，由主代理统一执行远程命令。
- 隔离目录：`/home/i/acgn-flow-migration-20261026`。
- 专用 PostgreSQL 数据库：`acgn_flow_test`，使用 `TEST_DATABASE_URL`；不回退到应用 `DATABASE_URL`。
- 每项集成测试使用随机临时 schema，夹具覆盖全部 24 张旧表。夹具邮箱为 `example.invalid`，OAuth 令牌、会话和验证码均为合成数据。
- 本数据层代理未执行 SSH、依赖安装、本机构建、本机数据库或生产操作；远程结果由主代理回传并记录。

## 数据库验证

命令：`bun test src/db/__tests__/migration.test.ts`。

| 轮次             | 结果                       | 说明                                                                                                                                                                                                                      |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首轮             | 3 pass、0 fail、50 expect  | 当时的新库初始化、24 表旧库升级及归属冲突回滚通过。此轮早于后续分批读取和元数据断言变更，不作为最新版完整通过证据。                                                                                                       |
| 第二轮           | 3 pass、1 fail、43 expect  | 旧库升级、冲突回滚、超过 500 行的密码/OAuth 分批迁移通过；新库用例的元数据断言报 `schema ... does not exist`。                                                                                                            |
| 第二轮修复       | 已改代码                   | 随机 schema 含大写字符，`current_schema()::regnamespace` 按未引用标识符折叠大小写。断言改为按 `pg_namespace.nspname = current_schema()` 查 OID；没有改业务数据或 FK。游标查询同时补显式 `QueryResult` 类型，修复 TS7022。 |
| 第三轮           | 4 pass、0 fail、58 expect  | 元数据断言修复及跨批次迁移全绿；随后自审发现的解绑回灌问题尚未加入该轮测试。主代理也在隔离数据库完成空 public schema 初始化。                                                                                             |
| 解绑回灌回归 RED | 0 pass、1 fail、3 filtered | 只同步新断言后运行“旧库升级完整保留”用例，`afterUnlink.oauthAdded` 期望 0、实际 1，实证重跑恢复已解绑账号。                                                                                                               |
| 解绑回灌修复     | 已改代码，等待全四项重跑   | 成功迁移 `auth-v1` 标记阻止历史账号回灌；失败事务无标记可重试。只读核对使用完成标记，解绑产生的历史差异作为信息；冲突回滚测试改为模拟无成功标记的首次复制。                                                               |
| 最终远程复测     | 4 pass、0 fail、65 expect  | 四项全部通过，包含解绑后重复迁移不恢复旧 OAuth 账号、跨批次复制和冲突回滚。                                                                                                                                               |

自审发现的历史 Account 回灌风险已按真实数据库 RED 结果修复，并通过最终四项数据库回归。

当前集成测试覆盖：

- 新库初始化、默认值、nanoid、更新时间、关系查询、Role 枚举和外键元数据。
- 24 张旧表的数量、业务 ID 与 209 个原字段内容摘要保持一致。
- bcrypt 哈希原样迁移并实际验证旧密码；GitHub、Google、Discord 的 provider/accountId 和 UTC token 到期时间映射。
- 原 JWT/Session/验证码保留但不转为有效新认证会话。
- 重跑不会覆盖新密码、令牌或布尔验证状态，也不会恢复已主动解绑的 OAuth 账号；首次复制遇到账号归属冲突整笔回滚。
- 500 行以上游标分批迁移、重复执行零新增。
- 安全标签种子保留自定义标签及视频关系；Cascade、SetNull 和 onUpdate 行为。

## 本机轻量验证

- `bun test src/db/__tests__/safety.test.ts`：先验证缺少保护时 2 fail，完成保护后 2 pass、0 fail、13 expect；仅测试纯函数，不连接数据库。
- 定向 Biome：使用本机已有 Biome 2.5.14，对数据层改动执行安全 `check --write`，最新 17 个 TS 文件的定向 `check` 无需修改。最终仓库指定 2.6.3 的统一检查由主代理执行。
- Bun TS 语法扫描：17 个数据层文件通过，没有执行构建或依赖安装。
- 只读静态对照：从 Git HEAD 读取迁移前 schema，比对 24 张表的 209 个原字段，名称及顺序一致；仅 User 增加 name、authEmailVerified。

## 尚未覆盖

真实 OAuth provider 回调、真实生产快照、真实邮件、数据库维护窗口、认证切换与切换后回退仍需各自的授权和验证。认证 HTTP 与浏览器的独立结果见 [主验证报告](../docs/superpowers/validation/2026-10-26-stack-migration.md)，不以数据库复制结果替代。
