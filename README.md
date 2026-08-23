# ArtboardFlow · 游戏CG预演中台

面向游戏开场 / CG 预演的 AIGC 中台，在原有无限画布之上扩展出垂直闭环：**IP资产沉淀 → 分镜脚本编排 → 批量预演生成 → 人审打标 → 数据看板**。美术可沉淀角色 / 场景 / 道具参考图与风格词保障IP一致性，策划 / 导演可在分镜中配置多镜运镜与文案后一键批量生成视频预演，通过“通过 / 不通过 + 原因”人审闭环筛选可用镜头，看板聚合生成成功率、人审通过率与 Bad Case TOP3，直观对比“传统流程 14 天 vs AIGC 流程 2 天”的提效。

底层仍保留通用无限画布能力：画布、项目、生成记录、提示词库本地存取，支持节点拖拽连线、模型自定义脚本、插件与本地 Agent，未破坏原有体验。

## 能做什么

- **无限画布**：多项目、节点拖拽缩放、连线、小地图、撤销重做、画布导入导出。
- **生图 / 生视频**：独立工作台 + 画布内节点生成。视频支持参考图、参考视频 / 音频、首尾帧、视频编辑与延续（对齐 Seedance 2.5）。
- **模型配置**：每个模型可以挂一段自定义调用脚本，非标准 API 也能接。默认阿里百炼 `qwen-image` 生图、`wanx2.1-t2v-turbo` 生视频，就是用脚本适配的异步接口（创建任务 → 轮询 → 取结果）。
- **账号与用量**：可接入任意 OpenAI 兼容网关（比如 new-api）做用户注册 / 登录和用量统计，适合几个人共用一个 Key 的场景。
- **插件系统**：`plugins/` 支持动态安装远程节点插件，附 TypeScript SDK。
- **本地 Agent**：`canvas-agent/` 提供 CLI，可以通过 MCP 让 Codex / Claude Code 直接操作画布。

## 快速开始

需要 [Bun](https://bun.sh)（依赖安装已配好 npmmirror 镜像）：

```bash
bun install
bun run dev
```

打开 http://localhost:3000。

## 配置

**API Key**：编辑根目录 `.env.local`（已 gitignore），填入：

```bash
VITE_DASHSCOPE_API_KEY=sk-xxx
```

改完重启 dev server 生效。生图约 ¥0.15/张，生视频约 ¥0.4/5 秒 720p。

**渠道与模型**：「配置 → 渠道」里可以增删渠道、改模型、编辑自定义脚本。脚本的返回约定见 `src/services/api/model-plugin.ts`。

**账号登录（可选）**：默认不登录直接用。想接账号系统时，在 `.env.local` 里配 `VITE_NEW_API_BASE` 指向一个 OpenAI 兼容网关（如 new-api），前端会出现登录页，登录后自动用网关令牌调用 AI。

## 目录结构

```
src/
  pages/        # 首页 / 画布 / 生图 / 视频 / 提示词库 / 资产 / 配置 / 登录
  components/   # 画布组件、渠道编辑器、模型脚本编辑器、布局
  stores/       # Zustand stores（use-config-store 内置百炼渠道 + 脚本）
  services/api/ # 生图/生视频/文本/音频调用层 + model-plugin 脚本引擎
  lib/          # 画布导出、本地存储、工具库
canvas-agent/   # 本地 Agent CLI（Codex / Claude Code MCP）
plugins/        # 画布节点插件（HTML / Markdown / SVG 等）+ SDK
docs/           # Next.js 文档站
```

## 游戏CG预演工作流

1. **IP资产**：在 `/ip-assets` 创建角色 / 场景 / 道具资产包，上传 1-6 张参考图（复用 `/api/assets`），填写风格关键词与描述，保障全流程 IP 一致性。
2. **分镜脚本**：在 `/storyboard` 新建分镜，关联 IP 资产，逐镜配置画面描述、运镜（推 / 拉 / 环绕 / 固定 / 跟随）、时长 2-15s、绑定 IP 与提示词追加，支持拖拽排序。
3. **批量生成**：分镜详情页点击“一键生成全片”，后端为每镜创建 `generation_jobs`（Seedance 2.5 视频模型），前端轮询展示任务状态与缩略图。
4. **人审打标**：在生成结果或镜头审核区对每镜点击“通过”或“不通过”（需选择原因：脸崩 / 盔甲错 / 风格偏离 / 运镜错 / 文字错 / 其他 + 备注），调用 `POST /api/shots/:shotId/reviews`，支持无任务时直接审核。
5. **数据看板**：在 `/dashboard` 查看聚合指标——总分镜数、总镜头数、总生成数、生成成功率、人审通过率、总审核数，以及 Bad Case TOP3 与“传统 14 天 vs AIGC 2 天”提效对比。

> 演示数据见 `docs/superpowers/plans/demo-data.json`，包含 1 个示例 IP 包与 1 个示例分镜（2 镜）。

## 技术栈

Vite · React · TypeScript · Ant Design · Zustand · Tailwind CSS，构建用 Bun。新增后端为 Fastify + SQLite（DatabaseSync），表 `ip_assets / storyboards / storyboard_shots / shot_reviews`，前端新增页面 `/ip-assets /storyboard /dashboard`，复用现有生成队列与鉴权。

## License

[AGPL-3.0](LICENSE)
