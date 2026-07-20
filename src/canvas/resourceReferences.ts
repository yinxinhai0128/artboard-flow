import type { CanvasConnection, CanvasNode, CanvasResourceNodeKind } from './types'

export const CONFIG_REFERENCE_PATTERN = /@\[node:([^\]]+)\]/g

export type CanvasResourceReference = {
  id: string
  nodeId: string
  kind: CanvasResourceNodeKind
  label: string
  title: string
  previewUrl?: string
  text?: string
  active: boolean
}

export function buildNodeMentionReferences(node: CanvasNode, nodes: CanvasNode[], connections: CanvasConnection[]) {
  return labelResourceNodes(getMentionResourceNodes(node.id, nodes, connections), true)
}

export function getMentionResourceNodes(nodeId: string, nodes: CanvasNode[], connections: CanvasConnection[]) {
  const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections)
  if (configInputs.length) return configInputs
  const ownInputs = getConnectedResourceNodes(nodeId, nodes, connections)
  if (ownInputs.length) return ownInputs
  const node = nodes.find((item) => item.id === nodeId)
  return node && isResourceNode(node) ? [node] : []
}

export function getGenerationResourceNodes(nodeId: string, nodes: CanvasNode[], connections: CanvasConnection[]) {
  const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections)
  if (configInputs.length) return configInputs
  const ownInputs = getConnectedResourceNodes(nodeId, nodes, connections)
  if (ownInputs.length) return ownInputs
  return []
}

export function getConnectedResourceNodes(nodeId: string, nodes: CanvasNode[], connections: CanvasConnection[]) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return connections
    .filter((connection) => connection.toNodeId === nodeId)
    .flatMap((connection) => {
      const node = nodesById.get(connection.fromNodeId)
      return node && isResourceNode(node) ? [node] : []
    })
}

function getConnectedConfigResourceNodes(nodeId: string, nodes: CanvasNode[], connections: CanvasConnection[]) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const configConnection = connections.find((connection) => connection.fromNodeId === nodeId && nodesById.get(connection.toNodeId)?.type === 'config')
  if (!configConnection) return []
  return getConnectedResourceNodes(configConnection.toNodeId, nodes, connections).filter((node) => node.id !== nodeId)
}

function labelResourceNodes(nodes: CanvasNode[], active: boolean) {
  const counts: Record<CanvasResourceNodeKind, number> = { text: 0, image: 0, video: 0, audio: 0 }
  return nodes.flatMap((node): CanvasResourceReference[] => {
    const kind = resourceKind(node)
    if (!kind) return []
    const label = labelForKind(kind, counts[kind]++)
    return [
      {
        id: node.id,
        nodeId: node.id,
        kind,
        label,
        title: node.title || label,
        previewUrl: node.metadata.content,
        text: resourceText(node),
        active,
      },
    ]
  })
}

export function isResourceNode(node: CanvasNode) {
  return Boolean(resourceKind(node))
}

function resourceText(node: CanvasNode) {
  if (node.type !== 'text') return undefined
  return node.metadata.content || node.metadata.prompt
}

function resourceKind(node: CanvasNode): CanvasResourceNodeKind | null {
  if (node.type === 'config' || node.type === 'group') return null
  if (node.type === 'text' && resourceText(node)?.trim()) return 'text'
  if (node.type !== 'text' && node.metadata.content) return node.type
  return null
}

function labelForKind(kind: CanvasResourceNodeKind, index: number) {
  if (kind === 'image') return `图片${index + 1}`
  if (kind === 'video') return `视频${index + 1}`
  if (kind === 'audio') return `音频${index + 1}`
  return `文本${index + 1}`
}
