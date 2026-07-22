import { sourcePort, targetPort } from './geometry'
import { CONFIG_REFERENCE_PATTERN } from './resourceReferences'
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

export type CanvasClipboard = {
  nodes: CanvasNode[]
  connections: CanvasConnection[]
}

type CanvasClipboardFile = {
  app: 'artboard-flow'
  type: 'canvas-clipboard'
  version: 1
  clipboard: CanvasClipboard
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
  const source = firstHandleType === 'source' ? first : second
  const target = firstHandleType === 'source' ? second : first
  if (source.type === 'config' && !isGenerationTaskNode(target)) return null
  return { fromNodeId: source.id, toNodeId: target.id }
}

function hasConnection(project: CanvasProject, connection: Omit<CanvasConnection, 'id'>): boolean {
  return project.connections.some((current) => current.fromNodeId === connection.fromNodeId && current.toNodeId === connection.toNodeId)
}

export function resolveConnectionToNode(
  project: CanvasProject,
  draft: { nodeId: string; handleType: 'source' | 'target' },
  targetNodeId: string,
): Omit<CanvasConnection, 'id'> | null {
  if (draft.nodeId === targetNodeId) return null
  const connection = normalizeConnectionForProject(project, draft.nodeId, targetNodeId, draft.handleType)
  return connection && !hasConnection(project, connection) ? connection : null
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
    const connection = normalizeConnectionForProject(project, draft.nodeId, node.id, draft.handleType)
    if (node.id === draft.nodeId || !connection || hasConnection(project, connection)) {
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

export function findContainingGroupId(node: CanvasNode, nodes: CanvasNode[]) {
  if (node.type === 'group') return undefined
  const centerX = node.position.x + node.width / 2
  const centerY = node.position.y + node.height / 2
  return [...nodes]
    .reverse()
    .find((group) =>
      group.type === 'group' &&
      group.id !== node.id &&
      centerX >= group.position.x &&
      centerX <= group.position.x + group.width &&
      centerY >= group.position.y &&
      centerY <= group.position.y + group.height,
    )?.id
}

export function nodeBounds(nodes: CanvasNode[]) {
  return nodes.reduce(
    (bounds, node) => ({
      left: Math.min(bounds.left, node.position.x),
      top: Math.min(bounds.top, node.position.y),
      right: Math.max(bounds.right, node.position.x + node.width),
      bottom: Math.max(bounds.bottom, node.position.y + node.height),
    }),
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  )
}

export function findGroupDropTarget(nodes: CanvasNode[], nodeIds: string[]) {
  const movingIds = new Set(nodeIds)
  if (nodes.some((node) => movingIds.has(node.id) && node.type === 'group')) return null
  const movingNodes = nodes.filter((node) => movingIds.has(node.id) && node.type !== 'group')
  if (!movingNodes.length) return null

  return (
    [...nodes].reverse().find((group) => {
      if (group.type !== 'group' || movingIds.has(group.id)) return false
      return movingNodes.some((node) => {
        const centerX = node.position.x + node.width / 2
        const centerY = node.position.y + node.height / 2
        return centerX >= group.position.x && centerX <= group.position.x + group.width && centerY >= group.position.y && centerY <= group.position.y + group.height
      })
    }) ?? null
  )
}

export function snapNodesIntoGroup(project: CanvasProject, nodeIds: string[], group: CanvasNode): CanvasProject {
  const movingIds = new Set(nodeIds)
  const movingNodes = project.nodes.filter((node) => movingIds.has(node.id) && node.type !== 'group')
  if (!movingNodes.length) return project

  const pad = 24
  const bounds = nodeBounds(movingNodes)
  const left = group.position.x + pad
  const top = group.position.y + pad
  const right = group.position.x + group.width - pad
  const bottom = group.position.y + group.height - pad
  const dx = bounds.right - bounds.left > right - left ? left - bounds.left : bounds.left < left ? left - bounds.left : bounds.right > right ? right - bounds.right : 0
  const dy = bounds.bottom - bounds.top > bottom - top ? top - bounds.top : bounds.top < top ? top - bounds.top : bounds.bottom > bottom ? bottom - bounds.bottom : 0
  let changed = false

  const nodes = project.nodes.map((node) => {
    if (!movingIds.has(node.id) || node.type === 'group') return node
    const nextPosition = { x: node.position.x + dx, y: node.position.y + dy }
    const positionChanged = nextPosition.x !== node.position.x || nextPosition.y !== node.position.y
    if (!positionChanged && node.metadata.groupId === group.id) return node
    changed = true
    return { ...node, position: nextPosition, metadata: { ...node.metadata, groupId: group.id } }
  })

  return changed ? { ...project, nodes } : project
}

export function syncNodeGroupMembership(project: CanvasProject, nodeIds: string[]): CanvasProject {
  const movingIds = new Set(nodeIds)
  if (!project.nodes.some((node) => movingIds.has(node.id) && node.type !== 'group')) return project

  const targetGroup = findGroupDropTarget(project.nodes, nodeIds)
  if (targetGroup) return snapNodesIntoGroup(project, nodeIds, targetGroup)

  let changed = false
  const nodes = project.nodes.map((node) => {
    if (!movingIds.has(node.id) || node.type === 'group') return node
    const groupId = findContainingGroupId(node, project.nodes)
    if (node.metadata.groupId === groupId) return node
    changed = true
    return { ...node, metadata: { ...node.metadata, groupId } }
  })
  return changed ? { ...project, nodes } : project
}

export function copySelectionToClipboard(project: CanvasProject, nodeIds: string[]): CanvasClipboard | null {
  const selected = new Set(nodeIds)
  const nodes = project.nodes
    .filter((node) => selected.has(node.id))
    .map((node) => ({
      ...node,
      position: { ...node.position },
      metadata: { ...node.metadata },
    }))
  if (!nodes.length) return null
  return {
    nodes,
    connections: project.connections
      .filter((connection) => selected.has(connection.fromNodeId) && selected.has(connection.toNodeId))
      .map((connection) => ({ ...connection })),
  }
}

export function serializeCanvasClipboard(clipboard: CanvasClipboard | null) {
  if (!clipboard?.nodes.length) return ''
  return JSON.stringify({
    app: 'artboard-flow',
    type: 'canvas-clipboard',
    version: 1,
    clipboard,
  } satisfies CanvasClipboardFile)
}

export function parseCanvasClipboardText(text: string): CanvasClipboard | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!isCanvasClipboardFile(parsed)) return null
  const nodeIds = new Set(parsed.clipboard.nodes.map((node) => node.id))
  const connections = parsed.clipboard.connections.filter((connection) => nodeIds.has(connection.fromNodeId) && nodeIds.has(connection.toNodeId))
  return connections.length === parsed.clipboard.connections.length
    ? parsed.clipboard
    : { ...parsed.clipboard, connections }
}

