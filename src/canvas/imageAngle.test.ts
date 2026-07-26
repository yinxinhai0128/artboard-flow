import { describe, expect, it } from 'vitest'
import { buildAngleLabel, buildAnglePrompt, createImageAngleTaskInProject } from './imageAngle'
import type { CanvasNode, CanvasProject } from './types'

const imageNode = (id: string): CanvasNode => ({
  id,
  type: 'image',
  title: 'Hero reference',
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
  id: 'project-angle',
  title: 'Angle project',
  createdAt: '2026-07-26T00:00:00.000Z',
  updatedAt: '2026-07-26T00:00:00.000Z',
  nodes: [imageNode('source')],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('image angle task', () => {
  it('builds a readable label and generation prompt', () => {
    const params = { horizontalAngle: 30, pitchAngle: -12, cameraDistance: 3.5, wideAngle: true }

    expect(buildAngleLabel(params)).toBe('AI 多角度：向右旋转 30 度，仰视 12 度，镜头距离 3.5，广角镜头')
    expect(buildAnglePrompt(params)).toContain('基于参考图重新生成同一主体的新视角')
    expect(buildAnglePrompt(params)).toContain('不要只做透视变形')
  })

  it('creates a connected image generation task from a source image', () => {
    const result = createImageAngleTaskInProject(
      project,
      'source',
      { horizontalAngle: -45, pitchAngle: 15, cameraDistance: 6.2, wideAngle: false },
      {
        createId: (() => {
          const ids = ['angle-node', 'angle-edge']
          return () => ids.shift()!
        })(),
        now: () => '2026-07-26T01:00:00.000Z',
      },
    )

    expect(result?.nodeId).toBe('angle-node')
    expect(result?.project.nodes.map((node) => [node.id, node.type, node.position, node.width, node.height])).toEqual([
      ['source', 'image', { x: 100, y: 80 }, 320, 240],
      ['angle-node', 'image', { x: 540, y: 104 }, 320, 240],
    ])
    expect(result?.project.connections).toEqual([
      { id: 'angle-edge', fromNodeId: 'source', toNodeId: 'angle-node' },
    ])
    expect(result?.project.nodes[1].metadata).toMatchObject({
      status: 'idle',
      content: '',
      prompt: '基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。AI 多角度：向左旋转 45 度，俯视 15 度，镜头距离 6.2，标准镜头。',
      model: 'image-model',
      size: '1536x1024',
      count: 1,
    })
    expect(result?.project.nodes[1].metadata.generationPayload).toMatchObject({
      mode: 'image',
      model: 'image-model',
      size: '1536x1024',
      count: 1,
      summary: { text: 0, image: 1, video: 0, audio: 0 },
      inputs: [
        {
          nodeId: 'source',
          type: 'image',
          title: 'Hero reference',
          media: {
            url: '/api/assets/source.png',
            mimeType: 'image/png',
            bytes: 1024,
            width: 1200,
            height: 900,
          },
        },
      ],
      createdAt: '2026-07-26T01:00:00.000Z',
    })
  })

  it('refuses missing, non-image, and contentless source nodes', () => {
    const params = { horizontalAngle: 0, pitchAngle: 0, cameraDistance: 4.8, wideAngle: false }
    const textProject = { ...project, nodes: [{ ...imageNode('text'), type: 'text' as const }] }
    const emptyImageProject = { ...project, nodes: [{ ...imageNode('empty'), metadata: {} }] }

    expect(createImageAngleTaskInProject(project, 'missing', params)).toBeNull()
    expect(createImageAngleTaskInProject(textProject, 'text', params)).toBeNull()
    expect(createImageAngleTaskInProject(emptyImageProject, 'empty', params)).toBeNull()
  })
})
