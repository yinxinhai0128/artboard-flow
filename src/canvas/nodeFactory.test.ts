import { describe, expect, it } from 'vitest'
import { createCanvasNode } from './nodeFactory'

describe('canvas node factory', () => {
  it('creates default nodes with stable ids, geometry, and metadata', () => {
    const node = createCanvasNode('image', { x: 120, y: 80 }, { createId: () => 'image-1' })

    expect(node).toEqual({
      id: 'image-1',
      type: 'image',
      title: '图片节点',
      position: { x: 120, y: 80 },
      width: 280,
      height: 220,
      metadata: {
        content: '',
        status: 'idle',
        count: undefined,
        size: undefined,
      },
    })
  })

  it('keeps config generation defaults in one shared place', () => {
    const node = createCanvasNode('config', { x: 0, y: 0 }, { createId: () => 'config-1' })

    expect(node.metadata.count).toBe(1)
    expect(node.metadata.size).toBe('1024x1024')
    expect(node.metadata.content).toContain('模型')
  })

  it('allows patches while merging metadata over defaults', () => {
    const node = createCanvasNode(
      'text',
      { x: 10, y: 20 },
      {
        createId: () => 'text-1',
        patch: {
          title: '自定义提示词',
          width: 360,
          metadata: { content: 'cinematic light', status: 'success' },
        },
      },
    )

    expect(node).toMatchObject({
      id: 'text-1',
      type: 'text',
      title: '自定义提示词',
      width: 360,
      metadata: { content: 'cinematic light', status: 'success' },
    })
  })
})