function isCanvasClipboardFile(value: unknown): value is CanvasClipboardFile {
  if (!value || typeof value !== 'object') return false
  const file = value as CanvasClipboardFile
  return file.app === 'artboard-flow' &&
    file.type === 'canvas-clipboard' &&
    file.version === 1 &&
    Boolean(file.clipboard) &&
    Array.isArray(file.clipboard.nodes) &&
    file.clipboard.nodes.length > 0 &&
    file.clipboard.nodes.every(isClipboardNode) &&
    Array.isArray(file.clipboard.connections) &&
    file.clipboard.connections.every(isClipboardConnection)
}

function isClipboardNode(value: unknown): value is CanvasNode {
  if (!value || typeof value !== 'object') return false
  const node = value as CanvasNode
  return typeof node.id === 'string' &&
    typeof node.type === 'string' &&
    typeof node.title === 'string' &&
    isClipboardPoint(node.position) &&
    Number.isFinite(node.width) &&
    Number.isFinite(node.height) &&
    Boolean(node.metadata) &&
    typeof node.metadata === 'object' &&
    !Array.isArray(node.metadata)
}

function isClipboardConnection(value: unknown): value is CanvasConnection {
  if (!value || typeof value !== 'object') return false
  const connection = value as CanvasConnection
  return typeof connection.id === 'string' && typeof connection.fromNodeId === 'string' && typeof connection.toNodeId === 'string'
}

function isClipboardPoint(value: unknown): value is Point {
  return Boolean(value && typeof value === 'object' && Number.isFinite((value as Point).x) && Number.isFinite((value as Point).y))
}

export function pasteClipboardIntoProject(
  project: CanvasProject,
  clipboard: CanvasClipboard | null,
  createId: () => string,
  targetCenter?: Point,
): { project: CanvasProject; nodeIds: string[] } | null {
  if (!clipboard?.nodes.length) return null

  const bounds = nodeBounds(clipboard.nodes)
  const dx = targetCenter ? targetCenter.x - (bounds.left + bounds.right) / 2 : 36
  const dy = targetCenter ? targetCenter.y - (bounds.top + bounds.bottom) / 2 : 36
  const idMap = new Map(clipboard.nodes.map((node) => [node.id, createId()]))
  const nodes = clipboard.nodes.map((node) => {
    const groupId = node.metadata.groupId
    const metadata = { ...node.metadata }
    if (groupId) {
      const nextGroupId = idMap.get(groupId)
      if (nextGroupId) metadata.groupId = nextGroupId
      else delete metadata.groupId
    }
    const splitSourceNodeId = node.metadata.splitSourceNodeId
    if (splitSourceNodeId) {
      const nextSplitSourceNodeId = idMap.get(splitSourceNodeId)
      if (nextSplitSourceNodeId) metadata.splitSourceNodeId = nextSplitSourceNodeId
      else {
        delete metadata.splitSourceNodeId
        delete metadata.splitOutputIndex
      }
    }
    return {
      ...node,
      id: idMap.get(node.id)!,
      title: node.title.endsWith(' 副本') ? node.title : `${node.title} 副本`,
      position: { x: node.position.x + dx, y: node.position.y + dy },
      metadata,
    }
  })
  const connections = clipboard.connections.flatMap((connection) => {
    const fromNodeId = idMap.get(connection.fromNodeId)
    const toNodeId = idMap.get(connection.toNodeId)
    if (!fromNodeId || !toNodeId) return []
    return [{ ...connection, id: createId(), fromNodeId, toNodeId }]
  })

  return {
    project: {
      ...project,
      nodes: [...project.nodes, ...nodes],
      connections: [...project.connections, ...connections],
    },
    nodeIds: nodes.map((node) => node.id),
  }
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
  if (source.type === 'config' && !isGenerationTaskNode(target)) return project
  if (hasConnection(project, connection)) return project
  return {
    ...project,
    connections: [...project.connections, connection],
  }
}

function isGenerationTaskNode(node: CanvasNode) {
  return Boolean(node.metadata.generationPayload)
}
