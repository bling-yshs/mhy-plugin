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

### SToken 命令

- `src/apps/stoken.ts` 注册 `#刷新ck` 和 `#更新抽卡记录`（含 `#原神更新抽卡记录`），服务位于 `src/lib/stoken.ts`。
- 刷新 CK 遍历主用户绑定账号：调用 Passport `getLTokenBySToken` 获取独立 LToken，再沿用现有 Takumi `getCookieAccountInfoBySToken` 兑换 Cookie Token。全部兑换成功后仅更新 `ck`，通过账号事件同步兼容缓存；事务内检查绑定和凭据快照，避免覆盖并发扫码或解绑。
- 抽卡命令使用当前已绑定的国服原神 UID，通过 `genAuthKey` 兑换 authkey，再调用 genshin `GachaLog.logUrl()`。其他游戏与国际服未纳入本次命令范围。
- 所有 DS1、DS2 签名统一调用 `src/lib/sign.ts` 的 `createSignDs(salt)`、`createDs(query, body, salt)`；业务模块只传入端点所需参数，禁止重复实现时间戳、随机串和签名计算。`createSignDs` 默认盐供游戏签到使用，`genAuthKey` 传入该端点的盐。
- 外部插件和本地 SDK 仅提供端点、字段和认证参数参考，实现复用本插件的公共方法。LToken Cookie 请求参考本地 SDK `src/passport.tsp`。新增命令尚未执行真实账号在线验证。
- CK 刷新冷却 60 秒、抽卡更新冷却 300 秒，同时限制进程内重复执行。authkey 仅在内部导入事件中传递，导入异常回复使用固定消息，避免异常 URL 暴露凭据。

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
