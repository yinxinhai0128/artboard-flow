import { addConnectionToProject, deleteSelectionFromProject } from './document'
import { createCanvasNode } from './nodeFactory'
import type { CanvasGenerationMode, CanvasNode, CanvasProject, NodeKind, Point, Viewport } from './types'

export type CanvasAgentOp =
  | {
      type: 'add_node'
      id?: string
      nodeType?: NodeKind
      title?: string
      position?: Point
      x?: number
      y?: number
      width?: number
      height?: number
      metadata?: Partial<CanvasNode['metadata']>
    }
  | { type: 'update_node'; id: string; patch?: Partial<CanvasNode>; metadata?: Partial<CanvasNode['metadata']> }
  | { type: 'delete_node'; id?: string; ids?: string[]; nodeType?: NodeKind }
  | { type: 'delete_connections'; id?: string; ids?: string[]; all?: boolean }
  | { type: 'connect_nodes'; id?: string; fromNodeId: string; toNodeId: string }
  | { type: 'set_viewport'; viewport: Viewport }
  | { type: 'select_nodes'; ids: string[] }
  | { type: 'run_generation'; nodeId: string; mode?: CanvasGenerationMode; prompt?: string }

export type CanvasAgentGenerationRequest = {
  nodeId: string
  mode: CanvasGenerationMode
  prompt: string
}

export type CanvasAgentSnapshot = {
  project: CanvasProject
  selectedNodeIds: string[]
  selectedConnectionId: string | null
}

type CanvasAgentOptions = {
  createId?: () => string
  now?: () => string
}

type CanvasGenerationFlowInput = {
  prompt: string
  mode?: CanvasGenerationMode
  title?: string
  x?: number
  y?: number
  referenceNodeIds?: string[]
  model?: string
  size?: string
  count?: number
  autoRun?: boolean
}

type CanvasGenerationFlowOptions = {
  createId?: (prefix: 'text' | 'config') => string
}

const nodeKinds = new Set<NodeKind>(['text', 'image', 'video', 'audio', 'config', 'group'])

export function createCanvasGenerationFlowOps(input: CanvasGenerationFlowInput, options: CanvasGenerationFlowOptions = {}): CanvasAgentOp[] {
  const mode = input.mode ?? 'image'
  const x = input.x ?? 0
  const y = input.y ?? 0
  const textId = options.createId?.('text') ?? `text-${crypto.randomUUID()}`
  const configId = options.createId?.('config') ?? `config-${crypto.randomUUID()}`
  const referenceNodeIds = input.referenceNodeIds?.filter(Boolean) ?? []
  const tokens = [`@[node:${textId}]`, ...referenceNodeIds.map((id) => `@[node:${id}]`)]
  const composerContent = tokens.join('\n')
  const ops: CanvasAgentOp[] = [
    {
      type: 'add_node',
      id: textId,
      nodeType: 'text',
      title: input.title || '提示词',
      position: { x, y },
      metadata: {
        content: input.prompt,
        prompt: input.prompt,
        status: 'success',
      },
    },
    {
      type: 'add_node',
      id: configId,
      nodeType: 'config',
      title: generationFlowTitle(mode),
      position: { x: x + 420, y },
      metadata: cleanMetadata({
        generationMode: mode,
        composerContent,
        prompt: composerContent,
        status: 'idle',
        model: input.model,
        size: input.size,
        count: input.count,
      }),
    },
    { type: 'connect_nodes', fromNodeId: textId, toNodeId: configId },
    ...referenceNodeIds.map((fromNodeId): CanvasAgentOp => ({ type: 'connect_nodes', fromNodeId, toNodeId: configId })),
    { type: 'select_nodes', ids: [configId] },
  ]
  if (input.autoRun) ops.push({ type: 'run_generation', nodeId: configId, mode, prompt: composerContent })
  return ops
}

