# main 集成与生产发布验证

用户已授权推送迁移分支、创建PR、合入main、处理其他PR、清理远程分支及更新生产。本轮延续原迁移，验证新增功能和生产副本，不把原98项基线结果当作最新集成结果。

## 集成范围

- 合入 main 的5个新增提交至 `0e9fdb8`，保留 Flash/Ruffle、上传、B站同源播放解析以及移动播放器改进；继续使用 RR8/Vite8/Bun/Hono/oRPC/Drizzle/Better Auth/Biome/Video.js。
- 迁移PR为 [#2](https://github.com/AdingApkgg/acgn-flow/pull/2)。既有部署 [#1](https://github.com/AdingApkgg/acgn-flow/pull/1) 的容器与可选隧道意图适配到新栈，自动 Prisma schema push 替换为显式增量迁移。
- 不关闭共享宿主机 PostgreSQL、Redis、PM2 或 Cloudflare Tunnel。应用回源仍为1270，公网域名仍为 `https://af.saop.cc`。

## 最终远程检查

执行主机：`localhost-1.tailac9c6f.ts.net`，已核实 Linux hostname。源码验证目录 `/home/i/acgn-flow-migration-20261026`。本机没有安装、构建或启动服务。

| 检查                    | 结果                                             |
| ----------------------- | ------------------------------------------------ |
| Bun frozen lock         | 通过，新增 Ruffle 锁版 `0.2.0-nightly.2026.3.11` |
| Biome                   | 235文件，0错误、0警告，53条信息                  |
| RR typegen / TypeScript | 通过                                             |
| Vite客户端 / SSR构建    | 通过                                             |
| 单元                    | 59通过 / 204断言                                 |
| 数据迁移                | 7通过 / 82断言                                   |
| 业务数据库              | 23通过 / 104断言                                 |
| Better Auth             | 9通过 / 21断言                                   |
| HTTP                    | 16通过 / 88断言                                  |
| SSR路由                 | 4通过 / 48断言                                   |
| 浏览器                  | 7通过                                            |

合计 **125项测试通过**；Bun部分547个断言，另有Playwright断言。HTTP新增拒绝写入用例曾因 `readdir` 无序返回失败，改为比较排序后的完整列表，未弱化文件内容或权限检查。

## 审阅修复与实际播放

最终独立审阅发现并修复两项问题：用户SWF与登录页面同源、编辑页拒绝新站内媒体URL。定向复核无新增P1/P2阻断。

Flash现在运行于不透明来源iframe；双层sandbox、CSP、匿名GET和拒绝重定向共同约束网络。API未开放CORS，仅指定公开Ruffle JS/WASM和SWF允许匿名读取。父页面校验消息窗口、来源与类型，无法借用父页登录会话。浏览器先取得真实登录RPC载荷，再让恶意SDK尝试携带Cookie写RPC、读取父页/Cookie、顶层导航，断言零授权请求到达、数据库未改变；合法SWF读取无Cookie。

真实生产唯一Flash文件只读复制到隔离环境，使用锁定Ruffle/WASM成功加载：950×490、SWF10、ActionScript3，页面异常0。该验证使用实际文件，不以受控SDK替代。额外联网资源会被沙箱阻止，外部SWF需要匿名CORS；`allowNetworking:none`未作为唯一安全边界。

Video.js保留MP4/HLS、字幕、弹幕及嵌入适配器，移植20秒加载看门狗、有限自动/手动重试、续播、AbortError播放意图、移动手势与实际亮度滤镜。桌面双击全屏与手机左右双击seek保持main原语义。

Cloudflare在宿主机终止TLS后，应用按已配置的确切公开Host恢复HTTPS，统一CSP、同源与认证回调；不信任其他Host的转发头。新增3项回归保留POST正文、Cookie、查询与回环预览。

## 真实数据演练与回退准备

- 生产基线：`0e9fdb8`，PostgreSQL18.6，20用户 / 1679内容 / 5个旧OAuth账号 / 8个历史会话；内容类型VIDEO1678、FLASH1。
- 已生成私有数据库、上传、环境和单个PM2应用备份。最初数据库备份604513字节、上传压缩备份2377782字节；摘要与日志仅在私有备份目录保存，凭据未进入Git或工具输出。
- 在独立PostgreSQL18.6中恢复并执行增量升级，原24表209字段及已有contentType按ID摘要核对通过；用户/内容/Flash数量保持，25个认证账号，旧密码与OAuth映射差异均0。旧会话不导入为有效新会话。
- 新目标PostgreSQL/Redis使用全新专用卷，原宿主库和旧程序保持。上传只读复制到空卷并调整目标副本为1001:1001，脚本拒绝覆盖非空卷；原1000属主目录不改动。
- 生产私有配置渲染后逐字核对原认证、OAuth、SMTP、Google和B站凭据，差异字段0；显式隔离测试进程继承的APP_URL，最终生产域名仍为af.saop.cc。

## 发布执行记录

源码集成与演练已通过；最终main提交、镜像、维护窗口切换和公网验收结果由后续发布记录补充。真实OAuth第三方授权和邮件投递不会用自动发送或外部账户动作代替用户验收。
