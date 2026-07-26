import { addConnectionToProject } from './document'
import { generationTaskPositionForSource } from './generation'
import { createCanvasNode } from './nodeFactory'
import type { CanvasGenerationPayload, CanvasNode, CanvasProject } from './types'

export type ImageAngleParams = {
  horizontalAngle: number
  pitchAngle: number
  cameraDistance: number
  wideAngle: boolean
}

export type ImageAngleTaskResult = {
  project: CanvasProject
  nodeId: string
}

type CreateImageAngleTaskOptions = {
  createId?: () => string
  now?: () => string
}

const defaultCreateId = () => crypto.randomUUID()
const defaultNow = () => new Date().toISOString()

export const DEFAULT_IMAGE_ANGLE_PARAMS: ImageAngleParams = {
  horizontalAngle: 0,
  pitchAngle: 9,
  cameraDistance: 4.8,
  wideAngle: false,
}

export function buildAngleLabel(params: ImageAngleParams) {
  const normalized = normalizeAngleParams(params)
  const horizontal = normalized.horizontalAngle === 0
    ? '正面视角'
    : normalized.horizontalAngle > 0
      ? `向右旋转 ${normalized.horizontalAngle} 度`
      : `向左旋转 ${Math.abs(normalized.horizontalAngle)} 度`
  const pitch = normalized.pitchAngle === 0
    ? '水平视角'
    : normalized.pitchAngle > 0
      ? `俯视 ${normalized.pitchAngle} 度`
      : `仰视 ${Math.abs(normalized.pitchAngle)} 度`
  return `AI 多角度：${horizontal}，${pitch}，镜头距离 ${normalized.cameraDistance.toFixed(1)}，${normalized.wideAngle ? '广角' : '标准'}镜头`
}

export function buildAnglePrompt(params: ImageAngleParams) {
  return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。`
}

export function createImageAngleTaskInProject(
  project: CanvasProject,
  nodeId: string,
  params: ImageAngleParams,
  options: CreateImageAngleTaskOptions = {},
): ImageAngleTaskResult | null {
  const source = project.nodes.find((node) => node.id === nodeId)
  if (!isAngleSourceNode(source)) return null

  const createId = options.createId ?? defaultCreateId
  const now = options.now ?? defaultNow
  const createdAt = now()
  const normalizedParams = normalizeAngleParams(params)
  const prompt = buildAnglePrompt(normalizedParams)
  const payload = buildAnglePayload(source, prompt, createdAt)
  const taskNode = createCanvasNode('image', generationTaskPositionForSource(source, project.nodes, project.connections), {
    createId,
    patch: {
      title: buildAngleLabel(normalizedParams),
      width: 320,
      height: 240,
      metadata: {
        status: 'idle',
        content: '',
        prompt,
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

function buildAnglePayload(source: CanvasNode, prompt: string, createdAt: string): CanvasGenerationPayload {
  return {
    mode: 'image',
    model: source.metadata.model || '默认模型',
    size: source.metadata.size || '1024x1024',
    count: 1,
    prompt,
    summary: { text: 0, image: 1, video: 0, audio: 0 },
    inputs: [{
      nodeId: source.id,
      type: 'image',
      title: source.title,
      media: {
        url: source.metadata.content!,
        mimeType: source.metadata.mimeType,
        bytes: source.metadata.bytes,
        width: source.metadata.naturalWidth,
        height: source.metadata.naturalHeight,
      },
    }],
    createdAt,
  }
}

function isAngleSourceNode(node: CanvasNode | undefined): node is CanvasNode {
  return Boolean(node?.type === 'image' && node.metadata.content)
}

function normalizeAngleParams(params: ImageAngleParams): ImageAngleParams {
  return {
    horizontalAngle: clampInteger(params.horizontalAngle, -60, 60, DEFAULT_IMAGE_ANGLE_PARAMS.horizontalAngle),
    pitchAngle: clampInteger(params.pitchAngle, -45, 45, DEFAULT_IMAGE_ANGLE_PARAMS.pitchAngle),
    cameraDistance: clampDecimal(params.cameraDistance, 1, 10, DEFAULT_IMAGE_ANGLE_PARAMS.cameraDistance),
    wideAngle: params.wideAngle === true,
  }
}

function clampInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function clampDecimal(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value * 10) / 10))
}
