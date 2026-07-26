import type { ArtboardFlowAppHostBridge } from './appHostBridge'
import type { CanvasHostBridge } from './canvas/hostBridge'

export type ArtboardFlowHostToolScope = 'app' | 'canvas'

export type ArtboardFlowHostToolInfo = {
  name: string
  scope: ArtboardFlowHostToolScope
  description: string
  inputSchema: HostToolInputSchema
}

type HostToolInputSchema = {
  type: 'object'
  required?: string[]
  properties: Record<string, HostToolInputSchemaProperty>
  additionalProperties?: boolean
}

type HostToolInputSchemaProperty =
  | { type: 'string' | 'number' | 'boolean' | 'object'; description?: string }
  | { type: 'array'; description?: string; items?: HostToolInputArrayItemSchema }

type HostToolInputArrayItemSchema =
  | { type: 'string' | 'number' | 'boolean' }
  | { type: 'object'; required?: string[]; properties: Record<string, HostToolInputSchemaProperty> }

type HostToolContext = {
  app?: Partial<ArtboardFlowAppHostBridge>
  canvas?: Partial<CanvasHostBridge>
}

type HostToolRuntimeOptions = {
  getApp: () => Partial<ArtboardFlowAppHostBridge> | undefined
  getCanvas: () => Partial<CanvasHostBridge> | undefined
}

export type ArtboardFlowHostToolsRuntime = {
  listTools: () => ArtboardFlowHostToolInfo[]
  runTool: (name: string, input?: unknown) => Promise<unknown>
}

const appToolNames = [
  'canvas_list_projects',
  'canvas_get_active_project',
  'canvas_open_project',
  'canvas_create_project',
] as const

const canvasToolNames = [
  'canvas_get_state',
  'canvas_get_graph',
  'canvas_get_selection',
  'canvas_export_snapshot',
  'canvas_apply_ops',
  'canvas_create_node',
  'canvas_create_text_node',
  'canvas_create_text_nodes',
  'canvas_create_config_node',
  'canvas_create_image_prompt_flow',
  'canvas_create_generation_flow',
  'canvas_generate_text',
  'canvas_generate_image',
  'canvas_generate_video',
  'canvas_update_node',
  'canvas_update_node_text',
  'canvas_move_nodes',
  'canvas_resize_node',
  'canvas_delete_nodes',
  'canvas_delete_connections',
  'canvas_connect_nodes',
  'canvas_select_nodes',
  'canvas_set_viewport',
  'canvas_run_generation',
  'generation_get_status',
  'assets_list',
  'assets_add',
] as const

export const artboardFlowHostToolNames = [...appToolNames, ...canvasToolNames] as const
export type ArtboardFlowHostToolName = (typeof artboardFlowHostToolNames)[number]

export function listArtboardFlowHostTools(): ArtboardFlowHostToolInfo[] {
  return [
    ...appToolNames.map((name) => ({ name, scope: 'app' as const, description: hostToolDescriptions[name], inputSchema: hostToolInputSchemas[name] })),
    ...canvasToolNames.map((name) => ({ name, scope: 'canvas' as const, description: hostToolDescriptions[name], inputSchema: hostToolInputSchemas[name] })),
  ]
}

const hostToolDescriptions: Record<ArtboardFlowHostToolName, string> = {
  canvas_list_projects: '列出画布项目摘要，支持关键词和分页。',
  canvas_get_active_project: '读取当前打开的画布项目 ID。',
  canvas_open_project: '按项目 ID 打开画布；id 为空时返回画布库。',
  canvas_create_project: '新建画布项目，并可选择立即打开。',
  canvas_get_state: '读取当前画布项目、选区和连线状态。',
  canvas_get_graph: '读取节点关系图，包括每个节点的输入、输出和关系数量。',
  canvas_get_selection: '读取当前选中的节点和选中关系。',
  canvas_export_snapshot: '导出当前画布快照，适合宿主保存或调试。',
  canvas_apply_ops: '批量执行底层画布操作。',
  canvas_create_node: '创建任意类型节点。',
  canvas_create_text_node: '创建单个文本节点。',
  canvas_create_text_nodes: '批量创建文本节点。',
  canvas_create_config_node: '创建 AI 生成配置节点。',
  canvas_create_image_prompt_flow: '创建提示词文本节点和图片生成配置节点，并自动建立关系。',
  canvas_create_generation_flow: '创建通用 AI 生成流程，可携带参考节点并自动连线。',
  canvas_generate_text: '创建文本生成流程并触发生成任务。',
  canvas_generate_image: '创建图片生成流程并触发生成任务。',
  canvas_generate_video: '创建视频生成流程并触发生成任务。',
  canvas_update_node: '更新节点基础字段或 metadata。',
  canvas_update_node_text: '更新文本节点内容和标题。',
  canvas_move_nodes: '移动一个或多个节点，支持绝对坐标或偏移。',
  canvas_resize_node: '调整节点尺寸。',
  canvas_delete_nodes: '删除指定节点以及相关连线。',
  canvas_delete_connections: '删除指定连线或清空连线。',
  canvas_connect_nodes: '批量连接节点关系，建立从源节点到目标节点的有向连线。',
  canvas_select_nodes: '设置当前选中的节点。',
  canvas_set_viewport: '调整画布视口位置和缩放。',
  canvas_run_generation: '触发指定节点的生成流程。',
  generation_get_status: '查询画布生成任务状态。',
  assets_list: '查询宿主素材库，支持类型、关键词和分页。',
  assets_add: '新增文本或图片素材到宿主素材库。',
}

