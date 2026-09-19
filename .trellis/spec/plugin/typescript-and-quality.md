# TypeScript 与质量

## 编译与模块

项目使用严格 TypeScript、Node.js ESM 与 `nodenext`：

- `src/` 为源码根目录，`dist/` 为构建输出。
- 相对运行时 import 使用显式扩展名；现有主要代码使用 `.js` specifier，例如 `src/main2.ts` 引用 `./http.js`。
- `tsconfig.json` 启用了 `rewriteRelativeImportExtensions`，`src/apps/qr-login.ts` 中的 `.ts` specifier 会被编译重写。新代码优先沿用 `.js` specifier，统一现有差异应作为独立机械修改验证。
- 类型 import 使用 `import type`，例如 `src/main.ts` 引用角色详情类型。
- 禁止新增无扩展名的相对 import。

## 类型边界

- `strict` 始终开启。
- 禁止显式 `any`；`.oxlintrc.jsonc` 也限制 `unknown`。新增代码应定义明确的协议结构、联合类型和泛型边界。
- 米游社通用响应沿用 `retcode`、`message`、`data` 结构，并在业务层检查 `retcode`。
- 外部响应类型描述已验证字段；可选字段表示真实可缺失情况。
- 跨模块或体量较大的协议类型放入 `src/types/`。
- Yunzai 宿主全局声明集中在 `src/types/yunzai.d.ts`。
- 保留 API 原始 snake_case；内部领域模型可在明确映射边界后使用 camelCase。

仓库现有研究文件仍包含 `unknown`，属于当前 lint 基线的一部分。修改相关区域时优先收窄为真实协议类型，避免扩大基线。

## 函数与注释

- 新增或修改的每个函数、方法和类构造逻辑都应有标准 JSDoc，包含说明、参数和返回值；无参数或无返回值时遵循 TypeScript/JSDoc 的常用省略规则。
- 注释独占一行并位于目标代码之前。
- 保持逻辑内联，提取函数需要复用价值、显著可读性收益或明确业务边界。
- 禁止创建只调用另一个函数的转发 wrapper。
- 公共服务函数命名体现业务动作，例如 QR 创建、Token 兑换、绑定角色查询。

## 格式与静态检查

项目使用 Oxfmt 和 Oxlint：

- 单引号。
- 无分号。
- 禁止显式 `any`。
- `.trellis/**` 与 Markdown 不参与 Oxfmt/Oxlint。
- `src/lib/**` 当前在 formatter/linter ignore 中；修改该配置需要说明覆盖范围变化。

验证命令：

```powershell
pnpm type-check
pnpm lint:check
pnpm format:check
pnpm build
```

`pnpm check` 汇总类型、lint 和格式检查。仓库当前没有 `test` 脚本，网络集成验证不得作为默认质量门槛。

## 当前质量基线

2026-09-19 初始化规范时的离线检查结果：

- `pnpm type-check` 通过。
- `pnpm lint:check` 因 `src/http.ts`、`src/main.ts` 和 `src/main2.ts` 中既有的 `unknown` 触发 `typescript/no-restricted-types`。
- `pnpm format:check` 报告 `index.js`、`src/http.ts`、`src/main.ts` 和 `src/main2.ts` 存在既有格式差异。

后续任务应区分本次引入的问题与上述基线。修复基线时同步更新本节。

## 依赖与修改范围

- 新增依赖前取得用户许可。
- 优先使用 Node.js 标准库和现有依赖。
- 保持最小改动，避免顺手重构研究代码或无关模块。
- 改动协议常量、端点、Header、salt、App 版本或 Token 字段前，用 `rg` 搜索所有引用。
- 修改 JSON 时使用 `jq` 检查，查看文本使用 `bat`，查找文件使用 `fd`，全局文本搜索使用 `rg`。

## 离线验证与在线验证

默认质量检查只执行离线构建和静态分析。以下操作需要人工参与并明确数据风险：

- 生成可扫描二维码。
- 轮询真实登录状态。
- 兑换真实 Cookie Token。
- 查询账号、UID 或角色数据。

在线验证完成后检查 git 状态，确保凭据、二维码、设备文件和 HTTP 历史均未进入版本控制。
