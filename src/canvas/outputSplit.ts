import { addConnectionToProject } from './document'
import { canvasNodeDefaults, createCanvasNode } from './nodeFactory'
import type { CanvasGenerationJobResult, CanvasNode, CanvasProject, NodeKind } from './types'

type SplitResult = {
  project: CanvasProject
  nodeIds: string[]
}

const splittableTypes = new Set<NodeKind>(['image', 'video', 'audio'])

export function generationOutputsForNode(node: CanvasNode): CanvasGenerationJobResult[] {
  return node.metadata.generationOutputs?.filter((output) => output.content) ?? []
}

export function splitGenerationOutputsInProject(project: CanvasProject, nodeId: string, createId: () => string): SplitResult | null {
  const source = project.nodes.find((node) => node.id === nodeId)
  if (!source || !splittableTypes.has(source.type)) return null

  const outputs = generationOutputsForNode(source)
  if (outputs.length <= 1) return null

  const existingIndexes = new Set(
    project.nodes
      .filter((node) => node.metadata.splitSourceNodeId === source.id)
      .map((node) => node.metadata.splitOutputIndex)
      .filter((index): index is number => Number.isInteger(index)),
  )

  const nodes: CanvasNode[] = []
  let nextProject = project

  outputs.forEach((output, index) => {
    if (existingIndexes.has(index)) return

    const node = createCanvasNode(source.type, splitNodePosition(source, index), {
      createId,
      patch: {
        title: `${source.title || canvasNodeDefaults[source.type].title} · 结果 ${index + 1}`,
        width: source.width,
        height: source.height,
        metadata: {
          content: output.content,
          status: 'success',
          prompt: source.metadata.prompt,
          mimeType: output.mimeType,
          bytes: output.bytes,
          naturalWidth: output.naturalWidth,
          naturalHeight: output.naturalHeight,
          splitSourceNodeId: source.id,
          splitOutputIndex: index,
          model: source.metadata.model,
          size: source.metadata.size,
          count: source.metadata.count,
          generatedAt: source.metadata.generatedAt,
        },
      },
    })

    nextProject = {
      ...nextProject,
      nodes: [...nextProject.nodes, node],
    }
    nextProject = addConnectionToProject(nextProject, { id: createId(), fromNodeId: source.id, toNodeId: node.id })
    nodes.push(node)
  })

  return nodes.length ? { project: nextProject, nodeIds: nodes.map((node) => node.id) } : null
}

function splitNodePosition(source: CanvasNode, outputIndex: number) {
  return {
    x: source.position.x + source.width + 120,
    y: source.position.y + outputIndex * Math.min(source.height + 36, 240),
  }
}
