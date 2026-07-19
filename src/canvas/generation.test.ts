import { describe, expect, it } from 'vitest'
import { buildCanvasGenerationContext, buildCanvasGenerationInputs, buildCanvasGenerationPayload, metadataFromGenerationJob, serializeCanvasGenerationPayload } from './generation'
import type { CanvasConnection, CanvasGenerationJob, CanvasNode } from './types'

const configNode: CanvasNode = {
  id: 'config',
  type: 'config',
  title: '配置节点',
  position: { x: 0, y: 0 },
  width: 300,
  height: 300,
  metadata: {
    generationMode: 'image',
    model: 'image-model',
    size: '1024x1024',
    count: 2,
    prompt: '主提示词',
  },
}

const textNode: CanvasNode = {
  id: 'text',
  type: 'text',
  title: '分镜',
  position: { x: -360, y: 0 },
  width: 260,
  height: 180,
  metadata: { content: '一只银色机械鸟飞过雪山。' },
}

const imageNode: CanvasNode = {
  id: 'image',
  type: 'image',
  title: '参考图',
  position: { x: -360, y: 240 },
  width: 280,
  height: 220,
  metadata: {
    content: 'data:image/png;base64,abc',
    mimeType: 'image/png',
    bytes: 128,
    naturalWidth: 64,
    naturalHeight: 64,
  },
}

const videoNode: CanvasNode = {
  id: 'video',
  type: 'video',
  title: '参考视频',
  position: { x: -360, y: 500 },
  width: 320,
  height: 220,
  metadata: {
    content: 'data:video/mp4;base64,abc',
    mimeType: 'video/mp4',
    bytes: 256,
  },
}

const emptyImageNode: CanvasNode = {
  ...imageNode,
  id: 'empty-image',
  title: '空图片',
  metadata: {},
}

const connections: CanvasConnection[] = [
  { id: 'c1', fromNodeId: 'text', toNodeId: 'config' },
  { id: 'c2', fromNodeId: 'image', toNodeId: 'config' },
  { id: 'c3', fromNodeId: 'video', toNodeId: 'config' },
  { id: 'c4', fromNodeId: 'empty-image', toNodeId: 'config' },
]

