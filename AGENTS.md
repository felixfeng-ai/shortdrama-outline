<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 代码注释规范

- 关键代码模块必须添加中文注释，包括状态机、跨端共享数据、成本计算、权限与安全、任务恢复、模型路由、版本写入和复杂交互组件。
- 注释必须说明业务原因、边界条件、失败行为和不能破坏的约束，不写逐行翻译代码的无效注释。
- 修改上述模块时必须同步检查注释是否仍与实现一致；行为发生变化而注释未更新，视为未完成。
- 普通样式、简单布尔判断和自解释的一行代码不强制添加注释。
