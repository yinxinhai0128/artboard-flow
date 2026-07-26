import { describe, expect, it } from 'vitest'
import { createCroppedImageNodeInProject } from './imageCrop'
import type { CanvasNode, CanvasProject } from './types'

const imageNode = (id: string): CanvasNode => ({
  id,
  type: 'image',
  title: 'Wide shot',
  position: { x: 100, y: 80 },
  width: 400,
  height: 240,
  metadata: {
    content: '/api/assets/source.png',
    prompt: 'cinematic wide shot',
    status: 'success',
    mimeType: 'image/png',
    naturalWidth: 1000,
    naturalHeight: 600,
  },
})

const project: CanvasProject = {
  id: 'project-crop',
  title: 'Crop project',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  nodes: [imageNode('source')],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('image crop', () => {
  it('creates a connected cropped image node from a source image', () => {
    const result = createCroppedImageNodeInProject(
      project,
      'source',
      {
        crop: { x: 0.1, y: 0.2, width: 0.5, height: 0.25 },
        asset: { url: '/api/assets/crop.png', storageKey: 'crop.png', mimeType: 'image/png', bytes: 42, extension: 'png' },
        width: 500,
        height: 150,
      },
      (() => {
        const ids = ['crop-node', 'crop-edge']
        return () => ids.shift()!
      })(),
    )

    expect(result?.nodeId).toBe('crop-node')
    expect(result?.project.nodes.map((node) => [node.id, node.position, node.width, node.height])).toEqual([
      ['source', { x: 100, y: 80 }, 400, 240],
      ['crop-node', { x: 596, y: 80 }, 200, 60],
    ])
    expect(result?.project.nodes[1].metadata).toMatchObject({
      content: '/api/assets/crop.png',
      storageKey: 'crop.png',
      prompt: 'cinematic wide shot',
      mimeType: 'image/png',
      bytes: 42,
      naturalWidth: 500,
      naturalHeight: 150,
      status: 'success',
    })
    expect(result?.project.connections).toEqual([
      { id: 'crop-edge', fromNodeId: 'source', toNodeId: 'crop-node' },
    ])
  })

  it('refuses missing, non-image, contentless, and empty crop results', () => {
    const input = {
      crop: { x: 0, y: 0, width: 1, height: 1 },
      asset: { url: '/api/assets/crop.png', storageKey: 'crop.png', mimeType: 'image/png', bytes: 42, extension: 'png' },
      width: 500,
      height: 150,
    }
    const textProject = { ...project, nodes: [{ ...imageNode('text'), type: 'text' as const }] }
    const emptyImageProject = { ...project, nodes: [{ ...imageNode('empty'), metadata: {} }] }

    expect(createCroppedImageNodeInProject(project, 'missing', input, () => 'id')).toBeNull()
    expect(createCroppedImageNodeInProject(textProject, 'text', input, () => 'id')).toBeNull()
    expect(createCroppedImageNodeInProject(emptyImageProject, 'empty', input, () => 'id')).toBeNull()
    expect(createCroppedImageNodeInProject(project, 'source', { ...input, crop: { x: 0, y: 0, width: 0, height: 1 } }, () => 'id')).toBeNull()
    expect(createCroppedImageNodeInProject(project, 'source', { ...input, crop: { x: Number.NaN, y: 0, width: 1, height: 1 } }, () => 'id')).toBeNull()
  })
})