const emptyInputSchema = objectSchema({})
const pointProperties = {
  x: { type: 'number' as const },
  y: { type: 'number' as const },
}
const generationProperties = {
  prompt: { type: 'string' as const },
  title: { type: 'string' as const },
  x: { type: 'number' as const },
  y: { type: 'number' as const },
  model: { type: 'string' as const },
  size: { type: 'string' as const },
  count: { type: 'number' as const },
}
const videoGenerationProperties = {
  seconds: { type: 'string' as const },
  resolution: { type: 'string' as const },
  generateAudio: { type: 'boolean' as const },
  watermark: { type: 'boolean' as const },
}

const hostToolInputSchemas: Record<ArtboardFlowHostToolName, HostToolInputSchema> = {
  canvas_list_projects: objectSchema({
    keyword: { type: 'string' },
    page: { type: 'number' },
    pageSize: { type: 'number' },
  }),
  canvas_get_active_project: emptyInputSchema,
  canvas_open_project: objectSchema({
    id: { type: 'string' },
    replace: { type: 'boolean' },
  }),
  canvas_create_project: objectSchema({
    title: { type: 'string' },
    open: { type: 'boolean' },
  }),
  canvas_get_state: emptyInputSchema,
  canvas_get_graph: emptyInputSchema,
  canvas_get_selection: emptyInputSchema,
  canvas_export_snapshot: emptyInputSchema,
  canvas_apply_ops: objectSchema({
    ops: { type: 'array', items: { type: 'object', required: ['type'], properties: { type: { type: 'string' } } } },
  }, ['ops']),
  canvas_create_node: objectSchema({
    nodeType: { type: 'string' },
    title: { type: 'string' },
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
    metadata: { type: 'object' },
  }, ['nodeType']),
  canvas_create_text_node: objectSchema({
    text: { type: 'string' },
    title: { type: 'string' },
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number' },
    height: { type: 'number' },
  }),
  canvas_create_text_nodes: objectSchema({
    items: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, title: { type: 'string' }, ...pointProperties } } },
    x: { type: 'number' },
    y: { type: 'number' },
    gap: { type: 'number' },
    direction: { type: 'string' },
  }, ['items']),
  canvas_create_config_node: objectSchema({
    ...generationProperties,
    ...videoGenerationProperties,
    mode: { type: 'string' },
    width: { type: 'number' },
    height: { type: 'number' },
    autoRun: { type: 'boolean' },
  }),
  canvas_create_image_prompt_flow: objectSchema({
    ...generationProperties,
    autoRun: { type: 'boolean' },
  }, ['prompt']),
  canvas_create_generation_flow: objectSchema({
    ...generationProperties,
    ...videoGenerationProperties,
    mode: { type: 'string' },
    referenceNodeIds: { type: 'array', items: { type: 'string' } },
    autoRun: { type: 'boolean' },
  }, ['prompt']),
  canvas_generate_text: objectSchema(generationProperties, ['prompt']),
  canvas_generate_image: objectSchema(generationProperties, ['prompt']),
  canvas_generate_video: objectSchema({ ...generationProperties, ...videoGenerationProperties }, ['prompt']),
  canvas_update_node: objectSchema({
    id: { type: 'string' },
    patch: { type: 'object' },
    metadata: { type: 'object' },
  }, ['id']),
  canvas_update_node_text: objectSchema({
    id: { type: 'string' },
    text: { type: 'string' },
    title: { type: 'string' },
  }, ['id', 'text']),
  canvas_move_nodes: objectSchema({
    items: { type: 'array', items: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, dx: { type: 'number' }, dy: { type: 'number' } } } },
  }, ['items']),
  canvas_resize_node: objectSchema({
    id: { type: 'string' },
    width: { type: 'number' },
    height: { type: 'number' },
    freeResize: { type: 'boolean' },
  }, ['id', 'width', 'height']),
  canvas_delete_nodes: objectSchema({
    ids: { type: 'array', items: { type: 'string' } },
  }, ['ids']),
  canvas_delete_connections: objectSchema({
    id: { type: 'string' },
    ids: { type: 'array', items: { type: 'string' } },
    all: { type: 'boolean' },
  }),
  canvas_connect_nodes: objectSchema({
    connections: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fromNodeId', 'toNodeId'],
        properties: {
          id: { type: 'string' },
          fromNodeId: { type: 'string' },
          toNodeId: { type: 'string' },
        },
      },
    },
  }, ['connections']),
  canvas_select_nodes: objectSchema({
    ids: { type: 'array', items: { type: 'string' } },
  }, ['ids']),
  canvas_set_viewport: objectSchema({
    viewport: { type: 'object' },
  }, ['viewport']),
  canvas_run_generation: objectSchema({
    nodeId: { type: 'string' },
    mode: { type: 'string' },
    prompt: { type: 'string' },
  }, ['nodeId']),
  generation_get_status: objectSchema({
    scope: { type: 'string' },
    taskId: { type: 'string' },
    nodeIds: { type: 'array', items: { type: 'string' } },
    limit: { type: 'number' },
  }),
  assets_list: objectSchema({
    kind: { type: 'string' },
    keyword: { type: 'string' },
    page: { type: 'number' },
    pageSize: { type: 'number' },
  }),
  assets_add: objectSchema({
    kind: { type: 'string' },
    title: { type: 'string' },
    content: { type: 'string' },
    imageUrl: { type: 'string' },
  }, ['kind']),
}

