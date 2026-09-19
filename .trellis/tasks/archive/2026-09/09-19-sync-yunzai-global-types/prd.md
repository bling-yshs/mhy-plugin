# 同步 ZZZ 插件 Yunzai 全局类型声明

## Goal

复制同级 ZZZ-Plugin 的 Yunzai 全局类型声明到 mhy-plugin，使 TypeScript 开发可直接使用宿主提供的全局 API 类型。验收：目标声明文件存在、内容同步、pnpm type-check 通过。

## Requirements

- 以同级 `ZZZ-Plugin/src/@types/yunzai/global.d.ts` 为来源。
- 在当前插件的 `src/types/yunzai.d.ts` 保存同内容的 Yunzai 宿主全局声明。
- 保持现有 `tsconfig.json` 对 `src/types` 的类型包含范围，无需新增依赖或运行时适配代码。

## Acceptance Criteria

- [ ] `src/types/yunzai.d.ts` 存在，且与来源文件内容一致。
- [ ] `pnpm type-check` 通过。
- [ ] 未修改与全局声明同步无关的业务代码。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
