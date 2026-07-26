import { applyCanvasAgentOps, createCanvasGenerationFlowOps, type CanvasAgentOp, type CanvasAgentSnapshot, type CanvasAgentGenerationRequest } from './agentOps'
import { addConnectionToProject, filterVisibleSelection } from './document'
import { applyGenerationJobToProject, buildCanvasGenerationContext, buildCanvasGenerationPayload, buildTextNodeImageGenerationContext, generationTaskPositionForSource } from './generation'
import { createCanvasGraphSnapshot, type CanvasGraphSnapshot } from './graph'
import { createCanvasNode } from './nodeFactory'
import type { CanvasAssetRecord, CanvasAssetUpload, CanvasConnection, CanvasGenerationJob, CanvasGenerationJobStatus, CanvasGenerationMode, CanvasGenerationPayload, CanvasNode, CanvasProject, NodeKind, Point, Viewport } from './types'

type CanvasHostBridgeOptions = {
  getSnapshot: () => CanvasAgentSnapshot
  commit: (snapshot: CanvasAgentSnapshot) => void
  createId?: (prefix?: string) => string
  now?: () => string
  assets?: CanvasHostAssetAdapter
  generation?: CanvasHostGenerationAdapter
}

type CanvasGenerationFlowInput = Parameters<typeof createCanvasGenerationFlowOps>[0]
type CanvasHostGenerateInput = Omit<CanvasGenerationFlowInput, 'mode' | 'autoRun'>
type CanvasHostImagePromptFlowInput = Omit<CanvasGenerationFlowInput, 'mode'>
type CanvasHostAssetAdapter = {
  list: () => Promise<CanvasAssetRecord[]> | CanvasAssetRecord[]
  add: (dataUrl: string) => Promise<CanvasAssetUpload> | CanvasAssetUpload
}
type CanvasHostGenerationAdapter = {
  list: (filter: CanvasHostGenerationSourceFilter) => Promise<CanvasGenerationJob[]> | CanvasGenerationJob[]
  submit?: (projectId: string, nodeId: string, payload: CanvasGenerationPayload) => Promise<CanvasGenerationJob> | CanvasGenerationJob
}
type CanvasHostGenerationSourceFilter = {
  projectId: string
}
type CanvasHostGenerationScope = 'all' | 'canvas' | CanvasGenerationMode
type CanvasHostGenerationStatusFilter = {
  scope?: CanvasHostGenerationScope
  taskId?: string
  nodeIds?: string[]
  limit?: number
}
type CanvasHostGenerationStatusSummary = Record<CanvasGenerationJobStatus, number>
export type CanvasHostGenerationStatus = {
  total: number
  summary: CanvasHostGenerationStatusSummary
  jobs: CanvasGenerationJob[]
}
export type CanvasHostCapabilityScope = 'canvas' | 'generation' | 'assets' | 'history'
export type CanvasHostCapability = {
  name: string
  scope: CanvasHostCapabilityScope
  description: string
}
type CanvasHostAssetFilter = {
  kind?: CanvasAssetRecord['kind'] | 'all'
}
type CanvasHostAssetSearchFilter = CanvasHostAssetFilter & {
  keyword?: string
  page?: number
  pageSize?: number
}
export type CanvasHostAssetSearchResult = {
  total: number
  page: number
  pageSize: number
  items: CanvasAssetRecord[]
}
type CanvasHostAssetNodeInput = {
  dataUrl: string
  title?: string
  position?: Point
  x?: number
  y?: number
}
type CanvasHostTextAssetInput = {
  text: string
}
type CanvasHostTextAssetNodeInput = CanvasHostTextAssetInput & {
  title?: string
  position?: Point
  x?: number
  y?: number
}
type CanvasHostImageAssetInput = {
  imageUrl: string
}
type CanvasHostImageAssetNodeInput = CanvasHostImageAssetInput & {
  title?: string
  position?: Point
  x?: number
  y?: number
}
type CanvasHostTextNodeInput = {
  id?: string
  text?: string
  title?: string
  x?: number
  y?: number
  width?: number
  height?: number
}
type CanvasHostCreateNodeInput = {
  id?: string
  nodeType: NodeKind
  title?: string
  position?: Point
  x?: number
  y?: number
  width?: number
  height?: number
  metadata?: Partial<CanvasNode['metadata']>
}
type CanvasHostTextNodesInput = {
  items: CanvasHostTextNodeInput[]
  x?: number
  y?: number
  gap?: number
  direction?: 'row' | 'column'
}
type CanvasHostConfigNodeInput = {
  id?: string
  title?: string
  mode?: CanvasGenerationMode
  prompt?: string
  x?: number
  y?: number
  width?: number
  height?: number
  model?: string
  size?: string
  count?: number
  seconds?: string | number
  resolution?: string
  generateAudio?: boolean | string
  watermark?: boolean | string
  autoRun?: boolean
}
type CanvasHostUpdateNodeTextInput = {
  id: string
  text: string
  title?: string
}
type CanvasHostUpdateNodeInput = {
  id: string
  patch?: Partial<CanvasNode>
  metadata?: Partial<CanvasNode['metadata']>
}
type CanvasHostMoveNodesInput = {
  items: Array<{ id: string; x?: number; y?: number; dx?: number; dy?: number }>
}
type CanvasHostResizeNodeInput = {
  id: string
  width: number
  height: number
  freeResize?: boolean
}
type CanvasHostDeleteNodesInput = {
  ids: string[]
}
type CanvasHostDeleteConnectionsInput = {
  id?: string
  ids?: string[]
  all?: boolean
}
type CanvasHostConnectNodesInput = {
  connections: Array<{ id?: string; fromNodeId: string; toNodeId: string }>
}
type CanvasHostSelectNodesInput = {
  ids: string[]
}
type CanvasHostSetViewportInput = {
  viewport: Viewport
}
type CanvasHostRunGenerationInput = {
  nodeId: string
  mode?: CanvasGenerationMode
  prompt?: string
}
type CanvasHostGenerationTaskInput = {
  nodeId: string
}

