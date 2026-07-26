import { addConnectionToProject } from './document'
import { createCanvasNode } from './nodeFactory'
import type { CanvasAssetUpload, CanvasProject } from './types'

export type ImageCropRect = {
  x: number
  y: number
  width: number
  height: number
}

export type ImageCropInput = {
  crop: ImageCropRect
  asset: CanvasAssetUpload
  width: number
  height: number
}

export type ImageCropResult = {
  project: CanvasProject
  nodeId: string
}

const CROP_OFFSET_X = 96

export function createCroppedImageNodeInProject(project: CanvasProject, nodeId: string, input: ImageCropInput, createId: () => string): ImageCropResult | null {
  const source = project.nodes.find((node) => node.id === nodeId)
  if (!source || source.type !== 'image' || !source.metadata.content || !isValidCrop(input.crop)) return null

  const node = createCanvasNode('image', {
    x: source.position.x + source.width + CROP_OFFSET_X,
    y: source.position.y,
  }, {
    createId,
    patch: {
      title: `${source.title || '图片'} 裁剪`,
      width: Math.max(80, source.width * input.crop.width),
      height: Math.max(60, source.height * input.crop.height),
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
        generatedAt: source.metadata.generatedAt,
      },
    },
  })

  const projectWithNode = { ...project, nodes: [...project.nodes, node] }
  return {
    project: addConnectionToProject(projectWithNode, { id: createId(), fromNodeId: source.id, toNodeId: node.id }),
    nodeId: node.id,
  }
}

export async function cropImageDataUrl(dataUrl: string, crop: ImageCropRect) {
  const safeCrop = normalizeCrop(crop)
  const image = await loadImage(dataUrl)
  const x = Math.floor(safeCrop.x * image.width)
  const y = Math.floor(safeCrop.y * image.height)
  const width = Math.max(1, Math.ceil(safeCrop.width * image.width))
  const height = Math.max(1, Math.ceil(safeCrop.height * image.height))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return { dataUrl, width, height }
  context.drawImage(image, x, y, width, height, 0, 0, width, height)
  return { dataUrl: canvas.toDataURL('image/png'), width, height }
}

function normalizeCrop(crop: ImageCropRect): ImageCropRect {
  if (!isValidCrop(crop)) return { x: 0, y: 0, width: 1, height: 1 }
  return {
    x: clamp(crop.x, 0, 1),
    y: clamp(crop.y, 0, 1),
    width: clamp(crop.width, 0.01, 1 - crop.x),
    height: clamp(crop.height, 0.01, 1 - crop.y),
  }
}

function isValidCrop(crop: ImageCropRect) {
  return Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) &&
    Number.isFinite(crop.height) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= 1.001 &&
    crop.y + crop.height <= 1.001
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('IMAGE_CROP_LOAD_FAILED'))
    image.src = src
  })
}
