import { describe, expect, it } from 'vitest'
import { applyGenerationJobToProject, buildCanvasGenerationContext, buildCanvasGenerationInputs, buildCanvasGenerationPayload, buildTextNodeImageGenerationContext, generationTaskPositionForSource, metadataFromGenerationJob, resetGenerationTaskNodeForRetry, serializeCanvasGenerationPayload, shouldRenderGenerationTaskBody } from './generation'
import type { CanvasConnection, CanvasGenerationJob, CanvasNode, CanvasProject } from './types'

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

const audioNode: CanvasNode = {
  id: 'audio',
  type: 'audio',
  title: '配音',
  position: { x: 0, y: 0 },
  width: 300,
  height: 170,
  metadata: {
    content: 'data:audio/mpeg;base64,abc',
    mimeType: 'audio/mpeg',
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
  { id: 'c5', fromNodeId: 'audio', toNodeId: 'config' },
]

describe('canvas generation context', () => {
  it('collects only connected resource nodes that have usable content', () => {
    const inputs = buildCanvasGenerationInputs('config', [configNode, textNode, imageNode, videoNode, audioNode, emptyImageNode], connections)

    expect(inputs.map((input) => input.nodeId)).toEqual(['text', 'image', 'video', 'audio'])
    expect(inputs[0]).toMatchObject({ type: 'text', title: '分镜', text: '一只银色机械鸟飞过雪山。' })
    expect(inputs[1].media).toMatchObject({ mimeType: 'image/png', width: 64, height: 64 })
    expect(inputs[3].media).toMatchObject({ mimeType: 'audio/mpeg', bytes: 256 })
  })

  it('builds a default context from config prompt plus all upstream resources', () => {
    const context = buildCanvasGenerationContext('config', [configNode, textNode, imageNode, videoNode, audioNode], connections)

    expect(context.ready).toBe(true)
    expect(context.mode).toBe('image')
    expect(context.model).toBe('image-model')
    expect(context.count).toBe(2)
    expect(context.prompt).toBe('主提示词\n\n一只银色机械鸟飞过雪山。')
    expect(context.summary).toEqual({ text: 1, image: 1, video: 1, audio: 1 })
    expect(context.selectedInputs.map((input) => input.nodeId)).toEqual(['text', 'image', 'video', 'audio'])
    expect(context.referenceImages).toHaveLength(1)
    expect(context.referenceVideos).toHaveLength(1)
    expect(context.referenceAudios).toHaveLength(1)
  })

  it('builds an image generation context directly from a text node and its upstream resources', () => {
    const promptNode: CanvasNode = {
      ...textNode,
      id: 'prompt-text',
      title: 'Prompt',
      metadata: { content: 'Make a cinematic poster.' },
    }
    const upstreamText: CanvasNode = {
      ...textNode,
      id: 'upstream-text',
      title: 'Style notes',
      metadata: { content: 'Use neon rim light.' },
    }
    const context = buildTextNodeImageGenerationContext(
      'prompt-text',
      [promptNode, upstreamText, imageNode],
      [
        { id: 'u1', fromNodeId: 'upstream-text', toNodeId: 'prompt-text' },
        { id: 'u2', fromNodeId: 'image', toNodeId: 'prompt-text' },
      ],
    )

    expect(context.ready).toBe(true)
    expect(context.mode).toBe('image')
    expect(context.prompt).toBe('Make a cinematic poster.\n\nUse neon rim light.')
    expect(context.summary).toEqual({ text: 1, image: 1, video: 0, audio: 0 })
    expect(context.referenceImages.map((input) => input.nodeId)).toEqual(['image'])
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
    expect(context.summary).toEqual({ text: 1, image: 1, video: 0, audio: 0 })
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
      summary: { text: 0, image: 1, video: 0, audio: 0 },
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

  it('carries video settings from config nodes into video generation payloads', () => {
    const videoConfig: CanvasNode = {
      ...configNode,
      metadata: {
        ...configNode.metadata,
        generationMode: 'video',
        size: '16:9',
        seconds: '10',
        vquality: '1080p',
        generateAudio: true,
        watermark: false,
      },
    }

    const context = buildCanvasGenerationContext('config', [videoConfig, imageNode], [{ id: 'c1', fromNodeId: 'image', toNodeId: 'config' }])
    const payload = buildCanvasGenerationPayload(context, '2026-07-26T06:00:00.000Z')

    expect(payload).toMatchObject({
      mode: 'video',
      size: '16:9',
      video: {
        seconds: '10',
        resolution: '1080p',
        generateAudio: true,
        watermark: false,
      },
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
    expect(metadataFromGenerationJob(
      {
        ...baseJob,
        status: 'succeeded',
        updatedAt: '2026-07-19T10:06:00.000Z',
        result: {
          content: 'data:image/png;base64,first',
          mimeType: 'image/png',
          outputs: [
            { content: 'data:image/png;base64,first', mimeType: 'image/png', naturalWidth: 64, naturalHeight: 64 },
            { content: 'data:image/png;base64,second', mimeType: 'image/png', naturalWidth: 128, naturalHeight: 96 },
          ],
        },
      },
      { activeOutputIndex: 1 },
    )).toMatchObject({
      status: 'success',
      content: 'data:image/png;base64,second',
      activeOutputIndex: 1,
      generationOutputs: [
        { content: 'data:image/png;base64,first', naturalWidth: 64 },
        { content: 'data:image/png;base64,second', naturalWidth: 128 },
      ],
    })
  })

  it('maps cancelled adapter jobs back to an idle retryable task', () => {
    const payload = buildCanvasGenerationPayload(buildCanvasGenerationContext('config', [configNode, imageNode], [{ id: 'c1', fromNodeId: 'image', toNodeId: 'config' }]))
    const metadata = metadataFromGenerationJob({
      id: 'job-cancelled',
      projectId: 'project-1',
      nodeId: 'node-1',
      status: 'cancelled',
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:05:00.000Z',
      payload,
      result: null,
      error: '用户已停止生成',
    })

    expect(metadata).toMatchObject({
      generationJobStatus: 'cancelled',
      status: 'idle',
      errorDetails: '用户已停止生成',
    })
  })
  it('applies completed generation jobs to both task and output nodes', () => {
    const payload = buildCanvasGenerationPayload(buildCanvasGenerationContext('config', [configNode, imageNode], [{ id: 'c1', fromNodeId: 'image', toNodeId: 'config' }]))
    const taskNode: CanvasNode = {
      ...imageNode,
      id: 'task',
      title: 'Image generation task',
      metadata: {
        generationPayload: payload,
        outputNodeId: 'output',
        status: 'loading',
        prompt: payload.prompt,
      },
    }
    const outputNode: CanvasNode = {
      ...imageNode,
      id: 'output',
      title: 'Generated image',
      metadata: {
        generationPayload: payload,
        status: 'loading',
        prompt: payload.prompt,
      },
    }
    const project: CanvasProject = {
      id: 'project-1',
      title: 'Generation project',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
      nodes: [configNode, taskNode, outputNode],
      connections: [
        { id: 'config-task', fromNodeId: 'config', toNodeId: 'task' },
        { id: 'config-output', fromNodeId: 'config', toNodeId: 'output' },
      ],
      backgroundMode: 'dots',
      viewport: { x: 0, y: 0, k: 1 },
    }
    const job: CanvasGenerationJob = {
      id: 'job-1',
      projectId: 'project-1',
      nodeId: 'task',
      status: 'succeeded',
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:05:00.000Z',
      payload,
      result: {
        content: 'data:image/png;base64,first',
        mimeType: 'image/png',
        outputs: [
          { content: 'data:image/png;base64,first', mimeType: 'image/png', naturalWidth: 64, naturalHeight: 64 },
          { content: 'data:image/png;base64,second', mimeType: 'image/png', naturalWidth: 128, naturalHeight: 96 },
        ],
      },
    }

    const updated = applyGenerationJobToProject(project, 'task', job)
    const updatedTask = updated.nodes.find((node) => node.id === 'task')
    const updatedOutput = updated.nodes.find((node) => node.id === 'output')

    expect(updatedTask?.metadata).toMatchObject({
      status: 'success',
      generationJobStatus: 'succeeded',
      content: 'data:image/png;base64,first',
      outputNodeId: 'output',
    })
    expect(updatedOutput?.metadata).toMatchObject({
      status: 'success',
      generationJobStatus: 'succeeded',
      content: 'data:image/png;base64,first',
      generationOutputs: [
        { content: 'data:image/png;base64,first', naturalWidth: 64 },
        { content: 'data:image/png;base64,second', naturalWidth: 128 },
      ],
      prompt: payload.prompt,
      model: payload.model,
      size: payload.size,
      count: payload.count,
      generatedAt: '2026-07-19T10:05:00.000Z',
    })
    expect(updated.connections).toEqual(project.connections)
  })

  it('materializes multiple completed outputs as connected result nodes', () => {
    const payload = buildCanvasGenerationPayload(buildCanvasGenerationContext('config', [configNode, imageNode], [{ id: 'c1', fromNodeId: 'image', toNodeId: 'config' }]))
    const taskNode: CanvasNode = {
      ...imageNode,
      id: 'task',
      title: 'Image generation task',
      metadata: {
        generationPayload: payload,
        outputNodeId: 'output',
        status: 'loading',
        prompt: payload.prompt,
      },
    }
    const outputNode: CanvasNode = {
      ...imageNode,
      id: 'output',
      title: 'Generated image',
      position: { x: 420, y: 100 },
      width: 320,
      height: 240,
      metadata: {
        generationPayload: payload,
        status: 'loading',
        prompt: payload.prompt,
      },
    }
    const project: CanvasProject = {
      id: 'project-1',
      title: 'Generation project',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
      nodes: [configNode, taskNode, outputNode],
      connections: [{ id: 'config-output', fromNodeId: 'config', toNodeId: 'output' }],
      backgroundMode: 'dots',
      viewport: { x: 0, y: 0, k: 1 },
    }
    const job: CanvasGenerationJob = {
      id: 'job-1',
      projectId: 'project-1',
      nodeId: 'task',
      status: 'succeeded',
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:05:00.000Z',
      payload,
      result: {
        content: 'data:image/png;base64,first',
        mimeType: 'image/png',
        outputs: [
          { content: 'data:image/png;base64,first', mimeType: 'image/png', naturalWidth: 64, naturalHeight: 64 },
          { content: 'data:image/png;base64,second', mimeType: 'image/png', naturalWidth: 128, naturalHeight: 96 },
        ],
      },
    }
    const ids = ['child-1', 'edge-1', 'child-2', 'edge-2']

    const updated = applyGenerationJobToProject(project, 'task', job, () => ids.shift()!)
    const splitNodes = updated.nodes.filter((node) => node.metadata.splitSourceNodeId === 'output')

    expect(splitNodes.map((node) => node.id)).toEqual(['child-1', 'child-2'])
    expect(splitNodes.map((node) => node.metadata.content)).toEqual([
      'data:image/png;base64,first',
      'data:image/png;base64,second',
    ])
    expect(updated.connections).toEqual([
      { id: 'config-output', fromNodeId: 'config', toNodeId: 'output' },
      { id: 'edge-1', fromNodeId: 'output', toNodeId: 'child-1' },
      { id: 'edge-2', fromNodeId: 'output', toNodeId: 'child-2' },
    ])
  })

  it('materializes multiple completed outputs from the task node when it is the output node', () => {
    const payload = buildCanvasGenerationPayload(buildCanvasGenerationContext('config', [configNode, imageNode], [{ id: 'c1', fromNodeId: 'image', toNodeId: 'config' }]))
    const taskNode: CanvasNode = {
      ...imageNode,
      id: 'task-output',
      title: 'Image generation task',
      position: { x: 420, y: 100 },
      width: 320,
      height: 240,
      metadata: {
        generationPayload: payload,
        status: 'loading',
        prompt: payload.prompt,
      },
    }
    const project: CanvasProject = {
      id: 'project-1',
      title: 'Generation project',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
      nodes: [configNode, taskNode],
      connections: [{ id: 'config-task', fromNodeId: 'config', toNodeId: 'task-output' }],
      backgroundMode: 'dots',
      viewport: { x: 0, y: 0, k: 1 },
    }
    const job: CanvasGenerationJob = {
      id: 'job-1',
      projectId: 'project-1',
      nodeId: 'task-output',
      status: 'succeeded',
      createdAt: '2026-07-19T10:00:00.000Z',
      updatedAt: '2026-07-19T10:05:00.000Z',
      payload,
      result: {
        content: 'data:image/png;base64,first',
        mimeType: 'image/png',
        outputs: [
          { content: 'data:image/png;base64,first', mimeType: 'image/png', naturalWidth: 64, naturalHeight: 64 },
          { content: 'data:image/png;base64,second', mimeType: 'image/png', naturalWidth: 128, naturalHeight: 96 },
        ],
      },
    }
    const ids = ['child-1', 'edge-1', 'child-2', 'edge-2']

    const updated = applyGenerationJobToProject(project, 'task-output', job, () => ids.shift()!)
    const splitNodes = updated.nodes.filter((node) => node.metadata.splitSourceNodeId === 'task-output')

    expect(splitNodes.map((node) => node.id)).toEqual(['child-1', 'child-2'])
    expect(updated.connections).toEqual([
      { id: 'config-task', fromNodeId: 'config', toNodeId: 'task-output' },
      { id: 'edge-1', fromNodeId: 'task-output', toNodeId: 'child-1' },
      { id: 'edge-2', fromNodeId: 'task-output', toNodeId: 'child-2' },
    ])
  })

  it('resets a failed generation task with a saved payload so text-origin tasks can be retried', () => {
    const payload = buildCanvasGenerationPayload(buildTextNodeImageGenerationContext('text', [textNode, imageNode], [{ id: 'image-text', fromNodeId: 'image', toNodeId: 'text' }]))
    const taskNode: CanvasNode = {
      ...imageNode,
      id: 'task-from-text',
      title: 'Image generation task',
      position: { x: 420, y: 0 },
      metadata: {
        ...imageNode.metadata,
        content: '',
        generationPayload: payload,
        generationJobId: 'failed-job',
        generationJobStatus: 'failed',
        status: 'error',
        errorDetails: 'adapter failed',
      },
    }
    const project: CanvasProject = {
      id: 'project-1',
      title: 'Generation project',
      createdAt: '2026-07-19T00:00:00.000Z',
      updatedAt: '2026-07-19T00:00:00.000Z',
      nodes: [textNode, taskNode],
      connections: [{ id: 'text-task', fromNodeId: 'text', toNodeId: 'task-from-text' }],
      backgroundMode: 'dots',
      viewport: { x: 0, y: 0, k: 1 },
    }

    const updated = resetGenerationTaskNodeForRetry(project, 'task-from-text')
    const retriedTask = updated.nodes.find((node) => node.id === 'task-from-text')

    expect(retriedTask?.metadata.status).toBe('idle')
    expect(retriedTask?.metadata.errorDetails).toBe('')
    expect(retriedTask?.metadata.generationPayload).toBe(payload)
    expect(retriedTask?.metadata.generationJobId).toBeUndefined()
    expect(retriedTask?.metadata.generationJobStatus).toBeUndefined()
    expect(updated.connections).toEqual(project.connections)
  })

  it('renders generation task bodies only for task nodes, not source config or text nodes', () => {
    const payload = buildCanvasGenerationPayload(buildCanvasGenerationContext('config', [configNode], []))
    const sourceConfig = {
      ...configNode,
      metadata: {
        ...configNode.metadata,
        generationPayload: payload,
        outputNodeId: 'task',
      },
    }
    const sourceText = {
      ...textNode,
      metadata: {
        ...textNode.metadata,
        generationPayload: payload,
        outputNodeId: 'task',
      },
    }
    const taskNode = {
      ...imageNode,
      id: 'task',
      metadata: {
        ...imageNode.metadata,
        generationPayload: payload,
      },
    }

    expect(shouldRenderGenerationTaskBody(sourceConfig)).toBe(false)
    expect(shouldRenderGenerationTaskBody(sourceText)).toBe(false)
    expect(shouldRenderGenerationTaskBody(taskNode)).toBe(true)
  })

  it('offsets repeated generation tasks from the same source node', () => {
    const payload = buildCanvasGenerationPayload(buildCanvasGenerationContext('config', [configNode], []))
    const existingTask: CanvasNode = {
      ...imageNode,
      id: 'existing-task',
      position: {
        x: configNode.position.x + configNode.width + 120,
        y: configNode.position.y + 24,
      },
      metadata: {
        ...imageNode.metadata,
        generationPayload: payload,
      },
    }

    expect(generationTaskPositionForSource(configNode, [configNode], [])).toEqual({
      x: configNode.position.x + configNode.width + 120,
      y: configNode.position.y + 24,
    })
    expect(generationTaskPositionForSource(configNode, [configNode, existingTask], [{ id: 'config-task', fromNodeId: 'config', toNodeId: 'existing-task' }])).toEqual({
      x: existingTask.position.x + existingTask.width + 48,
      y: configNode.position.y + 64,
    })
  })
})
