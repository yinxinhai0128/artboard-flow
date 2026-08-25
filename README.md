# ArtboardFlow · 游戏 CG 预演中台

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" alt="License"></a>
  <a href="https://vite.dev/"><img src="https://img.shields.io/badge/Vite-7-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite"></a>
  <a href="https://reactrouter.com/"><img src="https://img.shields.io/badge/React_Router-7-ca4245?style=flat-square&logo=reactrouter&logoColor=white" alt="React Router"></a>
  <a href="https://render.com/deploy?repo=https://github.com/yinxinhai0128/artboard-flow"><img src="https://img.shields.io/badge/Render-Deploy-46e3b7?style=flat-square&logo=render&logoColor=111111" alt="Deploy to Render"></a>
</p>

面向游戏开场 / CG 预演的 AIGC 中台，把「IP 资产沉淀 → 分镜脚本编排 → 批量预演生成 → 人审打标 → 数据看板」整合为一条完整闭环：美术沉淀角色 / 场景 / 道具参考图与风格词保障 IP 一致性；策划 / 导演在分镜中配置多镜运镜与文案后一键批量生成视频预演；通过"通过 / 不通过 + 原因"的人审闭环筛选可用镜头；看板聚合生成成功率、人审通过率与 Bad Case TOP3，直观对比"传统流程 14 天 vs AIGC 流程 2 天"的提效。

同时内置完整的创作画布：多项目节点编排、生图生视频工作台、提示词中心与素材库本地存取，支持节点拖拽连线、模型自定义脚本、插件与本地 Agent。

<!--
产品截图占位：截图后放到 docs/screenshots/ 并在此引用，例如
![画布编排](docs/screenshots/canvas.png)
-->

## 核心功能

- **游戏 CG 预演闭环**：IP 资产包（1-6 张参考图 + 风格关键词）→ 分镜逐镜配置画面描述 / 运镜 / 时长 → 一键批量生成全片 → 逐镜人审打标（脸崩 / 盔甲错 / 风格偏离等原因归类）→ 看板聚合指标与 Bad Case TOP3。
- **创作画布**：多项目、节点拖拽缩放、连线、小地图、撤销重做、画布导入导出。
- **生图 / 生视频**：独立工作台 + 画布内节点生成。视频支持参考图、参考视频 / 音频、首尾帧、视频编辑与延续。
- **提示词中心**：多来源聚合检索，内置 prompts.chat、GPT-Image、Nano Banana Pro 等 GitHub 热门提示词库，也可自定义远程来源脚本。
- **模型配置**：每个模型可挂一段自定义调用脚本，非标准 API 也能接入。默认阿里百炼 `qwen-image` 生图、`wanx2.1-t2v-turbo` 生视频。
- **账号与用量**：可接入任意 OpenAI 兼容网关做注册登录和用量统计，适合团队共用一个 Key 的场景。
- **插件系统**：`plugins/` 支持动态安装远程节点插件（HTML / Markdown / SVG / 3D 全景 / 便签等），附 TypeScript SDK。
- **本地 Agent**：`canvas-agent/` 提供 CLI 与 MCP 服务，Codex / Claude Code 可直接读取选区、创建节点、连接生成流程并触发生成。

## 快速开始

需要 [Bun](https://bun.sh)：

```bash
bun install
bun run dev
```

打开 http://localhost:8788。

### Docker 部署

```bash
docker compose up -d
```

默认端口 3000。也可一键部署到 Render：

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/yinxinhai0128/artboard-flow)

## 配置

**API Key**：编辑根目录 `.env.local`（已 gitignore）：

```bash
VITE_DASHSCOPE_API_KEY=sk-xxx
```

改完重启 dev server 生效。生图约 ¥0.15/张，生视频约 ¥0.4/5 秒 720p。

**渠道与模型**：「配置 → 渠道」里可以增删渠道、改模型、编辑自定义调用脚本，脚本返回约定见 `src/services/api/model-plugin.ts`。

**账号登录（可选）**：默认免登录直接用。接入账号系统时，在 `.env.local` 配置 `VITE_NEW_API_BASE` 指向 OpenAI 兼容网关（如 new-api），前端会出现登录页，登录后自动使用网关令牌调用 AI。

## 游戏 CG 预演工作流

1. **IP 资产**：在 `/ip-assets` 创建角色 / 场景 / 道具资产包，上传参考图并填写风格关键词，保障全流程 IP 一致性。
2. **分镜脚本**：在 `/storyboard` 新建分镜并关联 IP 资产，逐镜配置画面描述、运镜（推 / 拉 / 环绕 / 固定 / 跟随）、时长 2-15s 与提示词追加，支持拖拽排序。
3. **批量生成**：分镜详情页点击"一键生成全片"，后端为每镜创建生成任务，前端轮询展示任务状态与缩略图。
4. **人审打标**：对每镜点击"通过"或"不通过"（原因归类 + 备注），沉淀审核数据。
5. **数据看板**：在 `/dashboard` 查看总分镜数、生成成功率、人审通过率、Bad Case TOP3 与提效对比。演示数据见 `docs/demo-data.json`。

## 目录结构

```
src/            页面（首页 / 画布 / 生图 / 视频 / 提示词中心 / IP资产 / 分镜 / 看板 / 配置）、组件与状态
server/         Fastify 后端 + SQLite（IP 资产 / 分镜 / 审核 / 指标聚合）
canvas-agent/   本地 Agent CLI（MCP，供 Codex / Claude Code 操作画布）
plugins/        画布节点插件 + TypeScript SDK + Codex App 插件
docs/           文档站（Next.js）
```

## 技术栈

Vite · React · TypeScript · Ant Design · Zustand · Tailwind CSS，构建用 Bun；后端 Fastify + SQLite。

## 测试

```bash
bun run test          # 前端组件与 store 测试（vitest）
bun run test:server   # 后端与 canvas-agent 测试（bun test）
bun run typecheck
```

## License

[AGPL-3.0](LICENSE)。本软件包含基于 MIT 许可的第三方组件，声明见 LICENSE 文件。
