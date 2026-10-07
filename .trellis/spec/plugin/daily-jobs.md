# 每日任务与委托提醒

## 1. 适用范围

当前机器人进程使用北京时间。签到与原神委托提醒通过云崽调度器每日直接触发。用户已确认提醒数据直接读取 SQLite，每人只保留最后开启的接收群。

## 2. 命令、服务与表

- `#开启原神委托提醒`：验证当前角色和本人 CK，保存／替换发送者的唯一接收位置。
- `#关闭原神委托提醒`：在任意群停用本人订阅。
- `setCommissionReminder(target: { botId: string; groupId: string; userId: string }, enabled: boolean): Promise<void>`。
- `runCommissionReminders(): Promise<void>`：处理当日开启订阅。
- `CommissionReminderSettings`：`user_id TEXT PRIMARY KEY`；`bot_id`、`group_id` 为非空 TEXT，`enabled BOOLEAN` 默认 false，`last_check_date TEXT` 默认空串；保留 `created_at`、`updated_at`。
- 新表通过模型 `sync()` 创建。主插件保持既有表结构原样。

## 3. 执行契约

- 签到 `cron: '0 2 0 * * *'`，执行函数 `runAutoSign`；提醒 `cron: '0 0 23 * * *'`，执行函数 `runCommissionReminders`。
- `signClock().date` 用于北京时间当天记录。调度直接每天执行一次，无启动补跑。
- 从 `Users.id = user_id` 获取 `games.gs.uid`，精确匹配关联账号的 `uids.gs` 和 CK；提醒直接查询 SQLite 中发送者的绑定。
- 使用 `request('dailyNote', { game: 'gs', uid, accountId }, {})` 获取实时完整响应。只有 `retcode === 0` 且 `data.is_extra_task_reward_received === false` 才发送。
- 群消息为 `segment.at(user_id)` 加含当前 UID 的领奖提示，经 `Bot.sendGroupMsg(bot_id, group_id, message)` 投递。
- 请求前通过串行 SQLite 事务保存 `last_check_date`。失败也计入当天检查，重新开启或换群保留当日记录。
- 发送前核对启用状态、接收位置、更新时间、当前 UID 及归属；跨日结果跳过。进程内运行标志防止同轮并发。

## 4. 校验与错误矩阵

| 情况 | 行为 |
| --- | --- |
| 私聊发送开关 | 提示在接收群操作 |
| 开启时当前 UID／本人 CK 缺失 | 提示绑定，保持原订阅 |
| false，委托尚未做满 | 在最后接收群 @ 本人 |
| true | 静默 |
| retcode 异常、字段缺失／非布尔、网络／发送失败 | 记录警告，当天跳过；继续其它用户 |
| 执行时绑定失效 | 记日志，当天跳过；保留订阅 |
| 在途关闭／换群／切换 UID／解绑 | 丢弃旧结果 |
| 当天重复执行 | 跳过查询和发送 |

## 5. 场景

- 正常：用户在群 A 开启，随后在群 B 开启，23:00 在 B 提醒当前 UID。
- 基础：奖励已领取，群内静默，记录当天已检查。
- 异常：CK 失效导致 retcode 非零，该用户当天停止，下一用户继续。

## 6. 验证

`tests/commission-reminder.test.mjs` 断言两项 cron 及直接执行函数、用户主键、最后群替换、任意群关闭、重启读取、严格领取状态、精确当前 UID、失败隔离、当日防重、次日位置和在途变更。Redis 模拟入口一旦被访问即失败。使用临时 SQLite、mock fetch 和模拟群发送。

验证顺序：`pnpm check`、`pnpm build`、`pnpm test`；构建后由 `index.js` 发现 `dist/apps/commission-reminder.js`。

## 7. 易错实现与正确实现

易错：订阅以机器人、群、用户为联合主键，使同一用户在多个群同时提醒。

正确：以 `user_id` 为主键，开启时更新同一行的 `bot_id` 和 `group_id`。

易错：取绑定账号的首个角色，会提醒其它 UID。

正确：先读取 `Users.games.gs.uid`，精确匹配本人关联账号；缺失时按错误矩阵处理。
