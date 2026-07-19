import type { CanvasConnection, CanvasProject } from './types'

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
  const hasSource = project.nodes.some((node) => node.id === connection.fromNodeId)
  const hasTarget = project.nodes.some((node) => node.id === connection.toNodeId)
  if (!hasSource || !hasTarget) return project
  const exists = project.connections.some((current) => current.fromNodeId === connection.fromNodeId && current.toNodeId === connection.toNodeId)
  if (exists) return project
  return {
    ...project,
    connections: [...project.connections, connection],
  }
}
