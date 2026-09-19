# 复用与边界思考指南

## 搜索入口

实现前至少检查这些现有所有者：

- `src/http.ts`：HTTP 发送、响应解析、Set-Cookie 解析和调试历史。
- `src/lib/`：可被命令入口复用的插件业务服务。
- `src/types/`：跨模块的协议类型与 Yunzai 宿主声明。
- `src/main.ts`、`src/main2.ts`：逆向研究样本，只用于提取已验证行为。

推荐搜索：

```powershell
rg -n "createQRLogin|queryQRLoginStatus|cookie_token|character/detail" src
rg -n "httpJson|DS|x-rpc-|Set-Cookie" src
```

## 何时复用

- 所有米哈游 HTTP 调用统一通过 `httpJson` 或其后续明确替代实现。
- 同一协议响应被多个模块消费时，将类型和解析逻辑放入 `src/types/` 或协议所有者模块。
- Header、DS、Cookie 组装出现第二个消费者时，评估提取到对应认证/API 服务。
- Yunzai 命令类只负责命令边界、消息交互和调用服务。

## 何时保持内联

- 逻辑只有一个调用点且业务含义清晰。
- 提取后只形成单行转发函数。
- 抽象需要预留尚未出现的扩展点。

项目级要求是最小改动和有限抽象。新增 helper 前说明当前复用点或可读性收益。

## 常见风险

- 从 `src/main.ts` 与 `src/main2.ts` 复制两套相似的 `ApiResponse`、DS、状态文件逻辑，随后分别演化。
- 在命令类里重复解析 `tokens`、`user_info` 或 `Set-Cookie`。
- 将 App QR 的 SToken、LToken、Cookie Token 合并成一个无类型的字符串字段。
- 为每个端点创建只有一次调用价值的 wrapper，导致请求契约分散。
