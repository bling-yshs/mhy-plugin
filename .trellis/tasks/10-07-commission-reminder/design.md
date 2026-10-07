# 设计

新增 CommissionReminderSettings 表，以 user_id 为主键，保存 bot_id、group_id、enabled、last_check_date 和时间戳。user_id 对应命令发送者，用于 SQLite 绑定查找及群内 @。重新开启更新接收位置并保留当天日期；任意群关闭仅停用本人订阅。

命令层处理群开关和回复；服务层处理持久化、当前 UID 精确归属、执行防重、dailyNote 和群发送。提醒 cron 为 0 0 23 * * *；签到 cron 为 0 2 0 * * *。复用 signClock() 获取当日日期，以及 request('dailyNote', ...) 的完整响应，直接调用每天一次的任务函数。

开启时验证当前角色与 CK。执行时直接按发送者从 SQLite 重读 Users.games.gs.uid，精确匹配本人关联账号。发送前重查开关、接收位置、更新时间、UID 和归属。提醒路径仅查询当前启用角色。

事务写入 last_check_date 后发起网络请求，防止并发及重启重复执行。当天异常静默记日志，无自动重试。逐一处理订阅控制峰值。

当前 TRSS 使用 Bot.sendGroupMsg 指定保存的机器人与群。新增表通过 sync 创建，保持既有历史表原样。

## 改动文件

- src/db/index.ts：新增订阅表。
- src/apps/commission-reminder.ts：群开关命令及定时入口。
- src/apps/check-in.ts：签到改为每日直接调度。
- src/lib/commission-reminder.ts：订阅、查询、发送。
- src/types/yunzai.d.ts：声明既有 TRSS 发送能力。
- tests/commission-reminder.test.mjs：离线回归。
- docs/commission-reminder.md 与相关规范：使用和执行契约。

回退时删除新增命令产物可停止提醒，新表可保留。验证不调用真实米游社与群消息接口。
