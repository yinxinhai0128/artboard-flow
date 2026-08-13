# ArtboardFlow（无限画布工作台）

AI 创作工作台：无限画布编排 + 生图 + 生视频 + 提示词库 + 素材沉淀。前端纯浏览器存储，开箱即用。

## 功能

- **无限画布**：多画布项目、节点拖拽缩放、连线、小地图、撤销重做、导入导出。
- **AI 创作**：生图工作台、视频创作台、文本/音频生成。
- **默认渠道：阿里百炼（DashScope）**——开箱即用：
  - 生图：`qwen-image`（约 ¥0.15/张）
  - 生视频：`wanx2.1-t2v-turbo`（约 ¥0.4/5秒 720p，万相最便宜档）
  - API Key 从 `.env.local` 的 `VITE_DASHSCOPE_API_KEY` 读取（已 gitignore）。
- **自定义脚本**：每个模型可配自定义调用脚本，适配任意非标准 API（百炼生图/生视频即通过脚本适配原生异步接口：创建任务 → 轮询 → 取结果）。
- **本地 Agent**：`canvas-agent/` 提供本地 CLI，可连接 Codex/Claude Code 通过 MCP 操作画布。
- **插件系统**：`plugins/` 支持动态安装远程节点插件，附 TypeScript SDK。
- **文档站**：`docs/` 为 Next.js 文档站。

## 快速开始

```bash
bun install          # 依赖（已配置 npmmirror 镜像加速）
bun run dev          # 打开 http://localhost:3000
```

> 更换 API Key：编辑 `.env.local` 后重启 dev server，或访问「配置 → 渠道 → 阿里百炼」修改。

## 技术栈

- 前端：Vite、React、TypeScript、Ant Design、Zustand（localStorage/IndexedDB 持久化）
- 无后端依赖；`server/` 为旧版 Fastify + SQLite 后端，已不参与运行，保留作参考

## 目录结构

```
src/
  pages/        # 首页 / 画布 / 生图 / 视频 / 提示词库 / 资产 / 配置
  components/   # 画布组件、渠道编辑器、模型脚本编辑器、布局
  stores/       # Zustand stores（use-config-store 内置百炼渠道+脚本）
  services/api/ # 生图/生视频/文本/音频调用层 + model-plugin 脚本引擎
  lib/          # 工具库
canvas-agent/   # 本地 Agent CLI（Codex/Claude Code MCP）
plugins/        # 画布节点插件（HTML/Markdown/SVG 等）+ SDK
docs/           # Next.js 文档站
```

## 关键实现说明

1. `src/stores/use-config-store.ts`：
   - `defaultConfig` 内置「阿里百炼」渠道（qwen-image 生图 + wanx2.1-t2v-turbo 视频，各带 DashScope 原生异步接口脚本）
   - 默认生图/视频模型指向百炼
   - 修复 zustand persist merge：从未持久化过渠道时保留预置渠道（原逻辑会清空重建导致配置丢失）
2. `.env.local`（百炼 Key）、`VERSION`、`CHANGELOG.md`（vite 构建需要）
3. 主题存储 key、插件注册表、版本检查均指向本项目自有标识

## 原始备份（可删除）

- `src-original-backup/`：早期自研画布源码（60 文件）
- `docs-original-notes/`：早期开发笔记
- `node_modules-old-backup/`：旧依赖
- `README.old-utf16.md`：早期说明
