# 初始化项目开发规范

## 目标

基于当前仓库代码、`AGENTS.md` 和已有米哈游协议研究，建立可供后续 Trellis 任务直接引用的项目规范。

## 范围

- 将初始化生成的前端模板替换为 Yunzai / TRSS-Yunzai 插件规范。
- 记录正式插件目标、当前迁移阶段和研究 Demo 的边界。
- 记录 App QR、SToken 兑换、绑定账号和原神角色数据链路。
- 记录统一 HTTP、状态持久化、敏感数据和 TypeScript 质量约定。
- 保留并项目化跨层与代码复用思考指南。

## 依据

- `AGENTS.md`
- `package.json`、`tsconfig.json`、Oxlint/Oxfmt 配置
- `index.js`
- `src/apps/qr-login.ts`
- `src/lib/mihoyo-qr-login.ts`
- `src/http.ts`
- `src/main.ts`、`src/main2.ts`
- `src/types/`
- 用户提供的项目背景与参考仓库研究结论

## 验收标准

- [x] `.trellis/spec/` 与插件实际包和层次一致。
- [x] 每份规范包含真实文件与具体约定。
- [x] 正式插件、过渡代码和研究 Demo 的职责清晰。
- [x] App QR 与原神角色数据链路有明确契约。
- [x] 索引匹配最终文件集合。
- [x] 无模板占位文字或空章节。
