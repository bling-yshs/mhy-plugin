# 米哈游认证与数据协议

## App QR 主链路

正式插件优先采用以下流程：

```text
POST passport-api.mihoyo.com/account/ma-cn-passport/app/createQRLogin
  -> ticket + QR URL
POST passport-api.mihoyo.com/account/ma-cn-passport/app/queryQRLoginStatus
  -> Created / Scanned / Confirmed
Confirmed
  -> data.tokens + data.user_info
  -> SToken + accountId + mid
GET api-takumi.mihoyo.com/auth/api/getCookieAccountInfoBySToken
  -> cookie_token
GET api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=hk4e_cn
  -> 绑定的原神 UID 与 region
```

`src/main2.ts` 是当前链路的本地研究样本。正式实现迁移到 `src/lib/` 时保留已验证的状态和错误语义。

## QR 成功响应

确认状态下按以下规则提取：

- 账号 ID：`user_info.aid || user_info.uid || user_info.account_id`。
- mid：`user_info.mid`。
- Token：优先选择 `name` 为 `stoken` 或 `stoken_v2` 的条目，当前参考实现最后回退到首个 Token。
- 保存 Token 时同时保存原始 `name`/类型，业务模型中区分 `stoken` 与 `stoken_v2`。

`tokens` 与 `user_info` 的完整字段仍需通过真实响应补全。类型中可以保留协议尚未确认的字段扩展空间，消费代码只读取已验证字段。

## 凭据语义

- App QR 的确认响应提供 SToken；Cookie Token 由 `getCookieAccountInfoBySToken` 兑换得到。
- SToken 与 Cookie Token 分开保存，并记录更新时间和兑换所需的账号字段。
- Cookie Token 失效时优先尝试使用有效 SToken 重新兑换。
- LToken 与 SToken 维持不同领域字段。参考实现把 SToken 放入 `ltoken` Cookie 的行为属于兼容观察，协议依据仍需验证。
- `cookie_token` 与 `cookie_token_v2`、`stoken` 与 `stoken_v2` 均保持明确版本信息。

## Passport 请求

`src/main2.ts` 与 `xiaoyao-cvs-plugin` 研究表明 App QR 请求包含 `x-rpc-device_id`、`x-rpc-app_id`、设备信息、应用版本、客户端类型、DS、SDK 版本和 User-Agent 等 Header。

Header 与 DS 生成属于协议实现，应集中在认证服务中。修改 salt、App 版本、客户端类型或 Header 集合前，记录来源和验证方式。

## Cookie 边界

App QR 创建响应中观察到的 `aliyungf_tc` 没有 Domain 属性时属于 `passport-api.mihoyo.com` 的 host-only Cookie。自动 Cookie Jar 应按 host/domain/path/secure/expiry 匹配，禁止把该 Cookie 全局发送给 `api-takumi.mihoyo.com`。

当前 `src/http.ts` 解析并记录 Set-Cookie，尚未实现自动 Cookie Jar。

## 原神角色数据

绑定账号查询后，使用同一条 `GameRole` 的 `game_uid` 与 `region` 调用：

```text
POST api-takumi-record.mihoyo.com/game_record/app/genshin/api/character/list
POST api-takumi-record.mihoyo.com/game_record/app/genshin/api/character/detail
```

稳定参考流程：

1. `character/list` 获取完整角色列表。
2. 收集所有有效角色 ID。
3. 单次 `character/detail` 传入全部 `character_ids`。

当前 `src/main.ts` 只查询首个角色，属于研究样本的局部行为。正式插件实现应遵循上面的完整列表流程。引入分批策略前需要真实限制证据。

角色详情响应类型位于 `src/types/genshin-character-detail.ts`，字段名保持米游社协议的 snake_case。
