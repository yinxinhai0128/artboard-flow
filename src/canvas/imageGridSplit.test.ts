import { describe, expect, it } from 'vitest'
import { splitImageNodeIntoGrid } from './imageGridSplit'
import type { CanvasNode, CanvasProject } from './types'

const imageNode = (id: string): CanvasNode => ({
  id,
  type: 'image',
  title: 'Storyboard',
  position: { x: 100, y: 80 },
  width: 320,
  height: 200,
  metadata: {
    content: '/api/assets/source.png',
    prompt: 'wide establishing shot',
    status: 'success',
    mimeType: 'image/png',
    naturalWidth: 640,
    naturalHeight: 400,
  },
})

const project: CanvasProject = {
  id: 'project-grid',
  title: 'Grid split',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  nodes: [imageNode('source')],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('image grid split', () => {
  it('creates positioned image children and source relations for every grid piece', () => {
    const ids = ['piece-a', 'piece-b', 'piece-c', 'piece-d', 'edge-a', 'edge-b', 'edge-c', 'edge-d']
    const result = splitImageNodeIntoGrid(
      project,
      'source',
      {
        rows: 2,
        columns: 2,
        pieces: [
          { row: 0, column: 0, asset: { url: '/api/assets/a.png', storageKey: 'a.png', mimeType: 'image/png', bytes: 10, extension: 'png' }, width: 320, height: 200 },
          { row: 0, column: 1, asset: { url: '/api/assets/b.png', storageKey: 'b.png', mimeType: 'image/png', bytes: 11, extension: 'png' }, width: 320, height: 200 },
          { row: 1, column: 0, asset: { url: '/api/assets/c.png', storageKey: 'c.png', mimeType: 'image/png', bytes: 12, extension: 'png' }, width: 320, height: 200 },
          { row: 1, column: 1, asset: { url: '/api/assets/d.png', storageKey: 'd.png', mimeType: 'image/png', bytes: 13, extension: 'png' }, width: 320, height: 200 },
        ],
      },
      () => ids.shift()!,
    )

    expect(result?.nodeIds).toEqual(['piece-a', 'piece-b', 'piece-c', 'piece-d'])
    expect(result?.project.nodes.map((node) => [node.id, node.position, node.width, node.height])).toEqual([
      ['source', { x: 100, y: 80 }, 320, 200],
      ['piece-a', { x: 516, y: 80 }, 160, 100],
      ['piece-b', { x: 692, y: 80 }, 160, 100],
      ['piece-c', { x: 516, y: 196 }, 160, 100],
      ['piece-d', { x: 692, y: 196 }, 160, 100],
    ])
    expect(result?.project.nodes.at(1)?.metadata).toMatchObject({
      content: '/api/assets/a.png',
      storageKey: 'a.png',
      prompt: 'wide establishing shot',
      splitSourceNodeId: 'source',
      splitOutputIndex: 0,
      status: 'success',
    })
    expect(result?.project.connections).toEqual([
      { id: 'edge-a', fromNodeId: 'source', toNodeId: 'piece-a' },
      { id: 'edge-b', fromNodeId: 'source', toNodeId: 'piece-b' },
      { id: 'edge-c', fromNodeId: 'source', toNodeId: 'piece-c' },
      { id: 'edge-d', fromNodeId: 'source', toNodeId: 'piece-d' },
    ])
  })

  it('refuses to split missing nodes, non-image nodes, and empty piece sets', () => {
    const textProject: CanvasProject = {
      ...project,
      nodes: [{ ...imageNode('text'), type: 'text', metadata: { content: 'not an image' } }],
    }
    const input = { rows: 1, columns: 1, pieces: [] }

    expect(splitImageNodeIntoGrid(project, 'missing', input, () => 'id')).toBeNull()
    expect(splitImageNodeIntoGrid(textProject, 'text', input, () => 'id')).toBeNull()
    expect(splitImageNodeIntoGrid(project, 'source', input, () => 'id')).toBeNull()
  })
})
