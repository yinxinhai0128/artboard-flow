import type { CanvasConnection, CanvasNode, CanvasProject, NodeKind } from './types'

export type CanvasGraphNode = {
  id: string
  type: NodeKind
  title: string
  groupId?: string
  splitSourceNodeId?: string
  incoming: Array<{ connectionId: string; nodeId: string }>
  outgoing: Array<{ connectionId: string; nodeId: string }>
  incomingCount: number
  outgoingCount: number
}

export type CanvasGraphSnapshot = {
  projectId: string
  title: string
  nodeCount: number
  connectionCount: number
  nodeTypes: Partial<Record<NodeKind, number>>
  nodes: CanvasGraphNode[]
}

export function relationCountsForProject(project: CanvasProject) {
  return relationCountsForNodes(project.nodes, project.connections)
}

export function relationCountsForNodes(nodes: CanvasNode[], connections: CanvasConnection[]) {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const counts = new Map<string, { incoming: number; outgoing: number }>()
  nodes.forEach((node) => counts.set(node.id, { incoming: 0, outgoing: 0 }))
  connections.forEach((connection) => {
    if (!nodeIds.has(connection.fromNodeId) || !nodeIds.has(connection.toNodeId)) return
    counts.get(connection.fromNodeId)!.outgoing += 1
    counts.get(connection.toNodeId)!.incoming += 1
  })
  return counts
}

export function createCanvasGraphSnapshot(project: CanvasProject): CanvasGraphSnapshot {
  const nodeIds = new Set(project.nodes.map((node) => node.id))
  const relationMap = new Map<string, { incoming: CanvasGraphNode['incoming']; outgoing: CanvasGraphNode['outgoing'] }>()
  const nodeTypes: Partial<Record<NodeKind, number>> = {}

  project.nodes.forEach((node) => {
    relationMap.set(node.id, { incoming: [], outgoing: [] })
    nodeTypes[node.type] = (nodeTypes[node.type] ?? 0) + 1
  })

  project.connections.forEach((connection) => {
    if (!nodeIds.has(connection.fromNodeId) || !nodeIds.has(connection.toNodeId)) return
    relationMap.get(connection.fromNodeId)?.outgoing.push({ connectionId: connection.id, nodeId: connection.toNodeId })
    relationMap.get(connection.toNodeId)?.incoming.push({ connectionId: connection.id, nodeId: connection.fromNodeId })
  })

  return {
    projectId: project.id,
    title: project.title,
    nodeCount: project.nodes.length,
    connectionCount: project.connections.length,
    nodeTypes,
    nodes: project.nodes.map((node) => {
      const relations = relationMap.get(node.id) ?? { incoming: [], outgoing: [] }
      return {
        id: node.id,
        type: node.type,
        title: node.title,
        groupId: node.metadata.groupId,
        splitSourceNodeId: node.metadata.splitSourceNodeId,
        incoming: relations.incoming,
        outgoing: relations.outgoing,
        incomingCount: relations.incoming.length,
        outgoingCount: relations.outgoing.length,
      }
    }),
  }
}
