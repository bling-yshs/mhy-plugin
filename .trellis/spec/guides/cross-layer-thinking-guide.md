# 跨层数据流思考指南

## 核心数据流

插件功能通常跨越以下边界：

```text
Yunzai 消息事件
  -> src/apps 命令类
  -> src/lib 认证或游戏数据服务
  -> src/http.ts
  -> 米哈游接口
  -> 协议响应解析
  -> Token/账号状态持久化
  -> 用户回复与日志
```

设计功能时逐层写清输入、输出、错误和敏感数据范围。

## 认证链检查

App QR 登录涉及多个含义不同的凭据：

```text
QR ticket
  -> Confirmed 响应中的 SToken 与 user_info
  -> SToken 兑换 Cookie Token
  -> Cookie Token 查询绑定游戏账号
```

检查事项：

- QR 状态 `Created`、`Scanned`、`Confirmed`、过期和取消均有明确处理。
- `tokens` 的选择策略与原始名称一起保存，避免丢失 `stoken` / `stoken_v2` 区别。
- `account_id`、`mid`、游戏 UID 和 Yunzai 用户 ID 保持独立字段。
- Cookie 发送范围考虑 host、domain、path、secure 和有效期。
- 上游 `retcode`、HTTP 状态、网络异常分别保留可诊断信息。

## 角色数据链检查

```text
账号凭据
  -> getUserGameRolesByCookie
  -> 原神 UID 与 region
  -> character/list
  -> 全部 character_ids
  -> character/detail
```

- `role_id` 与 `server` 来自同一绑定角色记录。
- 当前研究结论是详情请求一次传入列表返回的全部角色 ID。
- 分批策略需要真实接口限制或可靠运行证据支撑。
- API snake_case 类型在协议边界保留，展示层再做转换。

## 可观测性与敏感数据

`src/http.ts` 在调试模式开启时会把请求和响应写入 `.mys-http-history/`。这类文件可能包含 Cookie、Token、UID 和设备标识：

- 保持在 `.gitignore` 中。
- 用户消息和普通运行日志不得输出完整凭据。
- 调试历史的字段变化同步更新相关类型和文档。
- 引入自动 Cookie Jar 时验证 host-only Cookie 不会跨主机发送。
