import { describe, expect, it } from 'vitest'
import { buildMaskEditPrompt, createImageMaskEditTaskInProject } from './imageMaskEdit'
import type { CanvasNode, CanvasProject } from './types'

const imageNode = (id: string): CanvasNode => ({
  id,
  type: 'image',
  title: 'Portrait source',
  position: { x: 100, y: 80 },
  width: 320,
  height: 240,
  metadata: {
    content: '/api/assets/source.png',
    storageKey: 'source.png',
    prompt: 'cinematic portrait',
    status: 'success',
    mimeType: 'image/png',
    bytes: 1024,
    naturalWidth: 1200,
    naturalHeight: 900,
    model: 'image-model',
    size: '1536x1024',
  },
})

const project: CanvasProject = {
  id: 'project-mask-edit',
  title: 'Mask edit project',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  nodes: [imageNode('source')],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

const maskAsset = {
  url: '/api/assets/mask.png',
  storageKey: 'mask.png',
  mimeType: 'image/png',
  bytes: 128,
  extension: 'png',
}

describe('image mask edit task', () => {
  it('builds a prompt that preserves unmasked image areas', () => {
    expect(buildMaskEditPrompt('  change the jacket into blue silk  ')).toBe('只修改蒙版透明区域，其他区域保持不变。change the jacket into blue silk')
    expect(buildMaskEditPrompt('')).toBe('')
  })

  it('creates a connected image edit task carrying source image and mask payload', () => {
    const result = createImageMaskEditTaskInProject(
      project,
      'source',
      {
        prompt: 'change the jacket into blue silk',
        maskAsset,
        maskWidth: 1200,
        maskHeight: 900,
      },
      {
        createId: (() => {
          const ids = ['edit-node', 'edit-edge']
          return () => ids.shift()!
        })(),
        now: () => '2026-07-26T02:00:00.000Z',
      },
    )

    expect(result?.nodeId).toBe('edit-node')
    expect(result?.project.nodes.map((node) => [node.id, node.type, node.position, node.width, node.height])).toEqual([
      ['source', 'image', { x: 100, y: 80 }, 320, 240],
      ['edit-node', 'image', { x: 540, y: 104 }, 320, 240],
    ])
    expect(result?.project.connections).toEqual([
      { id: 'edit-edge', fromNodeId: 'source', toNodeId: 'edit-node' },
    ])
    expect(result?.project.nodes[1].metadata).toMatchObject({
      status: 'idle',
      content: '',
      generationType: 'edit',
      prompt: '只修改蒙版透明区域，其他区域保持不变。change the jacket into blue silk',
      editMask: {
        url: '/api/assets/mask.png',
        storageKey: 'mask.png',
        mimeType: 'image/png',
        bytes: 128,
        width: 1200,
        height: 900,
      },
      model: 'image-model',
      size: '1536x1024',
      count: 1,
    })
    expect(result?.project.nodes[1].metadata.generationPayload).toMatchObject({
      mode: 'image',
      generationType: 'edit',
      model: 'image-model',
      size: '1536x1024',
      count: 1,
      summary: { text: 0, image: 1, video: 0, audio: 0 },
      editMask: {
        url: '/api/assets/mask.png',
        storageKey: 'mask.png',
        mimeType: 'image/png',
        bytes: 128,
        width: 1200,
        height: 900,
      },
      inputs: [
        {
          nodeId: 'source',
          type: 'image',
          title: 'Portrait source',
          media: {
            url: '/api/assets/source.png',
            mimeType: 'image/png',
            bytes: 1024,
            width: 1200,
            height: 900,
          },
        },
      ],
      createdAt: '2026-07-26T02:00:00.000Z',
    })
  })

  it('refuses invalid sources, empty prompts, and missing masks', () => {
    const input = { prompt: 'replace the background', maskAsset, maskWidth: 1200, maskHeight: 900 }
    const textProject = { ...project, nodes: [{ ...imageNode('text'), type: 'text' as const }] }
    const emptyImageProject = { ...project, nodes: [{ ...imageNode('empty'), metadata: {} }] }
    const emptyMask = { ...maskAsset, url: '' }

    expect(createImageMaskEditTaskInProject(project, 'missing', input)).toBeNull()
    expect(createImageMaskEditTaskInProject(textProject, 'text', input)).toBeNull()
    expect(createImageMaskEditTaskInProject(emptyImageProject, 'empty', input)).toBeNull()
    expect(createImageMaskEditTaskInProject(project, 'source', { ...input, prompt: '   ' })).toBeNull()
    expect(createImageMaskEditTaskInProject(project, 'source', { ...input, maskAsset: emptyMask })).toBeNull()
  })
})
