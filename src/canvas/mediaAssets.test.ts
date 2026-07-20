import { describe, expect, it } from 'vitest'
import { materializeClipboardMediaAssets, materializeProjectMediaAssets } from './mediaAssets'
import type { CanvasClipboard } from './document'
import type { CanvasAssetUpload, CanvasProject } from './types'

const upload = async (dataUrl: string): Promise<CanvasAssetUpload> => ({
  storageKey: 'stored-image.png',
  url: '/api/assets/stored-image.png',
  mimeType: 'image/png',
  bytes: dataUrl.length,
  extension: 'png',
})

const project: CanvasProject = {
  schemaVersion: 1,
  id: 'project-1',
  title: 'Test project',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  nodes: [],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('canvas media asset materialization', () => {
  it('uploads project media data urls and stores asset references', async () => {
    const content = 'data:image/png;base64,aGVsbG8='

    const materialized = await materializeProjectMediaAssets({
      ...project,
      nodes: [
        {
          id: 'image-1',
          type: 'image',
          title: 'Image',
          position: { x: 0, y: 0 },
          width: 280,
          height: 220,
          metadata: { content, mimeType: 'image/png', bytes: 5, status: 'success' },
        },
        {
          id: 'text-1',
          type: 'text',
          title: 'Text',
          position: { x: 320, y: 0 },
          width: 260,
          height: 180,
          metadata: { content, mimeType: 'text/plain', status: 'success' },
        },
      ],
    }, upload)

    expect(materialized.nodes[0].metadata).toMatchObject({
      content: '/api/assets/stored-image.png',
      storageKey: 'stored-image.png',
      mimeType: 'image/png',
      bytes: content.length,
    })
    expect(materialized.nodes[1].metadata.content).toBe(content)
  })

  it('uploads clipboard media data urls before pasting fragments', async () => {
    const content = 'data:image/png;base64,aGVsbG8='
    const clipboard: CanvasClipboard = {
      nodes: [
        {
          id: 'image-1',
          type: 'image',
          title: 'Image',
          position: { x: 0, y: 0 },
          width: 280,
          height: 220,
          metadata: { content, mimeType: 'image/png', bytes: 5, status: 'success' },
        },
      ],
      connections: [],
    }

    const materialized = await materializeClipboardMediaAssets(clipboard, upload)

    expect(materialized.nodes[0].metadata.content).toBe('/api/assets/stored-image.png')
    expect(materialized.nodes[0].metadata.storageKey).toBe('stored-image.png')
  })
})
