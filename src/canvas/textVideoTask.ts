import { addConnectionToProject } from './document'
import { buildCanvasGenerationPayload, buildTextNodeImageGenerationContext, generationTaskPositionForSource } from './generation'
import { createCanvasNode } from './nodeFactory'
import { metadataFromVideoOptions, normalizeCanvasVideoOptions } from './videoOptions'
import type { CanvasProject } from './types'

type CreateTextVideoTaskOptions = {
  videoModel?: string
  size?: string
  seconds?: string | number
  quality?: string
  generateAudio?: boolean | string
  watermark?: boolean | string
  createId?: () => string
  now?: () => string
}

type TextVideoTaskResult = {
  project: CanvasProject
  nodeId: string
}

const defaultCreateId = () => crypto.randomUUID()
const defaultNow = () => new Date().toISOString()

export function createTextVideoTaskInProject(
  project: CanvasProject,
  nodeId: string,
  options: CreateTextVideoTaskOptions = {},
): TextVideoTaskResult | null {
  const source = project.nodes.find((node) => node.id === nodeId)
  if (source?.type !== 'text') return null

  const baseContext = buildTextNodeImageGenerationContext(nodeId, project.nodes, project.connections)
  if (!baseContext.ready) return null

  const createId = options.createId ?? defaultCreateId
  const createdAt = (options.now ?? defaultNow)()
  const context = {
    ...baseContext,
    mode: 'video' as const,
    model: options.videoModel || source.metadata.model || baseContext.model,
    size: options.size || source.metadata.size || '720p',
    count: 1,
    video: normalizeCanvasVideoOptions({
      seconds: options.seconds ?? source.metadata.seconds,
      resolution: options.quality ?? source.metadata.vquality,
      generateAudio: options.generateAudio ?? source.metadata.generateAudio,
      watermark: options.watermark ?? source.metadata.watermark,
    }),
  }
  const generationPayload = buildCanvasGenerationPayload(context, createdAt)
  const taskNode = createCanvasNode('video', generationTaskPositionForSource(source, project.nodes, project.connections), {
    createId,
    patch: {
      title: '文本生成视频任务',
      width: 360,
      height: 250,
      metadata: {
        status: 'idle',
        content: '',
        prompt: context.prompt,
        generationPayload,
        model: context.model,
        size: context.size,
        count: context.count,
        ...metadataFromVideoOptions(context.video),
      },
    },
  })

  const projectWithTask = { ...project, nodes: [...project.nodes, taskNode], updatedAt: createdAt }
  return {
    project: addConnectionToProject(projectWithTask, { id: createId(), fromNodeId: source.id, toNodeId: taskNode.id }),
    nodeId: taskNode.id,
  }
}