export type CanvasHostBridgeApplyResult = CanvasAgentSnapshot & {
  generationRequests: CanvasAgentGenerationRequest[]
}
export type CanvasHostGenerationTaskResult = CanvasHostBridgeApplyResult & {
  job: CanvasGenerationJob
}
export type CanvasHostBridgeAssetNodeResult = CanvasHostBridgeApplyResult & {
  asset: CanvasAssetUpload
}
export type CanvasHostExportSnapshot = {
  projectId: string
  title: string
  nodes: CanvasNode[]
  connections: CanvasConnection[]
  selectedNodeIds: string[]
  selectedConnectionId: string | null
  viewport: Viewport
}
export type CanvasHostSelection = {
  nodes: CanvasNode[]
  connections: CanvasConnection[]
  selectedNodeIds: string[]
  selectedConnectionId: string | null
}

export type CanvasHostBridge = {
  getCapabilities: () => CanvasHostCapability[]
  getSnapshot: () => CanvasAgentSnapshot
  getGraph: () => CanvasGraphSnapshot
  exportSnapshot: () => CanvasHostExportSnapshot
  getSelection: () => CanvasHostSelection
  applyOps: (ops?: CanvasAgentOp[]) => CanvasHostBridgeApplyResult
  createNode: (input: CanvasHostCreateNodeInput) => CanvasHostBridgeApplyResult
  createTextNode: (input: CanvasHostTextNodeInput) => CanvasHostBridgeApplyResult
  createTextNodes: (input: CanvasHostTextNodesInput) => CanvasHostBridgeApplyResult
  createConfigNode: (input: CanvasHostConfigNodeInput) => CanvasHostBridgeApplyResult
  updateNode: (input: CanvasHostUpdateNodeInput) => CanvasHostBridgeApplyResult
  updateNodeText: (input: CanvasHostUpdateNodeTextInput) => CanvasHostBridgeApplyResult
  moveNodes: (input: CanvasHostMoveNodesInput) => CanvasHostBridgeApplyResult
  resizeNode: (input: CanvasHostResizeNodeInput) => CanvasHostBridgeApplyResult
  deleteNodes: (input: CanvasHostDeleteNodesInput) => CanvasHostBridgeApplyResult
  deleteConnections: (input: CanvasHostDeleteConnectionsInput) => CanvasHostBridgeApplyResult
  connectNodes: (input: CanvasHostConnectNodesInput) => CanvasHostBridgeApplyResult
  selectNodes: (input: CanvasHostSelectNodesInput) => CanvasHostBridgeApplyResult
  setViewport: (input: CanvasHostSetViewportInput) => CanvasHostBridgeApplyResult
  runGeneration: (input: CanvasHostRunGenerationInput) => CanvasHostBridgeApplyResult
  createGenerationFlow: (input: CanvasGenerationFlowInput) => CanvasHostBridgeApplyResult
  createImagePromptFlow: (input: CanvasHostImagePromptFlowInput) => CanvasHostBridgeApplyResult
  generateText: (input: CanvasHostGenerateInput) => CanvasHostBridgeApplyResult
  generateImage: (input: CanvasHostGenerateInput) => CanvasHostBridgeApplyResult
  generateVideo: (input: CanvasHostGenerateInput) => CanvasHostBridgeApplyResult
  getGenerationStatus: (filter?: CanvasHostGenerationStatusFilter) => Promise<CanvasHostGenerationStatus>
  submitGenerationTask: (input: CanvasHostGenerationTaskInput) => Promise<CanvasHostGenerationTaskResult>
  listAssets: (filter?: CanvasHostAssetFilter) => Promise<CanvasAssetRecord[]>
  searchAssets: (filter?: CanvasHostAssetSearchFilter) => Promise<CanvasHostAssetSearchResult>
  addAsset: (input: { dataUrl: string }) => Promise<CanvasAssetUpload>
  addAssetNode: (input: CanvasHostAssetNodeInput) => Promise<CanvasHostBridgeAssetNodeResult>
  addTextAsset: (input: CanvasHostTextAssetInput) => Promise<CanvasAssetUpload>
  addTextAssetNode: (input: CanvasHostTextAssetNodeInput) => Promise<CanvasHostBridgeAssetNodeResult>
  addImageAsset: (input: CanvasHostImageAssetInput) => Promise<CanvasAssetUpload>
  addImageAssetNode: (input: CanvasHostImageAssetNodeInput) => Promise<CanvasHostBridgeAssetNodeResult>
  undo: () => CanvasAgentSnapshot | null
  canUndo: () => boolean
}

