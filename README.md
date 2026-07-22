# ArtboardFlow

ArtboardFlow 是一个独立实现的无限画布底座，面向后续嵌入 AI 生图、AI 生视频等创作工具网站。它参考样板项目的公开功能行为，但不复制样板项目源码。

## 当前能力

- 画布库：新建、打开、重命名、删除、批量删除、导入 JSON/ZIP、导出 JSON/ZIP。
- 无限画布：平移、缩放、缩放滑杆、重置视图、点阵/网格/空白背景、小地图。
- 节点：文本、图片、视频、音频、配置、分组六类节点。
- 节点交互：选择、多选、框选、拖拽、缩放、复制、粘贴、删除。
- 节点关系：左右连接点、拖拽连线、点击端口连线、连线持久化、上下游高亮、关系信息弹窗。
- 素材复用：上传/粘贴媒体入库、画布节点保存为资产、资产库侧栏浏览并插回画布。
- 生成工作流底座：配置节点可汇总已连接资源，提交/轮询示例生成任务，并支持多结果拆分与主结果替换。
- 历史记录：撤销、重做覆盖节点、连线、视口和背景模式。
- 后端持久化：Fastify API + SQLite 保存项目、节点、连线、视口、资产和生成任务记录。

## 技术栈

- 前端：Vite、React、TypeScript、lucide-react。
- 后端：Node.js、Fastify、Node 内置 SQLite。
- 数据库：`server/data/artboard-flow.sqlite`。
- 资产目录：`server/data/assets/`。

## 本地运行

```bash
npm install
npm run dev
```

默认地址：

- 前端：http://localhost:5174/
- 后端：http://127.0.0.1:8787/
- 健康检查：http://127.0.0.1:8787/api/health

## 常用命令

```bash
npm run lint
npm run test
npm run build
```

## 嵌入说明

画布核心代码集中在 `src/canvas/`：

- `CanvasWorkspace.tsx`：可嵌入画布工作区 UI。
- `useCanvasController.ts`：节点、连线、选择、历史记录等状态操作。
- `types.ts`：项目、节点、连线、视口、资产数据结构。
- `api.ts`：示例应用使用的项目持久化 API 客户端。
- `geometry.ts`：坐标变换、端口、连线路径等纯函数。
- `hostBridge.ts`：暴露给外部宿主或自动化 Agent 的画布操作桥接层。

后续嵌入已有 AI 创作网站时，可以复用 `src/canvas/`，由宿主网站负责传入项目数据、保存项目数据，并通过 `createCanvasHostBridge` 暴露清晰的外部操作接口。

当前 Host Bridge 已覆盖这些核心能力：

- 读取：`getSnapshot()`、`getGraph()`、`exportSnapshot()`、`getSelection()`。
- 节点：`createNode()`、`createTextNode()`、`createTextNodes()`、`createConfigNode()`、`updateNode()`、`updateNodeText()`、`moveNodes()`、`resizeNode()`、`deleteNodes()`。
- 连线与视口：`connectNodes()`、`deleteConnections()`、`selectNodes()`、`setViewport()`。
- 生成流程：`createGenerationFlow()`、`createImagePromptFlow()`、`generateImage()`、`generateVideo()`、`generateText()`、`runGeneration()` 会创建配置/任务节点与关系；`submitGenerationTask()` 会把任务节点提交给宿主生成适配器；`getGenerationStatus()` 可按 `taskId`、`nodeIds`、`scope`、`limit` 查询真实任务状态。
- 素材：`listAssets()`、`addAsset()`、`addAssetNode()`、`addTextAsset()`、`addTextAssetNode()` 可对接宿主素材库；文本素材会以 `text/plain` data URL 上传，画布节点保存 `/api/assets/...` 引用。
- 历史：`undo()`、`canUndo()` 支持宿主侧撤销入口。

示例应用已经把 `window.artboardFlowCanvas` 绑定到当前打开的画布页，便于本地调试和外部自动化验证。真正接入生产网站时，建议宿主显式保存 bridge 实例，并把素材上传、生成任务提交、生成状态查询等能力接到自己的后端适配器。
