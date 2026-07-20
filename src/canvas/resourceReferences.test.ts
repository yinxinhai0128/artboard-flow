import { describe, expect, it } from 'vitest'
import { buildNodeMentionReferences, getGenerationResourceNodes, getMentionResourceNodes } from './resourceReferences'
import type { CanvasConnection, CanvasNode } from './types'

const node = (id: string, type: CanvasNode['type'], metadata: CanvasNode['metadata'] = {}): CanvasNode => ({
  id,
  type,
  title: id,
  position: { x: 0, y: 0 },
  width: 240,
  height: 160,
  metadata,
})

describe('canvas resource references', () => {
  const text = node('text-1', 'text', { content: '一段分镜提示词' })
  const image = node('image-1', 'image', { content: 'data:image/png;base64,abc', mimeType: 'image/png' })
  const emptyImage = node('empty-image', 'image')
  const config = node('config-1', 'config')
  const output = node('output-1', 'image', { content: 'data:image/png;base64,out' })
  const group = node('group-1', 'group')

  const connections: CanvasConnection[] = [
    { id: 'text-config', fromNodeId: 'text-1', toNodeId: 'config-1' },
    { id: 'image-config', fromNodeId: 'image-1', toNodeId: 'config-1' },
    { id: 'empty-config', fromNodeId: 'empty-image', toNodeId: 'config-1' },
    { id: 'group-config', fromNodeId: 'group-1', toNodeId: 'config-1' },
    { id: 'output-config', fromNodeId: 'output-1', toNodeId: 'config-1' },
  ]

  it('lists only usable upstream resources for a config node', () => {
    const resources = getGenerationResourceNodes('config-1', [text, image, emptyImage, config, output, group], connections)

    expect(resources.map((item) => item.id)).toEqual(['text-1', 'image-1', 'output-1'])
  })

  it('builds labeled mention references that an external host can render', () => {
    const references = buildNodeMentionReferences(config, [text, image, emptyImage, config, output, group], connections)

    expect(references).toEqual([
      expect.objectContaining({ nodeId: 'text-1', kind: 'text', label: '文本1', text: '一段分镜提示词', active: true }),
      expect.objectContaining({ nodeId: 'image-1', kind: 'image', label: '图片1', previewUrl: 'data:image/png;base64,abc', active: true }),
      expect.objectContaining({ nodeId: 'output-1', kind: 'image', label: '图片2', previewUrl: 'data:image/png;base64,out', active: true }),
    ])
  })

  it('falls back to the node itself for mention chips when the selected node is a standalone resource', () => {
    const references = getMentionResourceNodes('image-1', [text, image], [])

    expect(references.map((item) => item.id)).toEqual(['image-1'])
  })
})
