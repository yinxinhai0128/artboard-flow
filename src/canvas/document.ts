import { sourcePort, targetPort } from './geometry'
import { CONFIG_REFERENCE_PATTERN } from './generation'
import type { CanvasConnection, CanvasProject, Point } from './types'

export type ConnectionDropTarget = {
  nodeId: string | null
  isNearNode: boolean
}

export const CONNECTION_HANDLE_HIT_RADIUS = 40
export const CONNECTION_NODE_HIT_PADDING = 32

export function nextNodeSelection(current: string[], nodeId: string, additive: boolean): string[] {
  const exists = current.includes(nodeId)
  if (!additive) return exists ? current : [nodeId]
  return exists ? current.filter((id) => id !== nodeId) : [...current, nodeId]
}

export function normalizeConnectionForProject(
  project: CanvasProject,
  firstNodeId: string,
  secondNodeId: string,
  firstHandleType: 'source' | 'target',
): Omit<CanvasConnection, 'id'> | null {
  const first = project.nodes.find((node) => node.id === firstNodeId)
  const second = project.nodes.find((node) => node.id === secondNodeId)
  if (!first || !second || first.id === second.id) return null
  if (first.type === 'config' && second.type === 'config') return null
  if (second.type === 'config') return { fromNodeId: first.id, toNodeId: second.id }
  if (first.type === 'config' && firstHandleType === 'target') return { fromNodeId: second.id, toNodeId: first.id }
  return { fromNodeId: first.id, toNodeId: second.id }
}

export function findConnectionDropTarget(
  project: CanvasProject,
  world: Point,
  draft: { nodeId: string; handleType: 'source' | 'target' },
  scale: number,
): ConnectionDropTarget {
  const normalizedScale = Math.max(scale, 0.05)
  const padding = CONNECTION_NODE_HIT_PADDING / normalizedScale
  const handleRadius = CONNECTION_HANDLE_HIT_RADIUS / normalizedScale
  let isNearNode = false
  let bestNodeId: string | null = null
  let bestPriority = Number.POSITIVE_INFINITY

  const nodes = [...project.nodes].reverse()

  nodes.forEach((node) => {
    const anchor = draft.handleType === 'source' ? targetPort(node) : sourcePort(node)
    const dx = world.x - anchor.x
    const dy = world.y - anchor.y
    const hitsHandle = dx * dx + dy * dy <= handleRadius * handleRadius
    const inside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height
    const near =
      world.x >= node.position.x - padding &&
      world.x <= node.position.x + node.width + padding &&
      world.y >= node.position.y - padding &&
      world.y <= node.position.y + node.height + padding
    if (!hitsHandle && !inside && !near) return
    isNearNode = true
    if (node.id === draft.nodeId || !normalizeConnectionForProject(project, draft.nodeId, node.id, draft.handleType)) return

    const priority = inside ? 0 : hitsHandle ? 1 : 2
    if (priority < bestPriority) {
      bestNodeId = node.id
      bestPriority = priority
    }
  })

  return { nodeId: bestNodeId, isNearNode }
}

export function deleteSelectionFromProject(project: CanvasProject, nodeIds: string[], connectionId: string | null): CanvasProject {
  const selected = new Set(nodeIds)
  const removedConnection = connectionId ? project.connections.find((connection) => connection.id === connectionId) : null
  const removedInputByConfig = new Map<string, Set<string>>()
  if (removedConnection) {
    const target = project.nodes.find((node) => node.id === removedConnection.toNodeId)
    if (target?.type === 'config') removedInputByConfig.set(target.id, new Set([removedConnection.fromNodeId]))
  }
  const deletedNodeIds = new Set(nodeIds)
  const nextNodes = project.nodes
    .filter((node) => !selected.has(node.id))
    .map((node) => {
      if (node.type !== 'config' || !node.metadata.composerContent) return node
      const scopedRemovedIds = removedInputByConfig.get(node.id)
      const removedIds = deletedNodeIds.size ? new Set([...deletedNodeIds, ...(scopedRemovedIds || [])]) : scopedRemovedIds
      if (!removedIds?.size) return node
      return {
        ...node,
        metadata: {
          ...node.metadata,
          composerContent: removeNodeReferences(node.metadata.composerContent, removedIds),
        },
      }
    })

  return {
    ...project,
    nodes: nextNodes,
    connections: project.connections.filter(
      (connection) => !selected.has(connection.fromNodeId) && !selected.has(connection.toNodeId) && connection.id !== connectionId,
    ),
  }
}

function removeNodeReferences(content: string, nodeIds: Set<string>) {
  return content
    .replace(CONFIG_REFERENCE_PATTERN, (token, nodeId: string) => (nodeIds.has(nodeId) ? '' : token))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function addConnectionToProject(project: CanvasProject, connection: CanvasConnection): CanvasProject {
  if (connection.fromNodeId === connection.toNodeId) return project
  const source = project.nodes.find((node) => node.id === connection.fromNodeId)
  const target = project.nodes.find((node) => node.id === connection.toNodeId)
  if (!source || !target) return project
  if (source.type === 'config' && target.type === 'config') return project
  const exists = project.connections.some((current) => current.fromNodeId === connection.fromNodeId && current.toNodeId === connection.toNodeId)
  if (exists) return project
  return {
    ...project,
    connections: [...project.connections, connection],
  }
}
