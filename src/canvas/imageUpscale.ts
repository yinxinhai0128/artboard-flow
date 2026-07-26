import { addConnectionToProject } from './document'
import { createCanvasNode } from './nodeFactory'
import type { CanvasAssetUpload, CanvasProject } from './types'

export type ImageUpscaleAlgorithm = 'high' | 'bilinear' | 'nearest'

export type ImageUpscaleParams = {
  targetLongEdge: number
  algorithm: ImageUpscaleAlgorithm
}

export type ImageUpscaleInput = {
  params: ImageUpscaleParams
  asset: CanvasAssetUpload
  width: number
  height: number
}

export type ImageUpscaleResult = {
  project: CanvasProject
  nodeId: string
}

export const MAX_UPSCALE_LONG_EDGE = 4096
export const DEFAULT_IMAGE_UPSCALE_PARAMS: ImageUpscaleParams = { targetLongEdge: 2048, algorithm: 'high' }

const UPSCALE_OFFSET_X = 96

export function resolveUpscaleSize(width: number, height: number, targetLongEdge: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { width: 1, height: 1 }
  const safeTarget = Math.min(MAX_UPSCALE_LONG_EDGE, Math.max(1, Math.floor(targetLongEdge)))
  const longEdge = Math.max(width, height)
  const scale = safeTarget / longEdge
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function createUpscaledImageNodeInProject(project: CanvasProject, nodeId: string, input: ImageUpscaleInput, createId: () => string): ImageUpscaleResult | null {
  const source = project.nodes.find((node) => node.id === nodeId)
  if (!source || source.type !== 'image' || !source.metadata.content) return null

  const sourceLongEdge = Math.max(source.metadata.naturalWidth ?? source.width, source.metadata.naturalHeight ?? source.height)
  const outputLongEdge = Math.max(input.width, input.height)
  if (!Number.isFinite(outputLongEdge) || outputLongEdge <= sourceLongEdge) return null

  const node = createCanvasNode('image', {
    x: source.position.x + source.width + UPSCALE_OFFSET_X,
    y: source.position.y,
  }, {
    createId,
    patch: {
      title: `${source.title || '图片'} 放大 ${outputLongEdge}px`,
      width: source.width,
      height: source.height,
      metadata: {
        content: input.asset.url,
        storageKey: input.asset.storageKey,
        status: 'success',
        prompt: source.metadata.prompt,
        mimeType: input.asset.mimeType || source.metadata.mimeType,
        bytes: input.asset.bytes,
        naturalWidth: input.width,
        naturalHeight: input.height,
        model: source.metadata.model,
        size: source.metadata.size,
        count: source.metadata.count,
        generatedAt: new Date().toISOString(),
      },
    },
  })

  const projectWithNode = { ...project, nodes: [...project.nodes, node] }
  return {
    project: addConnectionToProject(projectWithNode, { id: createId(), fromNodeId: source.id, toNodeId: node.id }),
    nodeId: node.id,
  }
}

export async function upscaleImageDataUrl(dataUrl: string, params: ImageUpscaleParams) {
  const image = await loadImage(dataUrl)
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  const { width, height } = resolveUpscaleSize(sourceWidth, sourceHeight, params.targetLongEdge)
  if (width <= sourceWidth && height <= sourceHeight) return { dataUrl, width: sourceWidth, height: sourceHeight }

  const canvas = params.algorithm === 'high'
    ? drawStepUpscale(image, width, height)
    : drawResizeCanvas(image, width, height, params.algorithm)

  return { dataUrl: canvas.toDataURL('image/png'), width, height }
}

function drawStepUpscale(image: HTMLImageElement, targetWidth: number, targetHeight: number) {
  const sourceWidth = image.naturalWidth || image.width
  const sourceHeight = image.naturalHeight || image.height
  let current = drawResizeCanvas(image, Math.min(targetWidth, sourceWidth * 2), Math.min(targetHeight, sourceHeight * 2), 'high')

  while (current.width < targetWidth || current.height < targetHeight) {
    current = drawResizeCanvas(current, Math.min(targetWidth, current.width * 2), Math.min(targetHeight, current.height * 2), 'high')
  }

  return current.width === targetWidth && current.height === targetHeight ? current : drawResizeCanvas(current, targetWidth, targetHeight, 'high')
}

function drawResizeCanvas(source: CanvasImageSource, width: number, height: number, algorithm: ImageUpscaleAlgorithm) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const context = canvas.getContext('2d')
  if (!context) return canvas
  context.imageSmoothingEnabled = algorithm !== 'nearest'
  context.imageSmoothingQuality = algorithm === 'bilinear' ? 'medium' : 'high'
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('IMAGE_UPSCALE_LOAD_FAILED'))
    image.src = src
  })
}