describe('canvas generation context', () => {
  it('collects only connected resource nodes that have usable content', () => {
    const inputs = buildCanvasGenerationInputs('config', [configNode, textNode, imageNode, videoNode, emptyImageNode], connections)

    expect(inputs.map((input) => input.nodeId)).toEqual(['text', 'image', 'video'])
    expect(inputs[0]).toMatchObject({ type: 'text', title: '分镜', text: '一只银色机械鸟飞过雪山。' })
    expect(inputs[1].media).toMatchObject({ mimeType: 'image/png', width: 64, height: 64 })
  })

  it('builds a default context from config prompt plus all upstream resources', () => {
    const context = buildCanvasGenerationContext('config', [configNode, textNode, imageNode, videoNode], connections)

    expect(context.ready).toBe(true)
    expect(context.mode).toBe('image')
    expect(context.model).toBe('image-model')
    expect(context.count).toBe(2)
    expect(context.prompt).toBe('主提示词\n\n一只银色机械鸟飞过雪山。')
    expect(context.summary).toEqual({ text: 1, image: 1, video: 1 })
    expect(context.selectedInputs.map((input) => input.nodeId)).toEqual(['text', 'image', 'video'])
    expect(context.referenceImages).toHaveLength(1)
    expect(context.referenceVideos).toHaveLength(1)
  })

  it('does not treat config node help copy as generation prompt', () => {
    const configWithHelpCopyOnly: CanvasNode = {
      ...configNode,
      metadata: {
        content: '模型、比例、数量等生成参数会放在这里。',
      },
    }

    const context = buildCanvasGenerationContext('config', [configWithHelpCopyOnly, textNode], [{ id: 'c1', fromNodeId: 'text', toNodeId: 'config' }])

    expect(context.prompt).toBe('一只银色机械鸟飞过雪山。')
  })

  it('uses composer references to select only explicitly mentioned upstream nodes', () => {
    const configWithComposer: CanvasNode = {
      ...configNode,
      metadata: {
        ...configNode.metadata,
        composerContent: `把 @[node:image] 的主体做成电影感镜头，并结合 @[node:text]。`,
      },
    }

    const context = buildCanvasGenerationContext('config', [configWithComposer, textNode, imageNode, videoNode], connections)

    expect(context.prompt).toBe('把 图片1 的主体做成电影感镜头，并结合 【文本1】。\n\n【文本1】\n一只银色机械鸟飞过雪山。')
    expect(context.selectedInputs.map((input) => input.nodeId)).toEqual(['image', 'text'])
    expect(context.summary).toEqual({ text: 1, image: 1, video: 0 })
    expect(context.referenceImages).toHaveLength(1)
    expect(context.referenceVideos).toHaveLength(0)
  })

  it('builds an API-ready payload from the selected generation inputs', () => {
    const configWithComposer: CanvasNode = {
      ...configNode,
      metadata: {
        ...configNode.metadata,
        composerContent: '只参考 @[node:image]，不要使用视频。',
      },
    }
    const context = buildCanvasGenerationContext('config', [configWithComposer, textNode, imageNode, videoNode], connections)
    const payload = buildCanvasGenerationPayload(context, '2026-07-19T10:00:00.000Z')

    expect(payload).toMatchObject({
      mode: 'image',
      model: 'image-model',
      size: '1024x1024',
      count: 2,
      prompt: '只参考 图片1，不要使用视频。',
      summary: { text: 0, image: 1, video: 0 },
      createdAt: '2026-07-19T10:00:00.000Z',
    })
    expect(payload.inputs).toEqual([
      {
        nodeId: 'image',
        type: 'image',
        title: '参考图',
        text: undefined,
        media: {
          url: 'data:image/png;base64,abc',
          mimeType: 'image/png',
          bytes: 128,
          width: 64,
          height: 64,
        },
      },
    ])
    expect(JSON.parse(serializeCanvasGenerationPayload(payload))).toMatchObject({
      prompt: '只参考 图片1，不要使用视频。',
      inputs: [{ nodeId: 'image', type: 'image' }],
    })
  })

  it('reports an unready context when config has no prompt and no usable upstream input', () => {
    const emptyConfig: CanvasNode = {
      ...configNode,
      metadata: { generationMode: 'video' },
    }

    const context = buildCanvasGenerationContext('config', [emptyConfig, emptyImageNode], [{ id: 'c1', fromNodeId: 'empty-image', toNodeId: 'config' }])

    expect(context.ready).toBe(false)
    expect(context.warnings).toEqual(['请先输入提示词，或连接有内容的文本、图片、视频节点。'])
  })

  it('maps adapter jobs into task node metadata consistently', () => {
    const baseJob: CanvasGenerationJob = {
      id: 'job-1',
      projectId: 'project-1',
      nodeId: 'node-1',
      status: 'queued',
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:00:00.000Z',
      payload: buildCanvasGenerationPayload(buildCanvasGenerationContext('config', [configNode, imageNode], [{ id: 'c1', fromNodeId: 'image', toNodeId: 'config' }])),
      result: null,
    }

    expect(metadataFromGenerationJob(baseJob)).toMatchObject({
      status: 'loading',
      generationJobId: 'job-1',
      generationJobStatus: 'queued',
      submittedAt: '2026-07-19T10:00:00.000Z',
      errorDetails: '',
    })
    expect(metadataFromGenerationJob(
      { ...baseJob, status: 'failed', error: 'provider timeout' },
      { content: 'data:image/png;base64,old', mimeType: 'image/png', naturalWidth: 16, naturalHeight: 16 },
    )).toMatchObject({
      status: 'error',
      generationJobStatus: 'failed',
      content: '',
      errorDetails: 'provider timeout',
    })
    expect(metadataFromGenerationJob({
      ...baseJob,
      status: 'succeeded',
      updatedAt: '2026-07-19T10:05:00.000Z',
      result: { content: 'data:image/png;base64,result', mimeType: 'image/png', naturalWidth: 32, naturalHeight: 18 },
    })).toMatchObject({
      status: 'success',
      generationJobStatus: 'succeeded',
      content: 'data:image/png;base64,result',
      mimeType: 'image/png',
      naturalWidth: 32,
      naturalHeight: 18,
      generatedAt: '2026-07-19T10:05:00.000Z',
      errorDetails: '',
    })
  })
})
