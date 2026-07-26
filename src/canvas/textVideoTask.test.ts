import { describe, expect, it } from 'vitest'
import { createTextVideoTaskInProject } from './textVideoTask'
import type { CanvasNode, CanvasProject } from './types'

const textNode = (id: string): CanvasNode => ({
  id,
  type: 'text',
  title: 'Scene prompt',
  position: { x: 100, y: 80 },
  width: 260,
  height: 180,
  metadata: {
    content: 'a robot bird flies through a neon city',
    prompt: 'a robot bird flies through a neon city',
    status: 'success',
    model: 'text-model',
    size: '1080p',
  },
})

const imageNode = (id: string): CanvasNode => ({
  id,
  type: 'image',
  title: 'Visual reference',
  position: { x: -280, y: 80 },
  width: 280,
  height: 200,
  metadata: {
    content: '/api/assets/reference.png',
    mimeType: 'image/png',
    bytes: 512,
    naturalWidth: 1024,
    naturalHeight: 768,
    status: 'success',
  },
})

const project: CanvasProject = {
  id: 'project-text-video',
  title: 'Text video project',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  nodes: [imageNode('image'), textNode('text')],
  connections: [{ id: 'image-text', fromNodeId: 'image', toNodeId: 'text' }],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('text video task', () => {
  it('creates a connected video generation task from a text prompt and upstream references', () => {
    const result = createTextVideoTaskInProject(project, 'text', {
      videoModel: 'video-model',
      size: '720p',
      createId: (() => {
        const ids = ['video-task', 'video-edge']
        return () => ids.shift()!
      })(),
      now: () => '2026-07-26T05:00:00.000Z',
    })

    expect(result?.nodeId).toBe('video-task')
    expect(result?.project.nodes.map((node) => [node.id, node.type, node.title, node.position, node.width, node.height])).toEqual([
      ['image', 'image', 'Visual reference', { x: -280, y: 80 }, 280, 200],
      ['text', 'text', 'Scene prompt', { x: 100, y: 80 }, 260, 180],
      ['video-task', 'video', '文本生成视频任务', { x: 480, y: 104 }, 360, 250],
    ])
    expect(result?.project.connections).toEqual([
      { id: 'image-text', fromNodeId: 'image', toNodeId: 'text' },
      { id: 'video-edge', fromNodeId: 'text', toNodeId: 'video-task' },
    ])
    expect(result?.project.nodes[2].metadata).toMatchObject({
      status: 'idle',
      content: '',
      prompt: 'a robot bird flies through a neon city',
      model: 'video-model',
      size: '720p',
      count: 1,
    })
    expect(result?.project.nodes[2].metadata.generationPayload).toMatchObject({
      mode: 'video',
      model: 'video-model',
      size: '720p',
      count: 1,
      prompt: 'a robot bird flies through a neon city',
      summary: { text: 0, image: 1, video: 0, audio: 0 },
      inputs: [{
        nodeId: 'image',
        type: 'image',
        title: 'Visual reference',
        media: {
          url: '/api/assets/reference.png',
          mimeType: 'image/png',
          bytes: 512,
          width: 1024,
          height: 768,
        },
      }],
      createdAt: '2026-07-26T05:00:00.000Z',
    })
    expect(result?.project.updatedAt).toBe('2026-07-26T05:00:00.000Z')
  })

  it('refuses missing, non-text, and empty text nodes', () => {
    const emptyTextProject = { ...project, nodes: [{ ...textNode('empty'), metadata: {} }] }
    const imageOnlyProject = { ...project, nodes: [imageNode('image')] }

    expect(createTextVideoTaskInProject(project, 'missing')).toBeNull()
    expect(createTextVideoTaskInProject(imageOnlyProject, 'image')).toBeNull()
    expect(createTextVideoTaskInProject(emptyTextProject, 'empty')).toBeNull()
  })
})
