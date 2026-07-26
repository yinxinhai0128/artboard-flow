import { addConnectionToProject } from './document'
import { generationTaskPositionForSource } from './generation'
import { createCanvasNode } from './nodeFactory'
import { metadataFromVideoOptions, normalizeCanvasVideoOptions } from './videoOptions'
import type { CanvasGenerationPayload, CanvasNode, CanvasProject } from './types'

type CreateImageVideoTaskOptions = {
  prompt?: string
  videoModel?: string
  size?: string
  seconds?: string | number
  quality?: string
  generateAudio?: boolean | string
  watermark?: boolean | string
  createId?: () => string
  now?: () => string
}

type ImageVideoTaskResult = {
  project: CanvasProject
  nodeId: string
}

const defaultCreateId = () => crypto.randomUUID()
const defaultNow = () => new Date().toISOString()

export function buildImageVideoPrompt(sourcePrompt = '', motionPrompt = '') {
  const parts = ['基于参考图生成一段视频，保持主体、画面风格和构图一致。']
  const motion = motionPrompt.trim()
  const source = sourcePrompt.trim()
  if (motion) parts.push(`动作要求：${motion}。`)
  if (source) parts.push(`参考图提示词：${source}`)
  return parts.join('')
}

export function createImageVideoTaskInProject(
  project: CanvasProject,
  nodeId: string,
  options: CreateImageVideoTaskOptions = {},
): ImageVideoTaskResult | null {
  const source = project.nodes.find((node) => node.id === nodeId)
  if (!isImageVideoSourceNode(source)) return null

  const createId = options.createId ?? defaultCreateId
  const now = options.now ?? defaultNow
  const createdAt = now()
  const prompt = buildImageVideoPrompt(source.metadata.prompt, options.prompt)
  const payload = buildImageVideoPayload(source, prompt, options, createdAt)
  const taskNode = createCanvasNode('video', generationTaskPositionForSource(source, project.nodes, project.connections), {
    createId,
    patch: {
      title: '图生视频任务',
      width: 360,
      height: 250,
      metadata: {
        status: 'idle',
        content: '',
        prompt,
        generationPayload: payload,
        model: payload.model,
        size: payload.size,
        count: payload.count,
        ...metadataFromVideoOptions(payload.video),
      },
    },
  })

  const projectWithTask = { ...project, nodes: [...project.nodes, taskNode], updatedAt: createdAt }
  return {
    project: addConnectionToProject(projectWithTask, { id: createId(), fromNodeId: source.id, toNodeId: taskNode.id }),
    nodeId: taskNode.id,
  }
}

function buildImageVideoPayload(source: CanvasNode, prompt: string, options: CreateImageVideoTaskOptions, createdAt: string): CanvasGenerationPayload {
  const video = normalizeCanvasVideoOptions({
    seconds: options.seconds ?? source.metadata.seconds,
    resolution: options.quality ?? source.metadata.vquality,
    generateAudio: options.generateAudio ?? source.metadata.generateAudio,
    watermark: options.watermark ?? source.metadata.watermark,
  })

  return {
    mode: 'video',
    model: options.videoModel || source.metadata.model || '默认模型',
    size: options.size || source.metadata.size || '720p',
    count: 1,
    prompt,
    summary: { text: 0, image: 1, video: 0, audio: 0 },
    video,
    inputs: [{
      nodeId: source.id,
      type: 'image',
      title: source.title,
      media: {
        url: source.metadata.content!,
        storageKey: source.metadata.storageKey,
        mimeType: source.metadata.mimeType,
        bytes: source.metadata.bytes,
        width: source.metadata.naturalWidth,
        height: source.metadata.naturalHeight,
      },
    }],
    createdAt,
  }
}

function isImageVideoSourceNode(node: CanvasNode | undefined): node is CanvasNode {
  return Boolean(node?.type === 'image' && node.metadata.content)
}
