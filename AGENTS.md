# AGENTS.md

本项目是 `ArtboardFlow`，一个 AI 创作工作台：生图、生视频、画布编排、提示词库与素材沉淀。前端纯浏览器存储（localStorage/IndexedDB），无后端依赖。

## 基本原则

- 所有说明、界面文案和交付沟通使用简体中文。
- 先读现有代码和文档，再修改；优先沿用本项目已有结构。
- 只实现当前任务明确需要的功能，不额外扩展账号、多用户协作或云同步。
- 代码保持直接、可维护；没有复用价值的抽象不要新增。
- 修改必须可追溯到用户需求，避免顺手重构无关文件。
- 不要改无关文件，不要做无关格式化。

## 技术栈

- 前端：Vite、React、TypeScript、Ant Design、Zustand（localStorage 持久化）。
- 构建：`bun install` / `bun run dev` / `bun run build` / `bun run typecheck`。
- 无后端依赖；`server/` 为旧版 Fastify + SQLite 后端，已不参与运行，仅作参考。

## 目录结构

- `src/pages/`：首页、画布、生图工作台、视频创作台、提示词库、资产、配置。
- `src/components/`：画布组件、渠道编辑器、模型脚本编辑器、布局组件。
- `src/stores/`：Zustand stores；`use-config-store.ts` 内置「阿里百炼」渠道与生图/生视频自定义脚本，并含 persist merge 修复（未持久化时保留预置渠道）。
- `src/services/api/`：生图/生视频/文本/音频调用层 + `model-plugin.ts` 脚本引擎（模型可配自定义调用脚本）。
- `src/lib/`：工具库、画布导出、本地存储封装。

## AI 渠道接入规范

- 默认渠道「阿里百炼」（DashScope 原生异步接口），生图模型 `qwen-image`，视频模型 `wanx2.1-t2v-turbo`，通过自定义脚本适配（创建任务 → 轮询 task_id → 取结果 URL）。
- API Key 从根目录 `.env.local` 的 `VITE_DASHSCOPE_API_KEY` 读取（已 gitignore）。
- 新增模型/渠道：在「配置 → 渠道」中编辑，或按 `use-config-store.ts` 中既有脚本模式追加；脚本遵守 `model-plugin.ts` 的返回约定。
- 生图/生视频走异步任务轮询，脚本内需自行 `poll`，注意超时与错误透传。

## 质量要求

- 修改后运行最相关的检查：`bun run typecheck`；涉及构建链路再跑 `bun run build`。
- 不虚构 API、路径或测试结果；未验证的操作要说明。
- 破坏性操作（删除、覆盖、git 历史改写）前先确认，除非用户已明确授权。
