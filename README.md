# ArtboardFlow

ArtboardFlow 是一个独立实现的无限画布底座，面向后续嵌入 AI 生图、AI 生视频等创作工具网站。项目参考了案例项目的功能行为，但不直接套用案例项目源码。

## 当前能力

- 画布库：新建、打开、重命名、删除、批量删除、导入 JSON/ZIP、导出 JSON/ZIP。
- 无限画布：平移、缩放、缩放滑杆、重置视图、点阵/网格/空白背景、小地图。
- 节点：文本、图片、视频、音频、配置、分组六类节点。
- 节点交互：选择、多选、框选、拖拽、缩放、复制、粘贴、删除。
- 节点关系：左右连接点、拖拽连线、点击端口连线、连线持久化、上下游高亮、关系信息弹窗。
- 素材复用：上传/粘贴媒体入库、画布节点保存为资产、资产库侧栏浏览并插回画布。
- 生成工作流底座：配置节点可汇总已连接资源，提交轮询示例生成任务，并支持多结果拆分与主结果替换。
- 历史记录：撤销、重做覆盖节点、连线、视口和背景模式。
- 后端持久化：Fastify API + SQLite 保存项目、节点、连线、视口、资产和生成任务记录。
- 外部工具适配层：通过 `window.artboardFlowTools` 暴露案例项目风格的 `canvas_*`、`assets_*`、`generation_*` 命令，方便后续接入 Agent 或宿主网站。

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

当前 Canvas Host Bridge 覆盖这些核心能力：

- 读取：`getSnapshot()`、`getGraph()`、`exportSnapshot()`、`getSelection()`。
- 节点：`createNode()`、`createTextNode()`、`createTextNodes()`、`createConfigNode()`、`updateNode()`、`updateNodeText()`、`moveNodes()`、`resizeNode()`、`deleteNodes()`。
- 连线与视口：`connectNodes()`、`deleteConnections()`、`selectNodes()`、`setViewport()`。
- 生成流程：`createGenerationFlow()`、`createImagePromptFlow()`、`generateImage()`、`generateVideo()`、`generateText()`、`runGeneration()`、`submitGenerationTask()`、`getGenerationStatus()`。
- 素材：`listAssets()`、`searchAssets()`、`addAsset()`、`addAssetNode()`、`addTextAsset()`、`addTextAssetNode()`、`addImageAsset()`、`addImageAssetNode()`。
- 历史：`undo()`、`canUndo()`。

示例应用会把 `window.artboardFlowCanvas` 绑定到当前打开的画布页，便于本地调试和外部自动化验证。生产接入时，建议宿主显式保存 bridge 实例，并把素材上传、生成任务提交、生成状态查询等能力接到自己的后端适配器。

示例应用还会把 `window.artboardFlowApp` 绑定到站点级桥接层，提供 `listProjects()`、`getActiveProjectId()`、`openProject()`、`createProject()`。这部分用于 Agent 或宿主先定位/打开画布；单个画布内部操作仍使用 `window.artboardFlowCanvas`。

两个桥接层都支持 `getCapabilities()`，用于在运行时读取可用命令名、能力范围和简短说明，方便后续接入 Agent 工具协议或已有 AI 创作网站的宿主脚本。

## Agent 风格工具入口

为了更接近案例项目的 Agent 工具调用方式，示例应用额外暴露 `window.artboardFlowTools`：

```ts
const tools = window.artboardFlowTools
const availableTools = tools.listTools()

await tools.runTool('canvas_create_project', {
  title: 'AI 视频分镜画布',
  open: true,
})

await tools.runTool('canvas_create_text_node', {
  title: '镜头 1',
  text: '黄昏海边，低角度跟拍',
  x: 240,
  y: 180,
})

await tools.runTool('canvas_connect_nodes', {
  sourceId: 'source-node-id',
  targetId: 'target-node-id',
})
```

`window.artboardFlowTools` 当前会把以下命令映射到 App/Canvas Host Bridge：

- 项目级：`canvas_list_projects`、`canvas_get_active_project`、`canvas_open_project`、`canvas_create_project`。
- 画布读取：`canvas_get_state`、`canvas_get_selection`、`canvas_export_snapshot`。
- 节点/连线/视口：`canvas_create_node`、`canvas_create_text_node`、`canvas_create_text_nodes`、`canvas_create_config_node`、`canvas_update_node`、`canvas_update_node_text`、`canvas_move_nodes`、`canvas_resize_node`、`canvas_delete_nodes`、`canvas_delete_connections`、`canvas_connect_nodes`、`canvas_select_nodes`、`canvas_set_viewport`、`canvas_apply_ops`。
- AI 工作流：`canvas_create_image_prompt_flow`、`canvas_create_generation_flow`、`canvas_generate_text`、`canvas_generate_image`、`canvas_generate_video`、`canvas_run_generation`、`generation_get_status`。
- 素材：`assets_list`、`assets_add`。

这层不是 UI 空壳，而是薄适配层：它复用真实的画布状态、持久化、节点、连线、素材和生成任务接口。后续接入你已有的网站时，可以直接把这层包装为宿主网站内部的 Agent 工具协议。
