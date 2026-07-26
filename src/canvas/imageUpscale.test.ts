import { describe, expect, it } from 'vitest'
import { createUpscaledImageNodeInProject, resolveUpscaleSize } from './imageUpscale'
import type { CanvasNode, CanvasProject } from './types'

const imageNode = (id: string): CanvasNode => ({
  id,
  type: 'image',
  title: 'Key frame',
  position: { x: 100, y: 80 },
  width: 360,
  height: 240,
  metadata: {
    content: '/api/assets/source.png',
    prompt: 'cinematic hero frame',
    status: 'success',
    mimeType: 'image/png',
    naturalWidth: 1200,
    naturalHeight: 800,
    model: 'seed-image',
    size: '1200x800',
  },
})

const project: CanvasProject = {
  id: 'project-upscale',
  title: 'Upscale project',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  nodes: [imageNode('source')],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('image upscale', () => {
  it('preserves aspect ratio and clamps the target long edge', () => {
    expect(resolveUpscaleSize(120, 80, 240)).toEqual({ width: 240, height: 160 })
    expect(resolveUpscaleSize(120, 80, 5000)).toEqual({ width: 4096, height: 2731 })
    expect(resolveUpscaleSize(0, 80, 2048)).toEqual({ width: 1, height: 1 })
  })

  it('creates a connected upscaled image node from a source image', () => {
    const ids = ['upscale-node', 'upscale-edge']
    const result = createUpscaledImageNodeInProject(
      project,
      'source',
      {
        params: { targetLongEdge: 2048, algorithm: 'high' },
        asset: { url: '/api/assets/upscaled.png', storageKey: 'upscaled.png', mimeType: 'image/png', bytes: 99, extension: 'png' },
        width: 2048,
        height: 1365,
      },
      () => ids.shift()!,
    )

    expect(result?.nodeId).toBe('upscale-node')
    expect(result?.project.nodes.map((node) => [node.id, node.position, node.width, node.height])).toEqual([
      ['source', { x: 100, y: 80 }, 360, 240],
      ['upscale-node', { x: 556, y: 80 }, 360, 240],
    ])
    expect(result?.project.nodes[1].metadata).toMatchObject({
      content: '/api/assets/upscaled.png',
      storageKey: 'upscaled.png',
      prompt: 'cinematic hero frame',
      mimeType: 'image/png',
      bytes: 99,
      naturalWidth: 2048,
      naturalHeight: 1365,
      status: 'success',
      model: 'seed-image',
      size: '1200x800',
    })
    expect(result?.project.connections).toEqual([
      { id: 'upscale-edge', fromNodeId: 'source', toNodeId: 'upscale-node' },
    ])
  })

  it('refuses invalid sources and non-upscale outputs', () => {
    const input = {
      params: { targetLongEdge: 2048, algorithm: 'high' as const },
      asset: { url: '/api/assets/upscaled.png', storageKey: 'upscaled.png', mimeType: 'image/png', bytes: 99, extension: 'png' },
      width: 2048,
      height: 1365,
    }
    const textProject = { ...project, nodes: [{ ...imageNode('text'), type: 'text' as const, metadata: { content: 'not an image' } }] }
    const emptyImageProject = { ...project, nodes: [{ ...imageNode('empty'), metadata: {} }] }

    expect(createUpscaledImageNodeInProject(project, 'missing', input, () => 'id')).toBeNull()
    expect(createUpscaledImageNodeInProject(textProject, 'text', input, () => 'id')).toBeNull()
    expect(createUpscaledImageNodeInProject(emptyImageProject, 'empty', input, () => 'id')).toBeNull()
    expect(createUpscaledImageNodeInProject(project, 'source', { ...input, width: 1000, height: 667 }, () => 'id')).toBeNull()
  })
})
