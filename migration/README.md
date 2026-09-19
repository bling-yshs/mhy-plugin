# 米哈游统一请求接入

## 目录内容

- `upgrade-database.mjs`：手动升级历史 SQLite。
- `import-legacy.mjs`：预览或导入旧 YAML／Redis 数据。
- `tests/`、`fixtures/`：历史库升级、导入与旧响应契约测试。
- `review/`：本地原始文件与回退资料，已忽略。

## 当前范围

账号和凭据保存在云崽配置指定的原 SQLite 数据库。`MysUsers`、`Users`、`UserGames` 模型由 mhy-plugin 管理，原神原导入路径继续有效。手动运行本目录的 `upgrade-database.mjs` 为 `MysUsers` 补充 `stoken`、`mid`、`login_device`、`bound_device`；SQLite 升级前通过 `VACUUM INTO` 保存一致性备份，文件名为原库路径加 `.before-mhy-时间戳.sqlite`。

首批接管扫码、设备、体力、账号概览／探索和米游社面板请求。原神、喵喵及 ZZZ 的业务转换、角色计算、面板存储和渲染继续使用原实现。未迁移操作保持原路径。

新扫码保存在 SQLite；逍遥原有签到与社区任务继续读取其原 YAML。首次登录的新账号用于这些旧任务时，仍需按逍遥原有流程配置。

## 构建与上线

1. 同步 mhy-plugin、原神、喵喵、ZZZ、逍遥的本次源码改动。
2. 在 mhy-plugin 中运行 `node node_modules/typescript/lib/tsc.js`，公共入口为 `api.js`，实现及声明位于 `dist`。
3. 按 ZZZ 原构建流程生成 `dist`。本次本地已生成并整理运行产物；该插件既有类型检查问题见下文。
4. 停止机器人后，先执行下面的旧库升级命令，再按需导入历史数据。全新数据库由主插件直接按最新结构创建。
5. 启动机器人。正常启动沿用云崽 `cfg.db`，按最新模型创建缺失的表，保持已有表结构原样；`MHY_DATABASE_PATH` 仅供临时库测试或离线迁移使用。
6. 发送 `#扫码登录`，使用米游社 App 扫码确认；可用 `#取消扫码登录` 取消。同一用户再次发起将替换旧会话，最长等待五分钟。

代码依赖已有 Sequelize、SQLite、YAML、Redis、QRCode 及 Node 能力，本次没有安装新依赖。此任务尚未对生产数据库执行升级或导入，也没有重启机器人或发起真实账号扫码。

## 手动升级旧库

```powershell
node migration/upgrade-database.mjs --database '实际SQLite绝对路径'
```

该命令显式备份旧 SQLite 并补充四个凭据／设备字段，可重复运行。主插件启动路径只包含当前模型初始化，旧库需要先运行上述命令。主插件运行时不导入本目录模块。

## 独立历史数据导入

默认模式仅预览；读取来源 YAML 和 Redis，保持来源原样。请在机器人停止时执行正式导入，随后重启以重新加载所有缓存。

```powershell
node migration/import-legacy.mjs --database '实际SQLite绝对路径'
node migration/import-legacy.mjs --database '实际SQLite绝对路径' --apply
```

逍遥 YAML 默认目录是相邻插件的 `data/yaml`，可通过 `--stokens '目录'` 指定。读取设备记录时，预先在进程环境设置 `MHY_IMPORT_REDIS_URL`。该脚本仅使用 Redis 的 SCAN 和 GET。

当同账号的设备来源冲突时，可明确选择一个来源：

```powershell
node migration/import-legacy.mjs --database '实际SQLite绝对路径' --device-source '米游社账号ID=miao'
node migration/import-legacy.mjs --database '实际SQLite绝对路径' --device-source '米游社账号ID=zzz' --apply
```

导入规则：

- 按米游社账号归并；目标需已有该账号的 CK 记录。
- SToken 必须具备 MID。缺失字段及无法识别的数据列入报告。
- 从用户 YAML 文件名恢复 QQ 关联；数字 QQ 可创建新用户关系。
- 相同记录重复导入显示 `unchanged`。
- 目标已有不同凭据或设备时显示 `conflict` 并跳过；显式来源选择仅解决来源间设备冲突。
- ZZZ 安卓设备缺少原 ID 时使用确定性 ID，导入后重新取得指纹；手动指纹缺少设备 ID 时跳过。
- 正式导入前再次校验目标字段，避免覆盖导入期间发生的变化。
- 报告只含账号、来源、状态与字段名。

