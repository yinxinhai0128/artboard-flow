import { addConnectionToProject } from './document'
import { createCanvasNode } from './nodeFactory'
import type { CanvasAssetUpload, CanvasProject } from './types'

export type ImageGridSplitPiece = {
  row: number
  column: number
  asset: CanvasAssetUpload
  width?: number
  height?: number
}

export type ImageGridSplitInput = {
  rows: number
  columns: number
  pieces: ImageGridSplitPiece[]
}

export type ImageGridSplitParams = {
  rows: number
  columns: number
  horizontalLines?: number[]
  verticalLines?: number[]
}

export type ImageGridDataUrlPiece = {
  row: number
  column: number
  dataUrl: string
  width: number
  height: number
}

type SplitResult = {
  project: CanvasProject
  nodeIds: string[]
}

const GRID_GAP = 16
const GRID_OFFSET_X = 96

export function splitImageNodeIntoGrid(project: CanvasProject, nodeId: string, input: ImageGridSplitInput, createId: () => string): SplitResult | null {
  const source = project.nodes.find((node) => node.id === nodeId)
  if (!source || source.type !== 'image' || !source.metadata.content || input.pieces.length === 0) return null

  const rows = Math.max(1, Math.floor(input.rows))
  const columns = Math.max(1, Math.floor(input.columns))
  const cellWidth = source.width / columns
  const cellHeight = source.height / rows
  const startX = source.position.x + source.width + GRID_OFFSET_X
  const startY = source.position.y

  const nodes = input.pieces.map((piece, index) => {
    const asset = piece.asset
    return createCanvasNode('image', {
      x: startX + piece.column * (cellWidth + GRID_GAP),
      y: startY + piece.row * (cellHeight + GRID_GAP),
    }, {
      createId,
      patch: {
        title: `${source.title || '图片'} ${piece.row + 1}-${piece.column + 1}`,
        width: cellWidth,
        height: cellHeight,
        metadata: {
          content: asset.url,
          storageKey: asset.storageKey,
          status: 'success',
          prompt: source.metadata.prompt,
          mimeType: asset.mimeType || source.metadata.mimeType,
          bytes: asset.bytes,
          naturalWidth: piece.width,
          naturalHeight: piece.height,
          splitSourceNodeId: source.id,
          splitOutputIndex: index,
          model: source.metadata.model,
          size: source.metadata.size,
          count: source.metadata.count,
          generatedAt: source.metadata.generatedAt,
        },
      },
    })
  })

  const projectWithNodes = { ...project, nodes: [...project.nodes, ...nodes] }
  const nextProject = nodes.reduce(
    (current, node) => addConnectionToProject(current, { id: createId(), fromNodeId: source.id, toNodeId: node.id }),
    projectWithNodes,
  )

  return { project: nextProject, nodeIds: nodes.map((node) => node.id) }
}

export async function splitImageDataUrl(dataUrl: string, params: ImageGridSplitParams): Promise<ImageGridDataUrlPiece[]> {
  const image = await loadImage(dataUrl)
  const columns = Math.max(1, Math.floor(params.columns))
  const rows = Math.max(1, Math.floor(params.rows))
  const xCuts = splitCuts(params.verticalLines, image.naturalWidth || image.width, columns)
  const yCuts = splitCuts(params.horizontalLines, image.naturalHeight || image.height, rows)
  const pieces: ImageGridDataUrlPiece[] = []

  for (let row = 0; row < yCuts.length - 1; row += 1) {
    const y = yCuts[row]
    const height = yCuts[row + 1] - y
    for (let column = 0; column < xCuts.length - 1; column += 1) {
      const x = xCuts[column]
      const width = xCuts[column + 1] - x
      pieces.push({ row, column, width, height, dataUrl: drawImagePiece(image, x, y, width, height) })
    }
  }

  return pieces
}

function splitCuts(lines: number[] | undefined, size: number, count: number) {
  if (!lines?.length) return Array.from({ length: count + 1 }, (_, index) => Math.floor((index * size) / count))
  return [0, ...lines.map((line) => Math.round(line * size)).filter((line) => line > 0 && line < size).sort((a, b) => a - b), size]
}

function drawImagePiece(image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  const context = canvas.getContext('2d')
  if (!context) return image.src
  context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('IMAGE_GRID_SPLIT_LOAD_FAILED'))
    image.src = src
  })
}
