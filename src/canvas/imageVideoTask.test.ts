import { describe, expect, it } from 'vitest'
import { buildImageVideoPrompt, createImageVideoTaskInProject } from './imageVideoTask'
import type { CanvasNode, CanvasProject } from './types'

const imageNode = (id: string): CanvasNode => ({
  id,
  type: 'image',
  title: 'Storyboard frame',
  position: { x: 100, y: 80 },
  width: 320,
  height: 240,
  metadata: {
    content: '/api/assets/frame.png',
    storageKey: 'frame.png',
    prompt: 'a robot bird flying over snow mountains',
    status: 'success',
    mimeType: 'image/png',
    bytes: 1024,
    naturalWidth: 1280,
    naturalHeight: 720,
    size: '1280x720',
  },
})

const project: CanvasProject = {
  id: 'project-image-video',
  title: 'Image video project',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  nodes: [imageNode('source')],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('image video task', () => {
  it('builds a video prompt from a source image prompt and motion instruction', () => {
    expect(buildImageVideoPrompt('a robot bird', 'slow cinematic push-in')).toBe('基于参考图生成一段视频，保持主体、画面风格和构图一致。动作要求：slow cinematic push-in。参考图提示词：a robot bird')
    expect(buildImageVideoPrompt('', '')).toBe('基于参考图生成一段视频，保持主体、画面风格和构图一致。')
  })

  it('creates a connected video generation task from a source image', () => {
    const result = createImageVideoTaskInProject(project, 'source', {
      prompt: 'slow cinematic push-in',
      videoModel: 'video-model',
      size: '720p',
      createId: (() => {
        const ids = ['video-task', 'video-edge']
        return () => ids.shift()!
      })(),
      now: () => '2026-07-26T04:00:00.000Z',
    })

    expect(result?.nodeId).toBe('video-task')
    expect(result?.project.nodes.map((node) => [node.id, node.type, node.title, node.position, node.width, node.height])).toEqual([
      ['source', 'image', 'Storyboard frame', { x: 100, y: 80 }, 320, 240],
      ['video-task', 'video', '图生视频任务', { x: 540, y: 104 }, 360, 250],
    ])
    expect(result?.project.connections).toEqual([
      { id: 'video-edge', fromNodeId: 'source', toNodeId: 'video-task' },
    ])
    expect(result?.project.nodes[1].metadata).toMatchObject({
      status: 'idle',
      content: '',
      prompt: '基于参考图生成一段视频，保持主体、画面风格和构图一致。动作要求：slow cinematic push-in。参考图提示词：a robot bird flying over snow mountains',
      model: 'video-model',
      size: '720p',
      count: 1,
    })
    expect(result?.project.nodes[1].metadata.generationPayload).toMatchObject({
      mode: 'video',
      model: 'video-model',
      size: '720p',
      count: 1,
      summary: { text: 0, image: 1, video: 0, audio: 0 },
      inputs: [{
        nodeId: 'source',
        type: 'image',
        title: 'Storyboard frame',
        media: {
          url: '/api/assets/frame.png',
          storageKey: 'frame.png',
          mimeType: 'image/png',
          bytes: 1024,
          width: 1280,
          height: 720,
        },
      }],
      createdAt: '2026-07-26T04:00:00.000Z',
    })
  })

  it('refuses missing, non-image, and contentless sources', () => {
    const textProject = { ...project, nodes: [{ ...imageNode('text'), type: 'text' as const }] }
    const emptyImageProject = { ...project, nodes: [{ ...imageNode('empty'), metadata: {} }] }

    expect(createImageVideoTaskInProject(project, 'missing')).toBeNull()
    expect(createImageVideoTaskInProject(textProject, 'text')).toBeNull()
    expect(createImageVideoTaskInProject(emptyImageProject, 'empty')).toBeNull()
  })
})
