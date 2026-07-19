import type { CanvasConnection, CanvasGenerationMode, CanvasNode, NodeKind } from './types'

export const CONFIG_REFERENCE_PATTERN = /@\[node:([^\]]+)\]/g

export type CanvasGenerationInput = {
  nodeId: string
  type: Exclude<NodeKind, 'config'>
  title: string
  preview: string
  hasContent: boolean
  text?: string
  media?: {
    url: string
    mimeType?: string
    bytes?: number
    width?: number
    height?: number
  }
}

export type CanvasGenerationSummary = Record<Exclude<NodeKind, 'config'>, number>

export type CanvasGenerationContext = {
  configNodeId: string
  mode: CanvasGenerationMode
  model: string
  size: string
  count: number
  prompt: string
  inputs: CanvasGenerationInput[]
  referenceImages: CanvasGenerationInput[]
  referenceVideos: CanvasGenerationInput[]
  summary: CanvasGenerationSummary
  ready: boolean
  warnings: string[]
}

const defaultSummary = (): CanvasGenerationSummary => ({ text: 0, image: 0, video: 0 })

export function buildCanvasGenerationInputs(configNodeId: string, nodes: CanvasNode[], connections: CanvasConnection[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  return connections
    .filter((connection) => connection.toNodeId === configNodeId)
    .flatMap((connection): CanvasGenerationInput[] => {
      const node = nodeMap.get(connection.fromNodeId)
      const input = node ? generationInputFromNode(node) : null
      return input ? [input] : []
    })
}

export function buildCanvasGenerationContext(configNodeId: string, nodes: CanvasNode[], connections: CanvasConnection[]): CanvasGenerationContext {
  const configNode = nodes.find((node) => node.id === configNodeId)
  const inputs = buildCanvasGenerationInputs(configNodeId, nodes, connections)
  const mode = normalizeGenerationMode(configNode?.metadata.generationMode)
  const model = configNode?.metadata.model || '默认模型'
  const size = configNode?.metadata.size || '1024x1024'
  const count = Math.max(1, Math.floor(Math.abs(Number(configNode?.metadata.count)) || 1))
  const composerPrompt = configNode?.metadata.composerContent?.trim()
  const basePrompt = composerPrompt || configNode?.metadata.prompt || ''
  const composerContext = composerPrompt ? buildComposerPrompt(inputs, basePrompt) : null
  const prompt = composerContext ? composerContext.prompt : buildDefaultPrompt(inputs, basePrompt)
  const selectedInputs = composerContext ? composerContext.selectedInputs : inputs
  const referenceImages = selectedInputs.filter((input) => input.type === 'image' && input.media)
  const referenceVideos = selectedInputs.filter((input) => input.type === 'video' && input.media)
  const summary = summarizeInputs(selectedInputs)
  const hasAnyReference = Boolean(summary.text || summary.image || summary.video)
  const ready = Boolean(prompt.trim() || hasAnyReference)
  const warnings = ready ? [] : ['请先输入提示词，或连接有内容的文本、图片、视频节点。']

  return {
    configNodeId,
    mode,
    model,
    size,
    count,
    prompt,
    inputs,
    referenceImages,
    referenceVideos,
    summary,
    ready,
    warnings,
  }
}

export function summarizeInputs(inputs: CanvasGenerationInput[]) {
  const summary = defaultSummary()
  inputs.forEach((input) => {
    summary[input.type] += 1
  })
  return summary
}

function generationInputFromNode(node: CanvasNode): CanvasGenerationInput | null {
  if (node.type === 'config') return null
  if (node.type === 'text') {
    const text = node.metadata.content || node.metadata.prompt || ''
    if (!text.trim()) return null
    return {
      nodeId: node.id,
      type: 'text',
      title: node.title,
      text,
      preview: text,
      hasContent: true,
    }
  }
  if (!node.metadata.content) return null
  return {
    nodeId: node.id,
    type: node.type,
    title: node.title,
    preview: node.metadata.mimeType || '已载入媒体内容',
    hasContent: true,
    media: {
      url: node.metadata.content,
      mimeType: node.metadata.mimeType,
      bytes: node.metadata.bytes,
      width: node.metadata.naturalWidth,
      height: node.metadata.naturalHeight,
    },
  }
}

function normalizeGenerationMode(mode: CanvasGenerationMode | undefined): CanvasGenerationMode {
  return mode === 'video' || mode === 'text' ? mode : 'image'
}

function buildDefaultPrompt(inputs: CanvasGenerationInput[], basePrompt: string) {
  const upstreamText = inputs
    .map((input) => input.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join('\n\n')
  return [basePrompt.trim(), upstreamText].filter(Boolean).join('\n\n')
}

function buildComposerPrompt(inputs: CanvasGenerationInput[], sourcePrompt: string) {
  const inputByNodeId = new Map(inputs.map((input) => [input.nodeId, input]))
  const selectedInputs: CanvasGenerationInput[] = []
  const labelByNodeId = new Map<string, string>()
  const textBlocks: string[] = []
  const counts = defaultSummary()
  let nextPrompt = ''
  let lastIndex = 0

  for (const match of sourcePrompt.matchAll(CONFIG_REFERENCE_PATTERN)) {
    if (match.index === undefined) continue
    nextPrompt += sourcePrompt.slice(lastIndex, match.index)
    const input = inputByNodeId.get(match[1])
    if (input) {
      let label = labelByNodeId.get(input.nodeId)
      if (!label) {
        label = generationLabel(input.type, counts[input.type]++)
        labelByNodeId.set(input.nodeId, label)
        selectedInputs.push(input)
        if (input.type === 'text' && input.text) textBlocks.push(`【${label}】\n${input.text}`)
      }
      nextPrompt += input.type === 'text' ? `【${label}】` : label
    }
    lastIndex = match.index + match[0].length
  }

  nextPrompt += sourcePrompt.slice(lastIndex)
  if (textBlocks.length) nextPrompt = `${nextPrompt.trim()}\n\n${textBlocks.join('\n\n')}`
  return { prompt: nextPrompt.trim(), selectedInputs }
}

function generationLabel(type: CanvasGenerationInput['type'], index: number) {
  if (type === 'image') return `图片${index + 1}`
  if (type === 'video') return `视频${index + 1}`
  return `文本${index + 1}`
}
