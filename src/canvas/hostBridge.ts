import { applyCanvasAgentOps, createCanvasGenerationFlowOps, type CanvasAgentOp, type CanvasAgentSnapshot, type CanvasAgentGenerationRequest } from './agentOps'
import { addConnectionToProject } from './document'
import { buildCanvasGenerationContext, buildCanvasGenerationPayload, buildTextNodeImageGenerationContext, generationTaskPositionForSource } from './generation'
import { createCanvasNode } from './nodeFactory'
import type { CanvasAssetRecord, CanvasAssetUpload, CanvasGenerationMode, CanvasNode, CanvasProject, NodeKind, Point } from './types'

type CanvasHostBridgeOptions = {
  getSnapshot: () => CanvasAgentSnapshot
  commit: (snapshot: CanvasAgentSnapshot) => void
  createId?: (prefix?: string) => string
  now?: () => string
  assets?: CanvasHostAssetAdapter
}

type CanvasGenerationFlowInput = Parameters<typeof createCanvasGenerationFlowOps>[0]
type CanvasHostAssetAdapter = {
  list: () => Promise<CanvasAssetRecord[]> | CanvasAssetRecord[]
  add: (dataUrl: string) => Promise<CanvasAssetUpload> | CanvasAssetUpload
}
type CanvasHostAssetFilter = {
  kind?: CanvasAssetRecord['kind'] | 'all'
}
type CanvasHostAssetNodeInput = {
  dataUrl: string
  title?: string
  position?: Point
  x?: number
  y?: number
}

export type CanvasHostBridgeApplyResult = CanvasAgentSnapshot & {
  generationRequests: CanvasAgentGenerationRequest[]
}
export type CanvasHostBridgeAssetNodeResult = CanvasHostBridgeApplyResult & {
  asset: CanvasAssetUpload
}

export type CanvasHostBridge = {
  getSnapshot: () => CanvasAgentSnapshot
  applyOps: (ops?: CanvasAgentOp[]) => CanvasHostBridgeApplyResult
  createGenerationFlow: (input: CanvasGenerationFlowInput) => CanvasHostBridgeApplyResult
  listAssets: (filter?: CanvasHostAssetFilter) => Promise<CanvasAssetRecord[]>
  addAsset: (input: { dataUrl: string }) => Promise<CanvasAssetUpload>
  addAssetNode: (input: CanvasHostAssetNodeInput) => Promise<CanvasHostBridgeAssetNodeResult>
  undo: () => CanvasAgentSnapshot | null
  canUndo: () => boolean
}

export function createCanvasHostBridge(options: CanvasHostBridgeOptions): CanvasHostBridge {
  const createId = options.createId ?? ((prefix = 'id') => `${prefix}-${crypto.randomUUID()}`)
  const now = options.now ?? (() => new Date().toISOString())
  let undoSnapshot: CanvasAgentSnapshot | null = null

  const applyOps = (ops: CanvasAgentOp[] = []): CanvasHostBridgeApplyResult => {
    const before = cloneSnapshot(options.getSnapshot())
    const applied = applyCanvasAgentOps(before, ops, { createId: () => createId(), now })
    const materialized = materializeGenerationRequests(applied.project, applied.generationRequests, createId, now)
    const next: CanvasHostBridgeApplyResult = {
      project: materialized.project,
      selectedNodeIds: materialized.selectedNodeIds ?? applied.selectedNodeIds,
      selectedConnectionId: null,
      generationRequests: applied.generationRequests,
    }
    undoSnapshot = before
    options.commit(next)
    return next
  }

  return {
    getSnapshot: options.getSnapshot,
    applyOps,
    createGenerationFlow: (input) => applyOps(createCanvasGenerationFlowOps(input, { createId: (prefix) => createId(prefix) })),
    listAssets: async (filter = {}) => {
      const assets = await options.assets?.list()
      const list = assets ?? []
      return filter.kind && filter.kind !== 'all' ? list.filter((asset) => asset.kind === filter.kind) : list
    },
    addAsset: async (input) => {
      if (!options.assets) throw new Error('HOST_ASSETS_UNAVAILABLE')
      return options.assets.add(input.dataUrl)
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
    undo: () => {
      if (!undoSnapshot) return null
      const restored = undoSnapshot
      undoSnapshot = null
      options.commit(restored)
      return restored
    },
    canUndo: () => Boolean(undoSnapshot),
  }
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
