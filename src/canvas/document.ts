import { sourcePort, targetPort } from './geometry'
import { CONFIG_REFERENCE_PATTERN } from './generation'
import type { CanvasConnection, CanvasNode, CanvasProject, Point } from './types'

export type ConnectionDropTarget = {
  nodeId: string | null
  isNearNode: boolean
  blockedNodeId: string | null
}

export type NodeRelations = {
  incoming: Array<{ connectionId: string; node: CanvasNode }>
  outgoing: Array<{ connectionId: string; node: CanvasNode }>
}

export type ConnectionNodePair = {
  connection: CanvasConnection
  from: CanvasNode
  to: CanvasNode
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
  if (first.type === 'group' || second.type === 'group') return null
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
  let bestBlockedNodeId: string | null = null
  let bestPriority = Number.POSITIVE_INFINITY
  let bestBlockedPriority = Number.POSITIVE_INFINITY

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

    const priority = inside ? 0 : hitsHandle ? 1 : 2
    if (node.id === draft.nodeId || !normalizeConnectionForProject(project, draft.nodeId, node.id, draft.handleType)) {
      if (priority < bestBlockedPriority) {
        bestBlockedNodeId = node.id
        bestBlockedPriority = priority
      }
      return
    }

    if (priority < bestPriority) {
      bestNodeId = node.id
      bestPriority = priority
    }
  })

  return { nodeId: bestNodeId, isNearNode, blockedNodeId: bestNodeId ? null : bestBlockedNodeId }
}

export function getNodeRelations(project: CanvasProject, nodeId: string): NodeRelations {
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]))
  const incoming: NodeRelations['incoming'] = []
  const outgoing: NodeRelations['outgoing'] = []

  project.connections.forEach((connection) => {
    if (connection.toNodeId === nodeId) {
      const node = nodesById.get(connection.fromNodeId)
      if (node) incoming.push({ connectionId: connection.id, node })
    }
    if (connection.fromNodeId === nodeId) {
      const node = nodesById.get(connection.toNodeId)
      if (node) outgoing.push({ connectionId: connection.id, node })
    }
  })

  return { incoming, outgoing }
}

export function getConnectionNodePair(project: CanvasProject, connectionId: string): ConnectionNodePair | null {
  const connection = project.connections.find((item) => item.id === connectionId)
  if (!connection) return null
  const from = project.nodes.find((node) => node.id === connection.fromNodeId)
  const to = project.nodes.find((node) => node.id === connection.toNodeId)
  return from && to ? { connection, from, to } : null
}

export function splitChildIdsForNode(nodes: CanvasNode[], nodeId: string) {
  return nodes
    .filter((node) => node.metadata.splitSourceNodeId === nodeId)
    .toSorted((a, b) => (a.metadata.splitOutputIndex ?? 0) - (b.metadata.splitOutputIndex ?? 0))
    .map((node) => node.id)
}

export function groupChildIdsForNode(nodes: CanvasNode[], nodeId: string) {
  return nodes
    .filter((node) => node.metadata.groupId === nodeId)
    .map((node) => node.id)
}

export function expandNodeIdsWithSplitChildren(nodes: CanvasNode[], nodeIds: string[]) {
  const expanded = new Set(nodeIds)
  nodeIds.forEach((nodeId) => splitChildIdsForNode(nodes, nodeId).forEach((childId) => expanded.add(childId)))
  return Array.from(expanded)
}

export function expandNodeIdsForMovement(nodes: CanvasNode[], nodeIds: string[]) {
  const expanded = new Set(expandNodeIdsWithSplitChildren(nodes, nodeIds))
  nodeIds.forEach((nodeId) => groupChildIdsForNode(nodes, nodeId).forEach((childId) => expanded.add(childId)))
  return Array.from(expanded)
}

export function isHiddenSplitChild(node: CanvasNode, nodes: CanvasNode[]) {
  const sourceId = node.metadata.splitSourceNodeId
  if (!sourceId) return false
  const source = nodes.find((item) => item.id === sourceId)
  return Boolean(source?.metadata.splitChildrenCollapsed)
}

export function isSplitConnectionHidden(connection: CanvasConnection, nodes: CanvasNode[]) {
  const from = nodes.find((node) => node.id === connection.fromNodeId)
  const to = nodes.find((node) => node.id === connection.toNodeId)
  return Boolean((from && isHiddenSplitChild(from, nodes)) || (to && isHiddenSplitChild(to, nodes)))
}

export function deleteSelectionFromProject(project: CanvasProject, nodeIds: string[], connectionId: string | null): CanvasProject {
  const expandedNodeIds = expandNodeIdsWithSplitChildren(project.nodes, nodeIds)
  const selected = new Set(expandedNodeIds)
  const selectedGroups = new Set(project.nodes.filter((node) => selected.has(node.id) && node.type === 'group').map((node) => node.id))
  const removedConnection = connectionId ? project.connections.find((connection) => connection.id === connectionId) : null
  const removedInputByConfig = new Map<string, Set<string>>()
  if (removedConnection) {
    const target = project.nodes.find((node) => node.id === removedConnection.toNodeId)
    if (target?.type === 'config') removedInputByConfig.set(target.id, new Set([removedConnection.fromNodeId]))
  }
  const deletedNodeIds = new Set(expandedNodeIds)
  const nextNodes = project.nodes
    .filter((node) => !selected.has(node.id))
    .map((node) => {
      const groupId = node.metadata.groupId
      if (groupId && selectedGroups.has(groupId)) {
        return { ...node, metadata: { ...node.metadata, groupId: undefined } }
      }
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
  if (source.type === 'group' || target.type === 'group') return project
  if (source.type === 'config' && target.type === 'config') return project
  const exists = project.connections.some((current) => current.fromNodeId === connection.fromNodeId && current.toNodeId === connection.toNodeId)
  if (exists) return project
  return {
    ...project,
    connections: [...project.connections, connection],
  }
}
