import { addConnectionToProject } from './document'
import { createCanvasNode } from './nodeFactory'
import type { CanvasNode, CanvasProject } from './types'

export const IMAGE_REVERSE_PROMPT_PRESET = `请根据参考图片反推一段适合用于 AI 生图的提示词。

要求：
1. 只输出提示词正文，不要解释。
2. 覆盖主体、构图、风格、光线、色彩、材质、镜头和氛围。
3. 尽量写成可直接用于生图模型的完整提示词。`

type CreateImageReversePromptFlowOptions = {
  createId?: () => string
  now?: () => string
  textModel?: string
}

type ImageReversePromptFlowResult = {
  project: CanvasProject
  nodeIds: {
    textNodeId: string
    configNodeId: string
  }
}

const FLOW_GAP = 96
const defaultCreateId = () => crypto.randomUUID()
const defaultNow = () => new Date().toISOString()

export function createImageReversePromptFlowInProject(
  project: CanvasProject,
  nodeId: string,
  options: CreateImageReversePromptFlowOptions = {},
): ImageReversePromptFlowResult | null {
  const source = project.nodes.find((node) => node.id === nodeId)
  if (!isReversePromptSourceNode(source)) return null

  const createId = options.createId ?? defaultCreateId
  const createdAt = (options.now ?? defaultNow)()
  const centerY = source.position.y + source.height / 2
  const startX = reversePromptFlowStartX(source, project)
  const textNode = createCanvasNode('text', { x: startX, y: centerY - 90 }, {
    createId,
    patch: {
      title: '反推提示词',
      metadata: {
        content: IMAGE_REVERSE_PROMPT_PRESET,
        prompt: IMAGE_REVERSE_PROMPT_PRESET,
        status: 'success',
      },
    },
  })
  const composerContent = `参考图片：@[node:${source.id}]\n任务说明：@[node:${textNode.id}]`
  const configNode = createCanvasNode('config', { x: textNode.position.x + textNode.width + FLOW_GAP, y: centerY - 150 }, {
    createId,
    patch: {
      title: '反推提示词配置',
      metadata: {
        generationMode: 'text',
        model: options.textModel || source.metadata.model || '默认模型',
        count: 1,
        composerContent,
        prompt: composerContent,
        status: 'idle',
      },
    },
  })

  const projectWithNodes = { ...project, nodes: [...project.nodes, textNode, configNode], updatedAt: createdAt }
  const withSourceConnection = addConnectionToProject(projectWithNodes, { id: createId(), fromNodeId: source.id, toNodeId: configNode.id })
  return {
    project: addConnectionToProject(withSourceConnection, { id: createId(), fromNodeId: textNode.id, toNodeId: configNode.id }),
    nodeIds: { textNodeId: textNode.id, configNodeId: configNode.id },
  }
}

function reversePromptFlowStartX(source: CanvasNode, project: CanvasProject) {
  const connectedChildren = new Set(project.connections.filter((connection) => connection.fromNodeId === source.id).map((connection) => connection.toNodeId))
  const right = project.nodes
    .filter((node) => connectedChildren.has(node.id))
    .reduce((maxRight, node) => Math.max(maxRight, node.position.x + node.width), source.position.x + source.width)
  return right + FLOW_GAP
}

function isReversePromptSourceNode(node: CanvasNode | undefined): node is CanvasNode {
  return Boolean(node?.type === 'image' && node.metadata.content)
}
