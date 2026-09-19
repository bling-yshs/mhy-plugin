# 项目背景

## 项目定位

`mhy-plugin` 是运行在 Yunzai / TRSS-Yunzai 生态中的 TypeScript 插件，核心领域包括：

- 米游社账号扫码登录。
- SToken、Cookie Token、Cookie 与设备标识的生命周期管理。
- 米游社账号绑定的原神 UID 查询。
- 原神角色列表与角色详情查询。
- 后续可扩展签到、体力、深渊等米游社能力。
- 统一 HTTP 调用与可审计的调试历史。

目标架构应保持相对独立，同时在命令注册、事件对象、消息回复、Redis/配置和用户绑定处兼容 Yunzai V3 与 TRSS-Yunzai。

## 当前阶段

仓库处于研究代码向正式插件迁移的早期阶段：

- `index.js` 已实现从 `dist/apps/` 动态加载插件命令。
- `src/apps/qr-login.ts` 已注册 `#扫码登录` 命令。
- `src/lib/mihoyo-qr-login.ts` 当前只创建 Web QR 并把二维码写到 `data/qrcode/`。
- `src/http.ts` 是统一 HTTP 与调试历史的原型。
- `src/main.ts` 保存 Web QR、设备指纹和角色接口研究代码。
- `src/main2.ts` 保存 App QR、SToken 兑换 Cookie Token 和绑定角色查询研究代码。
- `src/types/genshin-character-detail.ts` 保存角色详情响应的强类型研究成果。

后续功能应进入 `src/apps/`、`src/lib/` 和 `src/types/`。`src/main.ts`、`src/main2.ts` 属于迁移来源与协议样本，不承担正式插件入口职责。

## 已确定方向

- 正式登录流程优先采用 Passport App QR。
- SToken 作为可用于重新兑换 Cookie Token 的上游凭据单独管理。
- 角色详情遵循 `character/list -> 全部 character_ids -> character/detail` 的稳定调用方式。
- HTTP 调用集中封装，保留离线排查协议变化所需的结构化历史。
- 协议类型根据真实响应持续补全，尤其是 App QR 的 `tokens` 与 `user_info`。

## 参考项目

这些项目提供协议与生态证据，当前仓库未把它们声明为运行时依赖：

- `ctrlcvs/xiaoyao-cvs-plugin`：App QR 登录、SToken 兑换与 CK 绑定参考；研究基线为提交 `e7ab3e8`。
- `miao-plugin`：原神角色列表与详情的稳定调用顺序参考。
- Yunzai `genshin` 基础插件：CK、UID、用户关联和宿主持久化参考。
- `UIGF-org/mihoyo-api-sdk`：接口定义与类型设计参考，App QR 成功响应仍需基于实测补强。

引用参考实现时，应同时记录文件、提交或版本。观察到的实现行为需要与协议事实分开描述。

## 范围边界

- 本项目是正式插件，Demo 的命令行交互、终端二维码和单文件状态模型不直接扩散到插件 API。
- 真实登录、扫码和账号数据请求属于人工集成验证，需要用户明确参与。
- Token、Cookie、UID、设备指纹和 HTTP 历史属于敏感本地数据。
- SDK 化可以作为后续模块边界演进方向，当前改动以插件所需的最小稳定能力为准。
