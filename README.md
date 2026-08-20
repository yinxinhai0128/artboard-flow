# ArtboardFlow

一个跑在浏览器里的 AI 创作工作台。核心是一块无限画布：把图片、视频、文本、音频节点拖进去连上线，再把素材交给生图 / 生视频模型出结果。画布、项目、生成记录、提示词库都存在浏览器本地（localStorage / IndexedDB），没有自己的后端，不用搭服务就能跑。

最早是给自己攒素材、串镜头用的，后来陆陆续续加了画布编排、模型自定义脚本、插件和本地 Agent，慢慢变成了现在的样子。

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

## 技术栈

Vite · React · TypeScript · Ant Design · Zustand · Tailwind CSS，构建用 Bun。

## License

[AGPL-3.0](LICENSE)
