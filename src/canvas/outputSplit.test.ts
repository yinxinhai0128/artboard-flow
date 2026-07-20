import { describe, expect, it } from 'vitest'
import { generationOutputsForNode, promoteSplitOutputInProject, splitGenerationOutputsInProject } from './outputSplit'
import type { CanvasNode, CanvasProject } from './types'

const imageNode = (patch: Partial<CanvasNode> = {}): CanvasNode => ({
  id: 'source',
  type: 'image',
  title: '风格图',
  position: { x: 100, y: 200 },
  width: 280,
  height: 220,
  ...patch,
  metadata: {
    ...patch.metadata,
  },
})

const projectWith = (nodes: CanvasNode[]): CanvasProject => ({
  id: 'project-1',
  title: '测试画布',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  nodes,
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
})

function idFactory(...ids: string[]) {
  let index = 0
  return () => ids[index++] ?? `extra-${index}`
}

describe('canvas generation output split', () => {
  it('lists only generation outputs with usable content', () => {
    const node = imageNode({
      metadata: {
        generationOutputs: [
          { content: 'data:image/png;base64,one', mimeType: 'image/png' },
          { content: '' },
          { content: 'data:image/png;base64,two', naturalWidth: 1024, naturalHeight: 768 },
        ],
      },
    })

    expect(generationOutputsForNode(node).map((output) => output.content)).toEqual([
      'data:image/png;base64,one',
      'data:image/png;base64,two',
    ])
  })

  it('splits multiple generated outputs into connected result nodes', () => {
    const source = imageNode({
      metadata: {
        prompt: '一只发光的小猫',
        model: 'test-model',
        size: '1024x1024',
        count: 2,
        generatedAt: '2026-07-19T12:00:00.000Z',
        generationOutputs: [
          { content: 'data:image/png;base64,one', mimeType: 'image/png', bytes: 11, naturalWidth: 800, naturalHeight: 600 },
          { content: 'data:image/png;base64,two', mimeType: 'image/png', bytes: 22, naturalWidth: 1024, naturalHeight: 768 },
        ],
      },
    })

    const result = splitGenerationOutputsInProject(projectWith([source]), 'source', idFactory('child-1', 'edge-1', 'child-2', 'edge-2'))

    expect(result?.nodeIds).toEqual(['child-1', 'child-2'])
    expect(result?.project.nodes).toHaveLength(3)
    expect(result?.project.connections).toEqual([
      { id: 'edge-1', fromNodeId: 'source', toNodeId: 'child-1' },
      { id: 'edge-2', fromNodeId: 'source', toNodeId: 'child-2' },
    ])
    expect(result?.project.nodes[1]).toMatchObject({
      id: 'child-1',
      type: 'image',
      title: '风格图 · 结果 1',
      position: { x: 500, y: 200 },
      width: 280,
      height: 220,
      metadata: {
        content: 'data:image/png;base64,one',
        status: 'success',
        prompt: '一只发光的小猫',
        mimeType: 'image/png',
        bytes: 11,
        naturalWidth: 800,
        naturalHeight: 600,
        splitSourceNodeId: 'source',
        splitOutputIndex: 0,
        model: 'test-model',
        size: '1024x1024',
        count: 2,
        generatedAt: '2026-07-19T12:00:00.000Z',
      },
    })
    expect(result?.project.nodes[2].position).toEqual({ x: 500, y: 440 })
  })

  it('does not duplicate already split result nodes', () => {
    const source = imageNode({
      metadata: {
        generationOutputs: [
          { content: 'data:image/png;base64,one' },
          { content: 'data:image/png;base64,two' },
        ],
      },
    })
    const existingChild = imageNode({
      id: 'existing-child',
      title: '结果 1',
      position: { x: 500, y: 200 },
      metadata: { splitSourceNodeId: 'source', splitOutputIndex: 0, content: 'data:image/png;base64,one' },
    })

    const result = splitGenerationOutputsInProject(
      { ...projectWith([source, existingChild]), connections: [{ id: 'existing-edge', fromNodeId: 'source', toNodeId: 'existing-child' }] },
      'source',
      idFactory('child-2', 'edge-2'),
    )

    expect(result?.nodeIds).toEqual(['child-2'])
    expect(result?.project.nodes.map((node) => node.id)).toEqual(['source', 'existing-child', 'child-2'])
    expect(result?.project.connections).toEqual([
      { id: 'existing-edge', fromNodeId: 'source', toNodeId: 'existing-child' },
      { id: 'edge-2', fromNodeId: 'source', toNodeId: 'child-2' },
    ])
  })

  it('does not split unsupported or single-output nodes', () => {
    const source = imageNode({ metadata: { generationOutputs: [{ content: 'data:image/png;base64,one' }] } })
    const text = { ...source, id: 'text-1', type: 'text' as const }
    const config = { ...source, id: 'config-1', type: 'config' as const }

    expect(splitGenerationOutputsInProject(projectWith([source]), 'source', idFactory('unused'))).toBeNull()
    expect(splitGenerationOutputsInProject(projectWith([text]), 'text-1', idFactory('unused'))).toBeNull()
    expect(splitGenerationOutputsInProject(projectWith([config]), 'config-1', idFactory('unused'))).toBeNull()
    expect(splitGenerationOutputsInProject(projectWith([]), 'missing', idFactory('unused'))).toBeNull()
  })

  it('promotes a split result node back to the source active output', () => {
    const source = imageNode({
      metadata: {
        content: 'data:image/png;base64,one',
        activeOutputIndex: 0,
        generationOutputs: [
          { content: 'data:image/png;base64,one', mimeType: 'image/png', naturalWidth: 64, naturalHeight: 64 },
          { content: 'data:image/png;base64,two', mimeType: 'image/png', naturalWidth: 128, naturalHeight: 96 },
        ],
      },
    })
    const child = imageNode({
      id: 'child-2',
      title: 'Result 2',
      width: 320,
      height: 240,
      metadata: {
        content: 'data:image/png;base64,two',
        mimeType: 'image/png',
        naturalWidth: 128,
        naturalHeight: 96,
        splitSourceNodeId: 'source',
        splitOutputIndex: 1,
        generatedAt: '2026-07-19T12:00:00.000Z',
      },
    })

    const result = promoteSplitOutputInProject(projectWith([source, child]), 'child-2')
    const promotedSource = result?.nodes.find((node) => node.id === 'source')

    expect(promotedSource).toMatchObject({
      width: 320,
      height: 240,
      metadata: {
        content: 'data:image/png;base64,two',
        mimeType: 'image/png',
        naturalWidth: 128,
        naturalHeight: 96,
        activeOutputIndex: 1,
        generationOutputs: source.metadata.generationOutputs,
        generatedAt: '2026-07-19T12:00:00.000Z',
      },
    })
  })
})
