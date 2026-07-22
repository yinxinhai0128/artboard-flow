import { describe, expect, it } from 'vitest'
import { createCanvasHostBridge } from './hostBridge'
import type { CanvasProject } from './types'

const project: CanvasProject = {
  id: 'project-1',
  title: 'Host bridge test',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  nodes: [
    {
      id: 'image-1',
      type: 'image',
      title: 'Reference image',
      position: { x: 0, y: 0 },
      width: 280,
      height: 220,
      metadata: {
        content: 'data:image/png;base64,abc',
        mimeType: 'image/png',
        status: 'success',
      },
    },
  ],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('canvas host bridge', () => {
  it('creates a generation flow and materializes autorun tasks for external hosts', () => {
    let currentProject = project
    let currentSelection: string[] = []
    let currentConnection: string | null = null
    let counter = 1
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: currentSelection,
        selectedConnectionId: currentConnection,
      }),
      commit: (next) => {
        currentProject = next.project
        currentSelection = next.selectedNodeIds
        currentConnection = next.selectedConnectionId
      },
      createId: (prefix = 'id') => `${prefix}-${counter++}`,
      now: () => '2026-07-20T01:00:00.000Z',
    })

    const result = bridge.createGenerationFlow({
      prompt: 'cinematic robot bird',
      mode: 'image',
      referenceNodeIds: ['image-1'],
      autoRun: true,
      model: 'image-model',
      size: '1024x1024',
      count: 1,
    })

    const textNode = result.project.nodes.find((node) => node.type === 'text')
    const configNode = result.project.nodes.find((node) => node.type === 'config')
    const taskNode = result.project.nodes.find((node) => node.metadata.generationPayload && !node.metadata.outputNodeId && node.id !== configNode?.id)

    expect(textNode?.metadata.content).toBe('cinematic robot bird')
    expect(configNode?.metadata.composerContent).toBe(`@[node:${textNode?.id}]\n@[node:image-1]`)
    expect(taskNode?.metadata.generationPayload?.prompt).toContain('cinematic robot bird')
    expect(result.project.connections).toEqual([
      { id: 'id-3', fromNodeId: textNode?.id, toNodeId: configNode?.id },
      { id: 'id-4', fromNodeId: 'image-1', toNodeId: configNode?.id },
      { id: 'id-6', fromNodeId: configNode?.id, toNodeId: taskNode?.id },
    ])
    expect(currentSelection).toEqual([taskNode?.id])

    const undone = bridge.undo()

    expect(undone?.project).toEqual(project)
    expect(currentProject).toEqual(project)
    expect(currentSelection).toEqual([])
    expect(currentConnection).toBeNull()
  })

  it('lists and adds assets through the host bridge adapter', async () => {
    const assets = [
      {
        storageKey: 'text-1.txt',
        url: '/api/assets/text-1.txt',
        mimeType: 'text/plain',
        bytes: 11,
        extension: 'txt',
        kind: 'text' as const,
        updatedAt: '2026-07-20T01:00:00.000Z',
      },
      {
        storageKey: 'image-1.png',
        url: '/api/assets/image-1.png',
        mimeType: 'image/png',
        bytes: 128,
        extension: 'png',
        kind: 'image' as const,
        updatedAt: '2026-07-20T01:00:00.000Z',
      },
    ]
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: () => {},
      assets: {
        list: async () => assets,
        add: async (dataUrl) => ({
          storageKey: 'new-image.png',
          url: dataUrl,
          mimeType: 'image/png',
          bytes: 256,
          extension: 'png',
        }),
      },
    })

    await expect(bridge.listAssets({ kind: 'image' })).resolves.toEqual([assets[1]])
    await expect(bridge.addAsset({ dataUrl: 'data:image/png;base64,abc' })).resolves.toEqual({
      storageKey: 'new-image.png',
      url: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      bytes: 256,
      extension: 'png',
    })
  })
})