export function createArtboardFlowHostTools(options: HostToolRuntimeOptions): ArtboardFlowHostToolsRuntime {
  return {
    listTools: listArtboardFlowHostTools,
    runTool: (name, input) => runArtboardFlowHostTool({ app: options.getApp(), canvas: options.getCanvas() }, name, input),
  }
}

export async function runArtboardFlowHostTool(context: HostToolContext, name: string, input: unknown = {}) {
  const parsedInput = objectInput(input)
  if (isAppToolName(name)) return runAppTool(requireApp(context), name, validateHostToolInput(name, parsedInput))
  if (isCanvasToolName(name)) return runCanvasTool(requireCanvas(context), name, validateHostToolInput(name, parsedInput))
  throw new Error('UNKNOWN_HOST_TOOL')
}

function runAppTool(app: Partial<ArtboardFlowAppHostBridge>, name: (typeof appToolNames)[number], input: Record<string, unknown>) {
  if (name === 'canvas_list_projects') return app.listProjects?.(input)
  if (name === 'canvas_get_active_project') return { id: app.getActiveProjectId?.() ?? null }
  if (name === 'canvas_open_project') return app.openProject?.({ id: typeof input.id === 'string' ? input.id : null, replace: input.replace === true })
  if (name === 'canvas_create_project') return app.createProject?.({ title: stringField(input.title), open: input.open !== false })
}

function runCanvasTool(canvas: Partial<CanvasHostBridge>, name: (typeof canvasToolNames)[number], input: Record<string, unknown>) {
  if (name === 'canvas_get_state') return canvas.getSnapshot?.()
  if (name === 'canvas_get_graph') return canvas.getGraph?.()
  if (name === 'canvas_get_selection') return canvas.getSelection?.()
  if (name === 'canvas_export_snapshot') return canvas.exportSnapshot?.()
  if (name === 'canvas_apply_ops') return canvas.applyOps?.(Array.isArray(input.ops) ? input.ops : [])
  if (name === 'canvas_create_node') return canvas.createNode?.(input as Parameters<CanvasHostBridge['createNode']>[0])
  if (name === 'canvas_create_text_node') return canvas.createTextNode?.(input as Parameters<CanvasHostBridge['createTextNode']>[0])
  if (name === 'canvas_create_text_nodes') return canvas.createTextNodes?.(input as Parameters<CanvasHostBridge['createTextNodes']>[0])
  if (name === 'canvas_create_config_node') return canvas.createConfigNode?.(input as Parameters<CanvasHostBridge['createConfigNode']>[0])
  if (name === 'canvas_create_image_prompt_flow') return canvas.createImagePromptFlow?.(input as Parameters<CanvasHostBridge['createImagePromptFlow']>[0])
  if (name === 'canvas_create_generation_flow') return canvas.createGenerationFlow?.(input as Parameters<CanvasHostBridge['createGenerationFlow']>[0])
  if (name === 'canvas_generate_text') return canvas.generateText?.(input as Parameters<CanvasHostBridge['generateText']>[0])
  if (name === 'canvas_generate_image') return canvas.generateImage?.(input as Parameters<CanvasHostBridge['generateImage']>[0])
  if (name === 'canvas_generate_video') return canvas.generateVideo?.(input as Parameters<CanvasHostBridge['generateVideo']>[0])
  if (name === 'canvas_update_node') return canvas.updateNode?.(input as Parameters<CanvasHostBridge['updateNode']>[0])
  if (name === 'canvas_update_node_text') return canvas.updateNodeText?.(input as Parameters<CanvasHostBridge['updateNodeText']>[0])
  if (name === 'canvas_move_nodes') return canvas.moveNodes?.(input as Parameters<CanvasHostBridge['moveNodes']>[0])
  if (name === 'canvas_resize_node') return canvas.resizeNode?.(input as Parameters<CanvasHostBridge['resizeNode']>[0])
  if (name === 'canvas_delete_nodes') return canvas.deleteNodes?.(input as Parameters<CanvasHostBridge['deleteNodes']>[0])
  if (name === 'canvas_delete_connections') return canvas.deleteConnections?.(input as Parameters<CanvasHostBridge['deleteConnections']>[0])
  if (name === 'canvas_connect_nodes') return canvas.connectNodes?.(input as Parameters<CanvasHostBridge['connectNodes']>[0])
  if (name === 'canvas_select_nodes') return canvas.selectNodes?.(input as Parameters<CanvasHostBridge['selectNodes']>[0])
  if (name === 'canvas_set_viewport') return canvas.setViewport?.(input as Parameters<CanvasHostBridge['setViewport']>[0])
  if (name === 'canvas_run_generation') return canvas.runGeneration?.(input as Parameters<CanvasHostBridge['runGeneration']>[0])
  if (name === 'generation_get_status') return canvas.getGenerationStatus?.(input as Parameters<CanvasHostBridge['getGenerationStatus']>[0])
  if (name === 'assets_list') return canvas.searchAssets?.(input as Parameters<CanvasHostBridge['searchAssets']>[0])
  if (name === 'assets_add') return addAsset(canvas, input)
}

