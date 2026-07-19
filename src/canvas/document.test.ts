import { describe, expect, it } from 'vitest'
import { addConnectionToProject, deleteSelectionFromProject } from './document'
import type { CanvasNode, CanvasProject } from './types'

const baseNode = (id: string): CanvasNode => ({
  id,
  type: 'text',
  title: id,
  position: { x: 0, y: 0 },
  width: 100,
  height: 80,
  metadata: {},
})

const project: CanvasProject = {
  id: 'project-1',
  title: '测试画布',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  nodes: [baseNode('a'), baseNode('b'), baseNode('c')],
  connections: [
    { id: 'ab', fromNodeId: 'a', toNodeId: 'b' },
    { id: 'bc', fromNodeId: 'b', toNodeId: 'c' },
    { id: 'ca', fromNodeId: 'c', toNodeId: 'a' },
  ],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('canvas document operations', () => {
  it('deletes selected nodes and all connected edges', () => {
    const next = deleteSelectionFromProject(project, ['b'], null)

    expect(next.nodes.map((node) => node.id)).toEqual(['a', 'c'])
    expect(next.connections.map((connection) => connection.id)).toEqual(['ca'])
  })

  it('deletes a selected connection without removing nodes', () => {
    const next = deleteSelectionFromProject(project, [], 'bc')

    expect(next.nodes).toHaveLength(3)
    expect(next.connections.map((connection) => connection.id)).toEqual(['ab', 'ca'])
  })

  it('adds a new connection when both nodes exist', () => {
    const source = { ...project, connections: [] }
    const next = addConnectionToProject(source, { id: 'new-edge', fromNodeId: 'a', toNodeId: 'b' })

    expect(next.connections).toEqual([{ id: 'new-edge', fromNodeId: 'a', toNodeId: 'b' }])
  })

  it('prevents duplicate, self, and missing-node connections', () => {
    const duplicate = addConnectionToProject(project, { id: 'duplicate', fromNodeId: 'a', toNodeId: 'b' })
    const self = addConnectionToProject(project, { id: 'self', fromNodeId: 'a', toNodeId: 'a' })
    const missing = addConnectionToProject(project, { id: 'missing', fromNodeId: 'a', toNodeId: 'missing' })

    expect(duplicate.connections).toHaveLength(3)
    expect(self.connections).toHaveLength(3)
    expect(missing.connections).toHaveLength(3)
  })
})