const canvasHostCapabilities: CanvasHostCapability[] = [
  { name: 'getSnapshot', scope: 'canvas', description: '读取当前画布项目、选区和连线状态。' },
  { name: 'getGraph', scope: 'canvas', description: '读取节点关系图、入度出度和资源引用摘要。' },
  { name: 'exportSnapshot', scope: 'canvas', description: '导出当前画布快照。' },
  { name: 'getSelection', scope: 'canvas', description: '读取当前选中的节点和关系。' },
  { name: 'applyOps', scope: 'canvas', description: '批量执行底层画布操作。' },
  { name: 'createNode', scope: 'canvas', description: '创建任意类型节点。' },
  { name: 'createTextNode', scope: 'canvas', description: '创建单个文本节点。' },
  { name: 'createTextNodes', scope: 'canvas', description: '批量创建文本节点。' },
  { name: 'createConfigNode', scope: 'generation', description: '创建生成配置节点。' },
  { name: 'updateNode', scope: 'canvas', description: '更新节点基础字段或 metadata。' },
  { name: 'updateNodeText', scope: 'canvas', description: '更新文本节点内容和标题。' },
  { name: 'moveNodes', scope: 'canvas', description: '移动一个或多个节点。' },
  { name: 'resizeNode', scope: 'canvas', description: '调整节点尺寸。' },
  { name: 'deleteNodes', scope: 'canvas', description: '删除指定节点及相关连线。' },
  { name: 'deleteConnections', scope: 'canvas', description: '删除指定连线或清空连线。' },
  { name: 'connectNodes', scope: 'canvas', description: '批量创建节点之间的关系连线。' },
  { name: 'selectNodes', scope: 'canvas', description: '设置当前选中节点。' },
  { name: 'setViewport', scope: 'canvas', description: '调整画布视口。' },
  { name: 'runGeneration', scope: 'generation', description: '触发指定节点生成并创建生成任务节点。' },
  { name: 'createGenerationFlow', scope: 'generation', description: '创建通用生成流程节点关系链。' },
  { name: 'createImagePromptFlow', scope: 'generation', description: '创建提示词文本、图片生成配置和任务节点关系链。' },
  { name: 'generateText', scope: 'generation', description: '创建文本生成流程并立即触发生成。' },
  { name: 'generateImage', scope: 'generation', description: '创建图片生成流程并立即触发生成。' },
  { name: 'generateVideo', scope: 'generation', description: '创建视频生成流程并立即触发生成。' },
  { name: 'getGenerationStatus', scope: 'generation', description: '查询宿主生成任务状态。' },
  { name: 'submitGenerationTask', scope: 'generation', description: '把已有生成任务节点提交给宿主生成适配器。' },
  { name: 'listAssets', scope: 'assets', description: '按类型列出宿主素材库。' },
  { name: 'searchAssets', scope: 'assets', description: '按类型、关键词和分页查询宿主素材库。' },
  { name: 'addAsset', scope: 'assets', description: '上传 data URL 素材到宿主素材库。' },
  { name: 'addAssetNode', scope: 'assets', description: '上传素材并插入为画布节点。' },
  { name: 'addTextAsset', scope: 'assets', description: '上传文本内容为 text/plain 素材。' },
  { name: 'addTextAssetNode', scope: 'assets', description: '上传文本素材并插入为画布文本节点。' },
  { name: 'addImageAsset', scope: 'assets', description: '从图片 data URL 或可访问 URL 上传图片素材。' },
  { name: 'addImageAssetNode', scope: 'assets', description: '上传图片素材并插入为画布图片节点。' },
  { name: 'undo', scope: 'history', description: '撤销最近一次 Host Bridge 操作。' },
  { name: 'canUndo', scope: 'history', description: '检查是否存在可撤销的 Host Bridge 操作。' },
]

