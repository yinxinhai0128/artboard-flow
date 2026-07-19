import { describe, expect, it } from 'vitest'
import { addConnectionToProject, deleteSelectionFromProject, findConnectionDropTarget, nextNodeSelection, normalizeConnectionForProject } from './document'
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

const configNode = (id: string): CanvasNode => ({
  ...baseNode(id),
  type: 'config',
})

const imageNode = (id: string): CanvasNode => ({
  ...baseNode(id),
  type: 'image',
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
  it('keeps multi-selection stable while supporting additive toggles', () => {
    expect(nextNodeSelection(['a', 'b'], 'a', false)).toEqual(['a', 'b'])
    expect(nextNodeSelection(['a', 'b'], 'c', false)).toEqual(['c'])
    expect(nextNodeSelection(['a', 'b'], 'b', true)).toEqual(['a'])
    expect(nextNodeSelection(['a'], 'b', true)).toEqual(['a', 'b'])
  })

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

  it('removes deleted node references from config composers', () => {
    const source = {
      ...project,
      nodes: [
        baseNode('prompt'),
        baseNode('keep'),
        { ...configNode('config'), metadata: { composerContent: '生成 @[node:prompt] 并保留 @[node:keep]' } },
      ],
      connections: [
        { id: 'prompt-config', fromNodeId: 'prompt', toNodeId: 'config' },
        { id: 'keep-config', fromNodeId: 'keep', toNodeId: 'config' },
      ],
    }

    const next = deleteSelectionFromProject(source, ['prompt'], null)
    const config = next.nodes.find((node) => node.id === 'config')

    expect(config?.metadata.composerContent).toBe('生成 并保留 @[node:keep]')
  })

  it('removes disconnected input references only from the target config composer', () => {
    const source = {
      ...project,
      nodes: [
        baseNode('prompt'),
        { ...configNode('config-a'), metadata: { composerContent: 'A @[node:prompt]' } },
        { ...configNode('config-b'), metadata: { composerContent: 'B @[node:prompt]' } },
      ],
      connections: [
        { id: 'prompt-config-a', fromNodeId: 'prompt', toNodeId: 'config-a' },
        { id: 'prompt-config-b', fromNodeId: 'prompt', toNodeId: 'config-b' },
      ],
    }

    const next = deleteSelectionFromProject(source, [], 'prompt-config-a')
    const configA = next.nodes.find((node) => node.id === 'config-a')
    const configB = next.nodes.find((node) => node.id === 'config-b')

    expect(configA?.metadata.composerContent).toBe('A')
    expect(configB?.metadata.composerContent).toBe('B @[node:prompt]')
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

  it('normalizes connection direction around config nodes', () => {
    const source = {
      ...project,
      nodes: [baseNode('prompt'), imageNode('image'), configNode('config'), configNode('config-2')],
      connections: [],
    }

    expect(normalizeConnectionForProject(source, 'prompt', 'config', 'source')).toEqual({ fromNodeId: 'prompt', toNodeId: 'config' })
    expect(normalizeConnectionForProject(source, 'prompt', 'config', 'target')).toEqual({ fromNodeId: 'prompt', toNodeId: 'config' })
    expect(normalizeConnectionForProject(source, 'config', 'prompt', 'target')).toEqual({ fromNodeId: 'prompt', toNodeId: 'config' })
    expect(normalizeConnectionForProject(source, 'prompt', 'image', 'target')).toEqual({ fromNodeId: 'prompt', toNodeId: 'image' })
    expect(normalizeConnectionForProject(source, 'config', 'config-2', 'source')).toBeNull()
  })

  it('finds connection drop targets by node body, handle radius, and invalid nearby nodes', () => {
    const source = {
      ...project,
      nodes: [
        { ...baseNode('prompt'), position: { x: 0, y: 0 }, width: 100, height: 80 },
        { ...imageNode('image'), position: { x: 220, y: 0 }, width: 100, height: 80 },
        { ...configNode('config'), position: { x: 420, y: 0 }, width: 100, height: 80 },
        { ...configNode('config-2'), position: { x: 620, y: 0 }, width: 100, height: 80 },
      ],
      connections: [],
    }

    expect(findConnectionDropTarget(source, { x: 250, y: 30 }, { nodeId: 'prompt', handleType: 'source' }, 1)).toEqual({ nodeId: 'image', isNearNode: true, blockedNodeId: null })
    expect(findConnectionDropTarget(source, { x: 419, y: 40 }, { nodeId: 'prompt', handleType: 'source' }, 1)).toEqual({ nodeId: 'config', isNearNode: true, blockedNodeId: null })
    expect(findConnectionDropTarget(source, { x: 620, y: 40 }, { nodeId: 'config', handleType: 'source' }, 1)).toEqual({ nodeId: null, isNearNode: true, blockedNodeId: 'config-2' })
    expect(findConnectionDropTarget(source, { x: 900, y: 300 }, { nodeId: 'prompt', handleType: 'source' }, 1)).toEqual({ nodeId: null, isNearNode: false, blockedNodeId: null })
  })

  it('prevents config-to-config connections in the document layer', () => {
    const source = {
      ...project,
      nodes: [configNode('config-a'), configNode('config-b')],
      connections: [],
    }

    expect(addConnectionToProject(source, { id: 'config-edge', fromNodeId: 'config-a', toNodeId: 'config-b' }).connections).toHaveLength(0)
  })
})
