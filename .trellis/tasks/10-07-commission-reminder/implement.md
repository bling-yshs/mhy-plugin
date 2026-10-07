# 实施

1. 新增订阅模型和宿主类型。
2. 实现当前 UID 精确匹配、开关和每日执行。
3. 注册群命令及23点每日调度，签到改为00:02每日直接触发。
4. 新增临时数据库、mock fetch 和群消息测试。
5. 更新使用说明和规范。
6. pnpm type-check、pnpm lint:check、pnpm format:check、pnpm build、pnpm test。
7. 审查改动和编译入口，保留用户已有改动。

部署后重启机器人并在目标群开启；实际账号与群投递由用户运行环境验收。
