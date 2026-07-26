import { addConnectionToProject } from './document'
import { generationTaskPositionForSource } from './generation'
import { createCanvasNode } from './nodeFactory'
import type { CanvasAssetUpload, CanvasGenerationMedia, CanvasGenerationPayload, CanvasNode, CanvasProject } from './types'

export type ImageMaskEditPayload = {
  prompt: string
  maskAsset: CanvasAssetUpload
  maskWidth?: number
  maskHeight?: number
}

export type ImageMaskEditTaskResult = {
  project: CanvasProject
  nodeId: string
}

type CreateImageMaskEditTaskOptions = {
  createId?: () => string
  now?: () => string
}

const defaultCreateId = () => crypto.randomUUID()
const defaultNow = () => new Date().toISOString()

export function buildMaskEditPrompt(prompt: string) {
  const userPrompt = prompt.trim()
  return userPrompt ? `只修改蒙版透明区域，其他区域保持不变。${userPrompt}` : ''
}

export function createImageMaskEditTaskInProject(
  project: CanvasProject,
  nodeId: string,
  input: ImageMaskEditPayload,
  options: CreateImageMaskEditTaskOptions = {},
): ImageMaskEditTaskResult | null {
  const source = project.nodes.find((node) => node.id === nodeId)
  const prompt = buildMaskEditPrompt(input.prompt)
  if (!isMaskEditSourceNode(source) || !prompt || !input.maskAsset.url) return null

  const createId = options.createId ?? defaultCreateId
  const now = options.now ?? defaultNow
  const createdAt = now()
  const editMask = maskMediaFromInput(input)
  const payload = buildMaskEditPayload(source, prompt, editMask, createdAt)
  const taskNode = createCanvasNode('image', generationTaskPositionForSource(source, project.nodes, project.connections), {
    createId,
    patch: {
      title: input.prompt.trim().slice(0, 32) || '局部编辑结果',
      width: source.width,
      height: source.height,
      metadata: {
        status: 'idle',
        content: '',
        prompt,
        generationType: 'edit',
        editMask,
        generationPayload: payload,
        model: payload.model,
        size: payload.size,
        count: payload.count,
      },
    },
  })

  const projectWithTask = { ...project, nodes: [...project.nodes, taskNode], updatedAt: createdAt }
  return {
    project: addConnectionToProject(projectWithTask, { id: createId(), fromNodeId: source.id, toNodeId: taskNode.id }),
    nodeId: taskNode.id,
  }
}

function buildMaskEditPayload(source: CanvasNode, prompt: string, editMask: CanvasGenerationMedia, createdAt: string): CanvasGenerationPayload {
  return {
    mode: 'image',
    generationType: 'edit',
    model: source.metadata.model || '默认模型',
    size: source.metadata.size || '1024x1024',
    count: 1,
    prompt,
    summary: { text: 0, image: 1, video: 0, audio: 0 },
    editMask,
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

function maskMediaFromInput(input: ImageMaskEditPayload): CanvasGenerationMedia {
  return {
    url: input.maskAsset.url,
    storageKey: input.maskAsset.storageKey,
    mimeType: input.maskAsset.mimeType,
    bytes: input.maskAsset.bytes,
    width: input.maskWidth,
    height: input.maskHeight,
  }
}

function isMaskEditSourceNode(node: CanvasNode | undefined): node is CanvasNode {
  return Boolean(node?.type === 'image' && node.metadata.content)
}
