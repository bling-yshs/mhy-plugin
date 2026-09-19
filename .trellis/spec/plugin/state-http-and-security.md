# 状态、HTTP 与安全

## 状态分类

正式插件应明确区分：

| 状态 | 示例 | 生命周期 |
| --- | --- | --- |
| 用户绑定 | Yunzai 用户 ID、米游社账号 ID、原神 UID、region | 长期 |
| 登录凭据 | SToken、Token 名称/版本、Cookie Token、mid | 长期并可刷新 |
| 设备身份 | device_id、device_fp、设备配置 | 按账号或会话策略持久化 |
| QR 会话 | ticket、状态、创建时间、过期时间 | 短期 |
| 调试历史 | 请求、响应、Set-Cookie、错误和耗时 | 本地诊断、可清理 |

`src/main.ts`、`src/main2.ts` 和 `src/lib/mihoyo-qr-login.ts` 当前使用 `.mys-*.json` 文件，这是原型状态。正式存储方案需要结合 Yunzai Redis、配置和用户绑定模型单独设计，迁移时保留版本与兼容策略。

`src/main2.ts` 写入的 `.mys-app-state.json` 当前未列入 `.gitignore`，其中可能包含 SToken 与 Cookie Token。运行该研究入口前应先补齐忽略或改用安全的临时存储，并在运行后检查 `git status`。

## HTTP 统一入口

`src/http.ts` 的 `httpJson` 当前负责：

- 接收 URL、method、Header、结构化 body 和历史 key。
- 发送 `fetch`。
- 读取原始响应文本并尝试 JSON 解析。
- 解析 Set-Cookie 为对象数组，同时把原始行返回给业务层。
- 写入成功或失败的结构化历史。

新增米哈游请求应走该统一入口或经评审后的替代实现。业务模块负责请求语义与返回类型，HTTP 层不解释具体 Token。

## 历史记录契约

`.mys-http-history/<UTC+8 日期>/` 下的 JSON 使用固定宽度时间和 UUID 命名，字符串排序可还原请求顺序。记录包含：

- `at`：UTC+8 ISO 形式。
- `durationMs`。
- `req.method`、完整 URL、应用层 Header 和结构化 body。
- `resp.status`、`statusText`、解析后的 body 与结构化 `setCookie`。
- 失败时的 `error.name` 与 `error.message`。

历史文件不记录 `resp.url`、全部响应 Header 或原始 Set-Cookie 字符串。修改契约时同步更新类型、清理工具和本规范。

## 敏感数据处理

- `.mys-state.json`、`.mys-device.json`、`.mys-http-history/` 与 `data/` 已在 `.gitignore` 中。
- `.mys-app-state.json` 是当前已知的忽略规则缺口。
- 新增状态文件、缓存目录或导出文件时同步检查 `.gitignore`。
- 普通 logger、异常文本和用户回复只输出必要标识，隐藏完整 Token 与 Cookie。
- HTTP 历史用于本地逆向，可能保留敏感请求内容；查看、复制和上传前需要人工脱敏。
- 二维码 URL 与 ticket 视为短期敏感数据，过期后按清理策略删除。

## Cookie 管理

当前 Web QR 样本 `src/main.ts` 只按名称合并 Cookie，缺少 domain/path/secure/expiry 语义。实现通用 Cookie Jar 时需要覆盖：

- host-only 与 Domain Cookie。
- Path 匹配。
- Secure 限制。
- Expires 与 Max-Age。
- 删除 Cookie 的空值或过期更新。
- 同名 Cookie 在不同域和路径下并存。

Cookie Jar 必须以目标 URL 计算发送集合，禁止把所有 Cookie 拼成全局 Header。

## 错误与恢复

- QR 过期、用户取消、网络失败和接口业务失败分别处理。
- 持久化写入失败不得报告登录成功。
- Token 兑换失败保留仍有效的 SToken，供重试与诊断。
- 读取旧状态时按版本迁移；损坏或未知版本应给出明确错误。
- 自动重试需要限制次数和间隔，扫码轮询遵守状态与过期时间。
