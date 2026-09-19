# mhy-plugin 开发规范

本目录描述当前 Yunzai / TRSS-Yunzai 插件的项目背景、运行边界和编码约定。

## 规范索引

| 文档 | 内容 |
| --- | --- |
| [项目背景](./project-context.md) | 插件目标、当前阶段、参考项目与范围 |
| [架构与目录](./architecture.md) | 加载入口、命令层、服务层、基础设施和类型边界 |
| [米哈游认证与数据协议](./mihoyo-api-and-auth.md) | App QR、Token 兑换、账号与角色数据链路 |
| [状态、HTTP 与安全](./state-http-and-security.md) | 凭据持久化、Cookie、HTTP 历史和错误处理 |
| [TypeScript 与质量](./typescript-and-quality.md) | ESM、类型、注释、依赖和验证命令 |

## 开发前检查

- [ ] 阅读与任务相关的规范文档及 `AGENTS.md`。
- [ ] 用 `rg` 搜索现有端点、类型、Header、状态字段和命令注册方式。
- [ ] 确认改动属于正式插件路径，研究 Demo 仅作为证据来源。
- [ ] 标注外部协议结论的证据级别：真实响应、稳定参考实现或待验证假设。
- [ ] 涉及凭据时画出 SToken、Cookie Token、LToken、账号 ID、mid 与游戏 UID 的流转。
- [ ] 新增依赖前取得用户许可。

## 质量检查

- [ ] `pnpm type-check` 通过。
- [ ] `pnpm lint:check` 通过，或已记录与本次改动无关的基线问题。
- [ ] `pnpm format:check` 通过，或已记录与本次改动无关的基线问题。
- [ ] `pnpm build` 通过，并确认 `index.js` 能加载预期的 `dist/apps/*.js`。
- [ ] 默认验证未发起真实扫码、登录或米哈游数据请求。
- [ ] `.mys-*`、`data/`、HTTP 历史和其他敏感运行产物保持未跟踪。
- [ ] 新增或修改的函数具有标准 JSDoc，注释均为行前注释。

项目目前没有自动化测试脚本。新增关键解析、状态迁移或 Cookie 匹配逻辑时，应在任务设计中补充可离线执行的回归验证。