export function createCanvasHostBridge(options: CanvasHostBridgeOptions): CanvasHostBridge {
  const createId = options.createId ?? ((prefix = 'id') => `${prefix}-${crypto.randomUUID()}`)
  const now = options.now ?? (() => new Date().toISOString())
  let undoSnapshot: CanvasAgentSnapshot | null = null
  let latestSnapshot = cloneSnapshot(options.getSnapshot())

  const applyOps = (ops: CanvasAgentOp[] = []): CanvasHostBridgeApplyResult => {
    const before = cloneSnapshot(latestSnapshot)
    const applied = applyCanvasAgentOps(before, ops, { createId: () => createId(), now })
    const materialized = materializeGenerationRequests(applied.project, applied.generationRequests, createId, now)
    const nextSelection = filterVisibleSelection(
      materialized.project,
      materialized.selectedNodeIds ?? applied.selectedNodeIds,
      null,
    )
    const next: CanvasHostBridgeApplyResult = {
      project: materialized.project,
      selectedNodeIds: nextSelection.selectedNodeIds,
      selectedConnectionId: nextSelection.selectedConnectionId,
      generationRequests: applied.generationRequests,
    }
    undoSnapshot = before
    latestSnapshot = cloneSnapshot(next)
    options.commit(next)
    return next
  }

  return {
    getCapabilities: () => canvasHostCapabilities,
    getSnapshot: () => cloneSnapshot(latestSnapshot),
    getGraph: () => createCanvasGraphSnapshot(latestSnapshot.project),
    exportSnapshot: () => exportSnapshot(latestSnapshot),
    getSelection: () => getSelection(latestSnapshot),
    applyOps,
    createNode: (input) => applyOps([createNodeOp(input)]),
    createTextNode: (input) => applyOps(createTextNodeOps({ items: [input], x: input.x, y: input.y })),
    createTextNodes: (input) => applyOps(createTextNodeOps(input)),
    createConfigNode: (input) => applyOps(createConfigNodeOps(input)),
    updateNode: (input) => applyOps([{ type: 'update_node', id: input.id, patch: input.patch, metadata: input.metadata }]),
    updateNodeText: (input) => applyOps([{
      type: 'update_node',
      id: input.id,
      patch: input.title ? { title: input.title } : undefined,
      metadata: { content: input.text, status: 'success' },
    }]),
    moveNodes: (input) => applyOps(input.items.map((item) => ({
      type: 'update_node',
      id: item.id,
      patch: { position: movedNodePosition(latestSnapshot.project.nodes, item) },
    }))),
    resizeNode: (input) => applyOps([{
      type: 'update_node',
      id: input.id,
      patch: { width: input.width, height: input.height },
      metadata: input.freeResize === undefined ? undefined : { freeResize: input.freeResize },
    }]),
    deleteNodes: (input) => applyOps([{ type: 'delete_node', ids: input.ids }]),
    deleteConnections: (input) => applyOps([{ type: 'delete_connections', id: input.id, ids: input.ids, all: input.all }]),
    connectNodes: (input) => applyOps(input.connections.map((connection) => ({ type: 'connect_nodes', ...connection }))),
    selectNodes: (input) => applyOps([{ type: 'select_nodes', ids: input.ids }]),
    setViewport: (input) => applyOps([{ type: 'set_viewport', viewport: input.viewport }]),
    runGeneration: (input) => applyOps([{ type: 'run_generation', nodeId: input.nodeId, mode: input.mode, prompt: input.prompt }]),
    createGenerationFlow: (input) => applyOps(createCanvasGenerationFlowOps(input, { createId: (prefix) => createId(prefix) })),
    createImagePromptFlow: (input) => applyOps(createCanvasGenerationFlowOps({ ...input, mode: 'image' }, { createId: (prefix) => createId(prefix) })),
    generateText: (input) => applyGenerationShortcut(input, 'text'),
    generateImage: (input) => applyGenerationShortcut(input, 'image'),
    generateVideo: (input) => applyGenerationShortcut(input, 'video'),
    getGenerationStatus: async (filter = {}) => {
      if (!options.generation) throw new Error('HOST_GENERATION_UNAVAILABLE')
      const jobs = await options.generation.list({ projectId: latestSnapshot.project.id })
      return createGenerationStatus(jobs, latestSnapshot.project.id, filter)
    },
    submitGenerationTask: async (input) => {
      if (!options.generation?.submit) throw new Error('HOST_GENERATION_UNAVAILABLE')
      const taskNode = latestSnapshot.project.nodes.find((node) => node.id === input.nodeId)
      const payload = taskNode?.metadata.generationPayload
      if (!payload) throw new Error('HOST_GENERATION_PAYLOAD_UNAVAILABLE')
      const before = cloneSnapshot(latestSnapshot)
      const job = await options.generation.submit(latestSnapshot.project.id, input.nodeId, payload)
      const next: CanvasHostGenerationTaskResult = {
        project: applyGenerationJobToProject(latestSnapshot.project, input.nodeId, job, () => createId('node')),
        selectedNodeIds: latestSnapshot.selectedNodeIds,
        selectedConnectionId: latestSnapshot.selectedConnectionId,
        generationRequests: [],
        job,
      }
      undoSnapshot = before
      latestSnapshot = cloneSnapshot(next)
      options.commit(next)
      return next
    },
    listAssets: async (filter = {}) => {
      const assets = await options.assets?.list()
      const list = assets ?? []
      return filter.kind && filter.kind !== 'all' ? list.filter((asset) => asset.kind === filter.kind) : list
    },
    searchAssets: async (filter = {}) => {
      const assets = await options.assets?.list()
      return searchAssets(assets ?? [], filter)
    },
    addAsset: async (input) => {
      if (!options.assets) throw new Error('HOST_ASSETS_UNAVAILABLE')
      return options.assets.add(input.dataUrl)
    },
    addTextAsset: async (input) => {
      if (!options.assets) throw new Error('HOST_ASSETS_UNAVAILABLE')
      return options.assets.add(textDataUrl(input.text))
    },
    addImageAsset: async (input) => {
      if (!options.assets) throw new Error('HOST_ASSETS_UNAVAILABLE')
      return options.assets.add(await imageUrlToDataUrl(input.imageUrl))
    },
    addAssetNode: async (input) => {
      if (!options.assets) throw new Error('HOST_ASSETS_UNAVAILABLE')
      const asset = await options.assets.add(input.dataUrl)
      const result = applyOps([
        {
          type: 'add_node',
          id: createId('node'),
          nodeType: nodeTypeFromMime(asset.mimeType),
          title: input.title,
          position: input.position ?? { x: input.x ?? 0, y: input.y ?? 0 },
          metadata: {
            content: asset.url,
            storageKey: asset.storageKey,
            mimeType: asset.mimeType,
            bytes: asset.bytes,
            status: 'success',
          },
        },
      ])
      return { ...result, asset }
    },
    addImageAssetNode: async (input) => {
      if (!options.assets) throw new Error('HOST_ASSETS_UNAVAILABLE')
      const asset = await options.assets.add(await imageUrlToDataUrl(input.imageUrl))
      const result = applyOps([
        {
          type: 'add_node',
          id: createId('node'),
          nodeType: nodeTypeFromMime(asset.mimeType),
          title: input.title,
          position: input.position ?? { x: input.x ?? 0, y: input.y ?? 0 },
          metadata: {
            content: asset.url,
            storageKey: asset.storageKey,
            mimeType: asset.mimeType,
            bytes: asset.bytes,
            status: 'success',
          },
        },
      ])
      return { ...result, asset }
    },
    addTextAssetNode: async (input) => {
      if (!options.assets) throw new Error('HOST_ASSETS_UNAVAILABLE')
      const asset = await options.assets.add(textDataUrl(input.text))
      const result = applyOps([
        {
          type: 'add_node',
          id: createId('node'),
          nodeType: 'text',
          title: input.title,
          position: input.position ?? { x: input.x ?? 0, y: input.y ?? 0 },
          metadata: {
            content: asset.url,
            storageKey: asset.storageKey,
            mimeType: asset.mimeType,
            bytes: asset.bytes,
            status: 'success',
          },
        },
      ])
      return { ...result, asset }
    },
    undo: () => {
      if (!undoSnapshot) return null
      const restored = undoSnapshot
      undoSnapshot = null
      latestSnapshot = cloneSnapshot(restored)
      options.commit(restored)
      return restored
    },
    canUndo: () => Boolean(undoSnapshot),
  }

  function applyGenerationShortcut(input: CanvasHostGenerateInput, mode: CanvasGenerationMode) {
    return applyOps(createCanvasGenerationFlowOps({ ...input, mode, autoRun: true }, { createId: (prefix) => createId(prefix) }))
  }
}