function addAsset(canvas: Partial<CanvasHostBridge>, input: Record<string, unknown>) {
  if (input.kind === 'text') return canvas.addTextAsset?.({ text: stringField(input.content) })
  if (input.kind === 'image') return canvas.addImageAsset?.({ imageUrl: stringField(input.imageUrl) })
  throw new Error('UNSUPPORTED_ASSET_KIND')
}

function requireApp(context: HostToolContext) {
  if (!context.app) throw new Error('HOST_APP_UNAVAILABLE')
  return context.app
}

function requireCanvas(context: HostToolContext) {
  if (!context.canvas) throw new Error('HOST_CANVAS_UNAVAILABLE')
  return context.canvas
}

function isAppToolName(name: string): name is (typeof appToolNames)[number] {
  return appToolNames.includes(name as (typeof appToolNames)[number])
}

function isCanvasToolName(name: string): name is (typeof canvasToolNames)[number] {
  return canvasToolNames.includes(name as (typeof canvasToolNames)[number])
}

function objectInput(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? input as Record<string, unknown> : {}
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function objectSchema(properties: HostToolInputSchema['properties'], required: string[] = []): HostToolInputSchema {
  return { type: 'object', properties, required, additionalProperties: true }
}

function validateHostToolInput(name: ArtboardFlowHostToolName, input: Record<string, unknown>) {
  const schema = hostToolInputSchemas[name]
  for (const key of schema.required ?? []) {
    if (input[key] === undefined) throwInvalidInput(name, `${key} is required`)
  }
  Object.entries(schema.properties).forEach(([key, property]) => {
    const value = input[key]
    if (value === undefined) return
    if (property.type === 'array') {
      if (!Array.isArray(value)) throwInvalidInput(name, `${key} must be an array`)
      validateArrayItems(name, key, value, property.items)
      return
    }
    if (property.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throwInvalidInput(name, `${key} must be an object`)
      return
    }
    if (typeof value !== property.type) throwInvalidInput(name, `${key} must be ${property.type}`)
  })
  return input
}

function validateArrayItems(
  name: ArtboardFlowHostToolName,
  key: string,
  items: unknown[],
  schema: Extract<HostToolInputSchemaProperty, { type: 'array' }>['items'],
) {
  if (!schema) return
  items.forEach((item, index) => {
    if (schema.type !== 'object') {
      if (typeof item !== schema.type) throwInvalidInput(name, `${key}[${index}] must be ${schema.type}`)
      return
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) throwInvalidInput(name, `${key}[${index}] must be an object`)
    const objectItem = item as Record<string, unknown>
    for (const requiredKey of schema.required ?? []) {
      if (typeof objectItem[requiredKey] !== 'string' || !objectItem[requiredKey]) {
        throwInvalidInput(name, `${key}[${index}].${requiredKey} is required`)
      }
    }
  })
}

function throwInvalidInput(name: string, reason: string): never {
  throw new Error(`INVALID_HOST_TOOL_INPUT:${name}:${reason}`)
}
