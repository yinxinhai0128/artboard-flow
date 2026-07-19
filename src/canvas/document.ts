import type { CanvasProject } from './types'

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