export function applyCanvasAgentOps(snapshot: CanvasAgentSnapshot, ops: CanvasAgentOp[] = [], options: CanvasAgentOptions = {}) {
  const createId = options.createId ?? (() => crypto.randomUUID())
  const now = options.now ?? (() => new Date().toISOString())
  let project = snapshot.project
  let selectedNodeIds = snapshot.selectedNodeIds
  let selectedConnectionId = snapshot.selectedConnectionId
  const generationRequests: CanvasAgentGenerationRequest[] = []
  let changed = false

  for (const [index, op] of ops.entries()) {
    if (op.type === 'add_node') {
      const node = createAgentNode(op, createId, index)
      project = { ...project, nodes: [...project.nodes, node] }
      selectedNodeIds = [node.id]
      selectedConnectionId = null
      changed = true
    }

    if (op.type === 'update_node') {
      let updated = false
      const nextNodes = project.nodes.map((node) => {
        if (node.id !== op.id) return node
        updated = true
        const patch = op.patch ?? {}
        return {
          ...node,
          ...patch,
          id: node.id,
          type: node.type,
          metadata: { ...node.metadata, ...patch.metadata, ...op.metadata },
        }
      })
      if (updated) {
        project = { ...project, nodes: nextNodes }
        changed = true
      }
    }

    if (op.type === 'delete_node') {
      const ids = agentDeleteNodeIds(project, op)
      if (!ids.length) continue
      project = deleteSelectionFromProject(project, ids, null)
      const existing = new Set(project.nodes.map((node) => node.id))
      selectedNodeIds = selectedNodeIds.filter((id) => existing.has(id))
      selectedConnectionId = null
      changed = true
    }

    if (op.type === 'delete_connections') {
      const ids = new Set(op.ids ?? (op.id ? [op.id] : []))
      const connections = op.all ? [] : project.connections.filter((connection) => !ids.has(connection.id))
      if (connections.length !== project.connections.length) {
        project = { ...project, connections }
        selectedConnectionId = selectedConnectionId && connections.some((connection) => connection.id === selectedConnectionId) ? selectedConnectionId : null
        changed = true
      }
    }

    if (op.type === 'connect_nodes') {
      const next = addConnectionToProject(project, { id: op.id || createId(), fromNodeId: op.fromNodeId, toNodeId: op.toNodeId })
      if (next !== project) {
        project = next
        changed = true
      }
    }

    if (op.type === 'set_viewport') {
      project = { ...project, viewport: op.viewport }
      changed = true
    }

    if (op.type === 'select_nodes') {
      const existing = new Set(project.nodes.map((node) => node.id))
      selectedNodeIds = op.ids.filter((id) => existing.has(id))
      selectedConnectionId = null
    }

    if (op.type === 'run_generation') {
      const request = generationRequestFromOp(project, op)
      if (request) generationRequests.push(request)
    }
  }

  if (changed) project = { ...project, updatedAt: now() }
  return { project, selectedNodeIds, selectedConnectionId, generationRequests }
}

export function summarizeCanvasAgentOps(ops: CanvasAgentOp[] = []) {
  const counts = ops.reduce<Record<string, number>>((acc, op) => {
    acc[op.type] = (acc[op.type] ?? 0) + 1
    return acc
  }, {})
  return Object.entries(counts)
    .map(([type, count]) => `${operationLabel(type)} ${count}`)
    .join('、')
}

function createAgentNode(op: Extract<CanvasAgentOp, { type: 'add_node' }>, createId: () => string, index: number): CanvasNode {
  const nodeType = op.nodeType && nodeKinds.has(op.nodeType) ? op.nodeType : 'text'
  return createCanvasNode(nodeType, op.position || { x: op.x ?? index * 36, y: op.y ?? index * 36 }, {
    createId,
    patch: {
      id: op.id,
      title: op.title,
      width: op.width,
      height: op.height,
      metadata: op.metadata,
    },
  })
}

function agentDeleteNodeIds(project: CanvasProject, op: Extract<CanvasAgentOp, { type: 'delete_node' }>) {
  if (op.ids?.length) return op.ids
  if (op.id) return [op.id]
  if (op.nodeType) return project.nodes.filter((node) => node.type === op.nodeType).map((node) => node.id)
  return []
}

function generationFlowTitle(mode: CanvasGenerationMode) {
  if (mode === 'video') return '视频生成'
  if (mode === 'text') return '文本生成'
  return '图片生成'
}

function cleanMetadata(metadata: Partial<CanvasNode['metadata']>) {
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined && value !== '')) as Partial<CanvasNode['metadata']>
}

function operationLabel(type: string) {
  if (type === 'add_node') return '新增节点'
  if (type === 'update_node') return '更新节点'
  if (type === 'delete_node') return '删除节点'
  if (type === 'delete_connections') return '删除连线'
  if (type === 'connect_nodes') return '连接'
  if (type === 'set_viewport') return '调整视图'
  if (type === 'select_nodes') return '选择节点'
  if (type === 'run_generation') return '触发生成'
  return type
}

function generationRequestFromOp(project: CanvasProject, op: Extract<CanvasAgentOp, { type: 'run_generation' }>): CanvasAgentGenerationRequest | null {
  const node = project.nodes.find((item) => item.id === op.nodeId)
  if (!node) return null
  const mode = op.mode ?? node.metadata.generationMode ?? 'image'
  const prompt = (op.prompt ?? node.metadata.composerContent ?? node.metadata.prompt ?? node.metadata.content ?? '').trim()
  return { nodeId: node.id, mode, prompt }
}
