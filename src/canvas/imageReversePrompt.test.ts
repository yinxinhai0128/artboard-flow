import { describe, expect, it } from 'vitest'
import { IMAGE_REVERSE_PROMPT_PRESET, createImageReversePromptFlowInProject } from './imageReversePrompt'
import type { CanvasNode, CanvasProject } from './types'

const imageNode = (id: string): CanvasNode => ({
  id,
  type: 'image',
  title: 'Reference image',
  position: { x: 100, y: 80 },
  width: 320,
  height: 240,
  metadata: {
    content: '/api/assets/source.png',
    storageKey: 'source.png',
    prompt: 'cinematic product shot',
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
  id: 'project-reverse',
  title: 'Reverse prompt project',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  nodes: [imageNode('source')],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('image reverse prompt flow', () => {
  it('creates connected text and config nodes for reverse-prompt generation', () => {
    const result = createImageReversePromptFlowInProject(project, 'source', {
      createId: (() => {
        const ids = ['reverse-text', 'reverse-config', 'source-config-edge', 'text-config-edge']
        return () => ids.shift()!
      })(),
      now: () => '2026-07-26T03:00:00.000Z',
      textModel: 'text-model',
    })

    expect(result?.nodeIds).toEqual({ textNodeId: 'reverse-text', configNodeId: 'reverse-config' })
    expect(result?.project.nodes.map((node) => [node.id, node.type, node.title, node.position, node.width, node.height])).toEqual([
      ['source', 'image', 'Reference image', { x: 100, y: 80 }, 320, 240],
      ['reverse-text', 'text', '反推提示词', { x: 516, y: 110 }, 260, 180],
      ['reverse-config', 'config', '反推提示词配置', { x: 872, y: 50 }, 300, 300],
    ])
    expect(result?.project.connections).toEqual([
      { id: 'source-config-edge', fromNodeId: 'source', toNodeId: 'reverse-config' },
      { id: 'text-config-edge', fromNodeId: 'reverse-text', toNodeId: 'reverse-config' },
    ])
    expect(result?.project.nodes[1].metadata).toMatchObject({
      content: IMAGE_REVERSE_PROMPT_PRESET,
      prompt: IMAGE_REVERSE_PROMPT_PRESET,
      status: 'success',
    })
    expect(result?.project.nodes[2].metadata).toMatchObject({
      generationMode: 'text',
      model: 'text-model',
      count: 1,
      composerContent: '参考图片：@[node:source]\n任务说明：@[node:reverse-text]',
      prompt: '参考图片：@[node:source]\n任务说明：@[node:reverse-text]',
      status: 'idle',
    })
    expect(result?.project.updatedAt).toBe('2026-07-26T03:00:00.000Z')
  })

  it('places additional reverse-prompt flows after existing source tasks', () => {
    const first = createImageReversePromptFlowInProject(project, 'source', {
      createId: (() => {
        const ids = ['text-1', 'config-1', 'edge-1', 'edge-2']
        return () => ids.shift()!
      })(),
    })
    const second = createImageReversePromptFlowInProject(first!.project, 'source', {
      createId: (() => {
        const ids = ['text-2', 'config-2', 'edge-3', 'edge-4']
        return () => ids.shift()!
      })(),
    })

    expect(second?.project.nodes.find((node) => node.id === 'text-2')?.position.x).toBeGreaterThan(
      second!.project.nodes.find((node) => node.id === 'config-1')!.position.x,
    )
  })

  it('refuses missing, non-image, and contentless sources', () => {
    const textProject = { ...project, nodes: [{ ...imageNode('text'), type: 'text' as const }] }
    const emptyImageProject = { ...project, nodes: [{ ...imageNode('empty'), metadata: {} }] }

    expect(createImageReversePromptFlowInProject(project, 'missing')).toBeNull()
    expect(createImageReversePromptFlowInProject(textProject, 'text')).toBeNull()
    expect(createImageReversePromptFlowInProject(emptyImageProject, 'empty')).toBeNull()
  })
})