function textDataUrl(text: string) {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`
}

async function imageUrlToDataUrl(imageUrl: string) {
  if (imageUrl.startsWith('data:')) return imageUrl
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error('HOST_IMAGE_ASSET_FETCH_FAILED')
  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'application/octet-stream'
  const buffer = await response.arrayBuffer()
  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function searchAssets(assets: CanvasAssetRecord[], filter: CanvasHostAssetSearchFilter): CanvasHostAssetSearchResult {
  const kind = filter.kind ?? 'all'
  const keyword = filter.keyword?.trim().toLowerCase() ?? ''
  const filtered = assets
    .filter((asset) => kind === 'all' || asset.kind === kind)
    .filter((asset) => !keyword || assetSearchText(asset).includes(keyword))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const { page, pageSize, start, end } = paginate(filter.page, filter.pageSize, filtered.length)
  return {
    total: filtered.length,
    page,
    pageSize,
    items: filtered.slice(start, end),
  }
}

function assetSearchText(asset: CanvasAssetRecord) {
  return [
    asset.storageKey,
    asset.url,
    asset.mimeType,
    asset.extension,
    asset.kind,
  ].join(' ').toLowerCase()
}

function paginate(pageInput: number | undefined, pageSizeInput: number | undefined, total: number) {
  const pageSize = normalizePageSize(pageSizeInput)
  const maxPage = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(maxPage, Math.max(1, Math.floor(pageInput ?? 1)))
  const start = (page - 1) * pageSize
  return { page, pageSize, start, end: start + pageSize }
}

function normalizePageSize(pageSize: number | undefined) {
  if (typeof pageSize !== 'number' || !Number.isFinite(pageSize)) return 20
  return Math.max(1, Math.min(100, Math.floor(pageSize)))
}

function createGenerationStatus(
  jobs: CanvasGenerationJob[],
  projectId: string,
  filter: CanvasHostGenerationStatusFilter,
): CanvasHostGenerationStatus {
  const scope = filter.scope ?? 'all'
  const taskId = typeof filter.taskId === 'string' ? filter.taskId : ''
  const nodeIds = new Set(filter.nodeIds?.filter(Boolean) ?? [])
  const limit = normalizeLimit(filter.limit)
  const filtered = jobs
    .filter((job) => job.projectId === projectId)
    .filter((job) => !taskId || job.id === taskId)
    .filter((job) => !nodeIds.size || nodeIds.has(job.nodeId))
    .filter((job) => scope === 'all' || scope === 'canvas' || job.payload.mode === scope)
    .sort(compareGenerationJobs)

  return {
    total: filtered.length,
    summary: summarizeGenerationJobs(filtered),
    jobs: filtered.slice(0, limit),
  }
}

function normalizeLimit(limit: number | undefined) {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 20
  return Math.max(1, Math.min(100, Math.floor(limit)))
}

function summarizeGenerationJobs(jobs: CanvasGenerationJob[]): CanvasHostGenerationStatusSummary {
  const summary: CanvasHostGenerationStatusSummary = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 }
  jobs.forEach((job) => {
    summary[job.status] += 1
  })
  return summary
}

function compareGenerationJobs(a: CanvasGenerationJob, b: CanvasGenerationJob) {
  return generationStatusOrder(a.status) - generationStatusOrder(b.status) || b.updatedAt.localeCompare(a.updatedAt)
}

function generationStatusOrder(status: CanvasGenerationJobStatus) {
  if (status === 'running') return 0
  if (status === 'queued') return 1
  return 2
}

function exportSnapshot(snapshot: CanvasAgentSnapshot): CanvasHostExportSnapshot {
  return {
    projectId: snapshot.project.id,
    title: snapshot.project.title,
    nodes: snapshot.project.nodes,
    connections: snapshot.project.connections,
    selectedNodeIds: snapshot.selectedNodeIds,
    selectedConnectionId: snapshot.selectedConnectionId,
    viewport: snapshot.project.viewport,
  }
}

function getSelection(snapshot: CanvasAgentSnapshot): CanvasHostSelection {
  const selected = new Set(snapshot.selectedNodeIds)
  return {
    nodes: snapshot.project.nodes.filter((node) => selected.has(node.id)),
    connections: snapshot.project.connections.filter((connection) => (
      selected.has(connection.fromNodeId) &&
      selected.has(connection.toNodeId)
    )),
    selectedNodeIds: snapshot.selectedNodeIds,
    selectedConnectionId: snapshot.selectedConnectionId,
  }
}

function createNodeOp(input: CanvasHostCreateNodeInput): Extract<CanvasAgentOp, { type: 'add_node' }> {
  return {
    type: 'add_node',
    id: input.id,
    nodeType: input.nodeType,
    title: input.title,
    position: input.position ?? (input.x !== undefined || input.y !== undefined ? { x: input.x ?? 0, y: input.y ?? 0 } : undefined),
    width: input.width,
    height: input.height,
    metadata: input.metadata,
  }
}

function createTextNodeOps(input: CanvasHostTextNodesInput): CanvasAgentOp[] {
  const x = input.x ?? 0
  const y = input.y ?? 0
  const gap = input.gap ?? 40
  const direction = input.direction ?? 'column'
  return input.items.map((item, index) => ({
    type: 'add_node',
    id: item.id,
    nodeType: 'text',
    title: item.title,
    position: {
      x: item.x ?? (direction === 'row' ? x + index * (340 + gap) : x),
      y: item.y ?? (direction === 'row' ? y : y + index * (240 + gap)),
    },
    width: item.width,
    height: item.height,
    metadata: {
      content: item.text ?? '',
      status: 'success',
    },
  }))
}

function createConfigNodeOps(input: CanvasHostConfigNodeInput): CanvasAgentOp[] {
  const mode = input.mode ?? 'image'
  const prompt = input.prompt ?? ''
  const id = input.id ?? `config-${crypto.randomUUID()}`
  const ops: CanvasAgentOp[] = [
    {
      type: 'add_node',
      id,
      nodeType: 'config',
      title: input.title ?? configNodeTitle(mode),
      position: { x: input.x ?? 0, y: input.y ?? 0 },
      width: input.width,
      height: input.height,
      metadata: cleanHostMetadata({
        generationMode: mode,
        composerContent: prompt,
        prompt,
        status: 'idle',
        model: input.model,
        size: input.size,
        count: input.count,
        seconds: normalizeHostTextOption(input.seconds),
        vquality: normalizeHostTextOption(input.resolution),
        generateAudio: normalizeHostBooleanOption(input.generateAudio),
        watermark: normalizeHostBooleanOption(input.watermark),
      }),
    },
  ]
  if (input.autoRun) ops.push({ type: 'run_generation', nodeId: id, mode, prompt })
  return ops
}

function movedNodePosition(nodes: CanvasNode[], item: CanvasHostMoveNodesInput['items'][number]): Point {
  const current = nodes.find((node) => node.id === item.id)
  return {
    x: item.x ?? ((current?.position.x ?? 0) + (item.dx ?? 0)),
    y: item.y ?? ((current?.position.y ?? 0) + (item.dy ?? 0)),
  }
}

function configNodeTitle(mode: CanvasGenerationMode) {
  if (mode === 'video') return '视频生成'
  if (mode === 'text') return '文本生成'
  return '图片生成'
}

function cleanHostMetadata(metadata: Partial<CanvasNode['metadata']>) {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== '')) as Partial<CanvasNode['metadata']>
}

function normalizeHostTextOption(value: string | number | undefined): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return typeof value === 'string' ? value : undefined
}

function normalizeHostBooleanOption(value: boolean | string | undefined): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function nodeTypeFromMime(mimeType: string): NodeKind {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'text'
}

function materializeGenerationRequests(
  project: CanvasProject,
  requests: CanvasAgentGenerationRequest[],
  createId: (prefix?: string) => string,
  now: () => string,
): { project: CanvasProject; selectedNodeIds?: string[] } {
  return requests.reduce<{ project: CanvasProject; selectedNodeIds?: string[] }>(
    (state, request) => materializeGenerationRequest(state.project, request, createId, now),
    { project },
  )
}

function materializeGenerationRequest(
  project: CanvasProject,
  request: CanvasAgentGenerationRequest,
  createId: (prefix?: string) => string,
  now: () => string,
): { project: CanvasProject; selectedNodeIds?: string[] } {
  const sourceNode = project.nodes.find((node) => node.id === request.nodeId)
  if (!sourceNode) return { project }
  const context = sourceNode.type === 'text' && request.mode === 'image'
    ? buildTextNodeImageGenerationContext(sourceNode.id, project.nodes, project.connections)
    : buildCanvasGenerationContext(sourceNode.id, withGenerationMode(project.nodes, sourceNode.id, request.mode), project.connections)

  if (!context.ready) {
    return {
      project: {
        ...project,
        nodes: project.nodes.map((node) => (
          node.id === sourceNode.id
            ? { ...node, metadata: { ...node.metadata, status: 'error', errorDetails: context.warnings[0] } }
            : node
        )),
        updatedAt: now(),
      },
      selectedNodeIds: [sourceNode.id],
    }
  }

  const createdAt = now()
  const generationPayload = buildCanvasGenerationPayload(context, createdAt)
  const outputType = outputTypeForMode(request.mode)
  const taskNode = createCanvasNode(outputType, generationTaskPositionForSource(sourceNode, project.nodes, project.connections), {
    createId: () => createId('task'),
    patch: {
      title: generationTaskTitle(request.mode),
      width: outputType === 'text' ? 320 : outputType === 'video' ? 360 : 320,
      height: outputType === 'text' ? 220 : outputType === 'video' ? 250 : 240,
      metadata: {
        status: 'idle',
        prompt: context.prompt,
        content: '',
        generationPayload,
        model: context.model,
        size: context.size,
        count: context.count,
      },
    },
  })
  const withTask: CanvasProject = {
    ...project,
    nodes: project.nodes
      .map((node) => (
        node.id === sourceNode.id
          ? {
              ...node,
              metadata: {
                ...node.metadata,
                status: 'success' as const,
                errorDetails: '',
                generatedAt: createdAt,
                generationPayload,
                outputNodeId: taskNode.id,
              },
            }
          : node
      ))
      .concat(taskNode),
    updatedAt: createdAt,
  }

  return {
    project: addConnectionToProject(withTask, { id: createId(), fromNodeId: sourceNode.id, toNodeId: taskNode.id }),
    selectedNodeIds: [taskNode.id],
  }
}

function withGenerationMode(nodes: CanvasNode[], nodeId: string, mode: CanvasGenerationMode) {
  return nodes.map((node) => (
    node.id === nodeId
      ? { ...node, metadata: { ...node.metadata, generationMode: mode } }
      : node
  ))
}

function outputTypeForMode(mode: CanvasGenerationMode): NodeKind {
  if (mode === 'video') return 'video'
  if (mode === 'text') return 'text'
  return 'image'
}

function generationTaskTitle(mode: CanvasGenerationMode) {
  if (mode === 'video') return '视频生成任务'
  if (mode === 'text') return '文本生成任务'
  return '图片生成任务'
}

function cloneSnapshot(snapshot: CanvasAgentSnapshot): CanvasAgentSnapshot {
  return {
    project: snapshot.project,
    selectedNodeIds: [...snapshot.selectedNodeIds],
    selectedConnectionId: snapshot.selectedConnectionId,
  }
}
