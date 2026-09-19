# 架构与目录

## 运行入口

根目录 `index.js` 是 Yunzai 加载入口：

1. 读取 `dist/apps/` 中的 `.js` 文件。
2. 并发导入各命令模块。
3. 从模块导出中选择插件类，写入 `apps` 对象。
4. 单个模块加载失败时记录错误，其余模块继续加载。

新增命令文件时必须确保 `pnpm build` 产出对应的 `dist/apps/<name>.js`。当前加载器选择模块导出中的第一个函数值，命令模块宜只导出插件类，避免无关函数导出造成加载歧义。

## 目录职责

```text
index.js                 Yunzai 发布入口与 dist/apps 动态加载器
src/apps/                命令注册、权限、消息交互、调用业务服务
src/lib/                 登录、账号、Token 和游戏数据业务服务
src/types/               跨模块协议类型与 Yunzai 宿主声明
src/http.ts              HTTP、响应读取、Set-Cookie 解析、调试历史
src/main.ts              Web QR 与原神数据研究样本
src/main2.ts             App QR 与 Token 兑换研究样本
scripts/                 本地维护脚本
migration/               独立历史迁移工具、文档、测试及本地回退资料
data/                    运行期生成数据，已忽略
dist/                    TypeScript 构建产物，已忽略
```

## 命令层

`src/apps/qr-login.ts` 展示当前命令约定：

- 类继承 Yunzai 全局 `plugin`。
- 构造函数通过 `name`、`dsc`、`event`、`priority`、`rule` 注册命令。
- rule 的 `fnc` 与实例方法名一致。
- 命令方法捕获面向用户的失败，使用 `logger` 记录上下文，通过 `this.reply` 返回简洁消息。
- 命令层调用 `src/lib/` 服务，不承载 DS、Token 解析或持久化细节。

Yunzai 全局类型目前由 `src/types/yunzai.d.ts` 提供。使用新的 event 字段或宿主全局对象时，先扩展该声明，再在命令中消费。

## 服务与基础设施

- `src/lib/` 拥有可复用的业务流程，例如 QR 创建、轮询、Token 兑换和账号查询。
- `src/http.ts` 拥有网络发送和调试记录。业务服务负责端点、Header、请求体、业务 `retcode` 与响应类型。
- `src/types/` 放置跨文件使用或规模较大的协议结构。只被单个服务使用的小类型可与服务共置。
- 状态存储应通过明确的仓储边界与业务服务交互，避免命令类直接操作状态文件或 Redis key。

保持有限抽象：只有明确复用、显著可读性收益或业务边界时才提取函数与模块。

## 错误边界

- `index.js` 使用 `Promise.allSettled` 隔离模块加载失败。
- 米哈游 HTTP 成功响应仍需检查 `retcode`，当前样本通过 `assertApiSuccess` 处理。
- 命令层把内部异常转换为用户可理解的回复，并把诊断信息写入 logger。
- 网络错误、HTTP 状态错误、JSON 解析结果和业务 `retcode` 应保持可区分。

## 兼容性

仓库当前只声明最小 Yunzai ambient 类型，尚无完整的 V3/TRSS 兼容适配层。涉及 event、Redis、配置或消息段时，应先检查两个宿主的实际接口，再确定兼容边界。宿主兼容结论应写入任务研究或本规范。