## 接口清单

| 原入口／操作 | 本插件实现 | 参数依据 | 返回依据 | 当前验证 |
| --- | --- | --- | --- | --- |
| App 扫码、SToken 兑换 | `mihoyo-qr-login` | `main2.ts` 实测链路 | `main2.ts` | 模拟闭环通过，真实待测 |
| 账号角色列表 | `getGameRoles`、扫码角色同步 | Demo／已有接口 | 原神 `getGameRole` | 模拟通过，真实待测 |
| 原神 `index`、`dailyNote` | `request` | SDK `game-genshin.tsp` | 原神原响应 | 模拟通过，真实待测 |
| 原神 `character`、`characterDetail` | `request` | SDK `game-genshin.tsp` | 现有列表及 `genshin-character-detail.ts` | 原始响应边界对照通过 |
| 星铁 `index`、`dailyNote`、`character`、`avatarInfo`、`basicInfo` | `request` | SDK 和原端点 | 原神／喵喵现有响应 | 模拟通过，真实待测 |
| ZZZ `zzzNote`、`zzzIndex`、`zzzAvatarList`、`zzzAvatarInfo`、`zzzBuddyList` | `request` | SDK `game-records-cn.tsp` | ZZZ 原响应及原 `getFinalData` 解包 | 模拟通过，真实待测 |
| ZZZ `zzzExplorationDetail` | `request` | SDK 的 `uid`、`region` 参数 | ZZZ 原响应 | 模拟通过，真实待测 |
| 三游戏 `getFp`、设备绑定／解绑 | `devices` | 现有安卓／手动设备请求 | 现有指纹字段 | 并发测试通过 |
| ZZZ `deviceLogin`、`saveDevice` | `registerDeviceSession` | 原 ZZZ 设备登记请求 | 仅检查状态，不进入面板处理 | 真实待测 |

完整米哈游响应原样透传。原神兼容入口保留 `api` 字段；ZZZ 保留原有 `checkCode` 与 `.data` 解包。所有迁入网络请求经过 `lib/fetch`；DS 使用实际发送的查询串和请求体。国际服保留对应旧调用方的域名选择。

## 验证记录

运行：

```powershell
node node_modules/typescript/lib/tsc.js
node --test tests/*.test.mjs migration/tests/*.test.mjs
```

离线测试覆盖增量升级及备份、事务保存、旧模型首次保存、共享账号解绑、设备归属与并发刷新、取消与失败扫码、三游戏请求参数和签名、国际服及验证码透传、原始响应边界一致、导入幂等与来源保持原样。

面板后处理文件未改动。原始响应对照使用同一模拟响应，经过原神旧请求实现及新兼容入口进行深度比较；真实角色计算与图片输出仍需机器人实测验收。

ZZZ 在已有 TypeScript 5.9.3 下，重构前后均有三条相同诊断：`apps/guide.ts:98`、`apps/manage/panel.ts:152`、`:196` 调用 `makeForwardMsg` 缺少第三参数。TypeScript 7 下则在原有 `model/damage/avatar.ts` 报两条类型诊断。本次保留这些范围外代码。

本插件全量 lint 还会报告既有 `src/types/yunzai.d.ts` 中的 `any`。本次新增、修改且纳入 lint 的文件检查通过。`src/lib` 沿用项目原有的 lint 排除配置。

## 回退

- 各插件原始文件保存在本地 `migration/review/original`，与本次数据库备份分开。
- 代码回退需同步恢复相邻插件的接入文件，再恢复 ZZZ 对应编译产物；恢复过程中保持机器人停止。
- 新增列兼容旧 ORM，通常可以保留已升级数据库并恢复旧代码。若需要恢复升级前数据，先另存当前库，再恢复 `.before-mhy-*.sqlite` 备份。
- 独立导入保持逍遥 YAML、喵喵和 ZZZ 原 Redis 数据原样，旧代码可继续读取。
- 避免在导入后让旧数据自动反向覆盖新 SQLite 凭据；旧数据导入始终显式执行。

数据库迁移方式参考 [Sequelize Query Interface](https://sequelize.org/docs/v6/other-topics/query-interface/) 和 [事务文档](https://sequelize.org/docs/v6/other-topics/transactions/)。
