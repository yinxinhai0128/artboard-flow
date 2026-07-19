import type { CanvasConnection, CanvasProject } from './types'

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

export function deleteSelectionFromProject(project: CanvasProject, nodeIds: string[], connectionId: string | null): CanvasProject {
  const selected = new Set(nodeIds)
  return {
    ...project,
    nodes: project.nodes.filter((node) => !selected.has(node.id)),
    connections: project.connections.filter(
      (connection) => !selected.has(connection.fromNodeId) && !selected.has(connection.toNodeId) && connection.id !== connectionId,
    ),
  }
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
