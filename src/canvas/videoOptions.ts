import type { CanvasNode, CanvasVideoGenerationOptions } from './types'

export type CanvasVideoGenerationOptionInput = {
  seconds?: string | number
  quality?: string
  resolution?: string
  generateAudio?: boolean | string
  watermark?: boolean | string
}

export function normalizeCanvasVideoOptions(options: CanvasVideoGenerationOptionInput = {}): CanvasVideoGenerationOptions | undefined {
  const video: CanvasVideoGenerationOptions = {
    seconds: normalizeTextOption(options.seconds),
    resolution: normalizeTextOption(options.resolution ?? options.quality),
    generateAudio: normalizeBooleanOption(options.generateAudio),
    watermark: normalizeBooleanOption(options.watermark),
  }
  return hasVideoOptions(video) ? video : undefined
}

export function videoOptionsFromNodeMetadata(metadata: CanvasNode['metadata'] | undefined) {
  return normalizeCanvasVideoOptions({
    seconds: metadata?.seconds,
    resolution: metadata?.vquality,
    generateAudio: metadata?.generateAudio,
    watermark: metadata?.watermark,
  })
}

export function metadataFromVideoOptions(video: CanvasVideoGenerationOptions | undefined): Partial<CanvasNode['metadata']> {
  if (!video) return {}
  return {
    seconds: video.seconds,
    vquality: video.resolution,
    generateAudio: video.generateAudio,
    watermark: video.watermark,
  }
}

function normalizeTextOption(value: string | number | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function normalizeBooleanOption(value: boolean | string | undefined) {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function hasVideoOptions(video: CanvasVideoGenerationOptions) {
  return Boolean(video.seconds || video.resolution || video.generateAudio !== undefined || video.watermark !== undefined)
}
