import type { CanvasNode, NodeKind, Point } from './types'

export const canvasNodeDefaults: Record<NodeKind, { title: string; width: number; height: number; content: string }> = {
  text: { title: '文本节点', width: 260, height: 180, content: '写下提示词、分镜说明或生成备注。' },
  image: { title: '图片节点', width: 280, height: 220, content: '' },
  video: { title: '视频节点', width: 320, height: 220, content: '' },
  audio: { title: '音频节点', width: 300, height: 170, content: '' },
  config: { title: '配置节点', width: 300, height: 300, content: '模型、比例、数量等生成参数会放在这里。' },
  group: { title: '组', width: 360, height: 260, content: '' },
}

type CreateCanvasNodeOptions = {
  createId?: () => string
  patch?: Partial<CanvasNode>
}

export function createCanvasNode(type: NodeKind, position: Point, options: CreateCanvasNodeOptions = {}): CanvasNode {
  const defaults = canvasNodeDefaults[type]
  const patch = options.patch ?? {}
  return {
    ...patch,
    id: patch.id ?? options.createId?.() ?? crypto.randomUUID(),
    type,
    title: patch.title ?? defaults.title,
    position: patch.position ?? position,
    width: patch.width ?? defaults.width,
    height: patch.height ?? defaults.height,
    metadata: {
      content: defaults.content,
      status: 'idle',
      count: type === 'config' ? 1 : undefined,
      size: type === 'config' ? '1024x1024' : undefined,
      ...patch.metadata,
    },
  }
}
