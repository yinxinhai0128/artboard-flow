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

  it('uploads an external asset and inserts it as a selected canvas node', async () => {
    let currentProject: CanvasProject = { ...project, nodes: [], connections: [] }
    let currentSelection: string[] = []
    let counter = 1
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: currentSelection,
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
        currentSelection = next.selectedNodeIds
      },
      createId: (prefix = 'id') => `${prefix}-${counter++}`,
      now: () => '2026-07-20T02:00:00.000Z',
      assets: {
        list: async () => [],
        add: async () => ({
          storageKey: 'generated-result.png',
          url: '/api/assets/generated-result.png',
          mimeType: 'image/png',
          bytes: 1024,
          extension: 'png',
        }),
      },
    })

    const result = await bridge.addAssetNode({
      dataUrl: 'data:image/png;base64,abc',
      title: 'Generated result',
      position: { x: 240, y: 120 },
    })

    expect(result.asset.storageKey).toBe('generated-result.png')
    expect(result.project.nodes).toHaveLength(1)
    expect(result.project.nodes[0]).toMatchObject({
      id: 'node-1',
      type: 'image',
      title: 'Generated result',
      position: { x: 240, y: 120 },
      metadata: {
        content: '/api/assets/generated-result.png',
        storageKey: 'generated-result.png',
        mimeType: 'image/png',
        bytes: 1024,
        status: 'success',
      },
    })
    expect(currentProject.updatedAt).toBe('2026-07-20T02:00:00.000Z')
    expect(currentSelection).toEqual(['node-1'])
  })

  it('exposes a relationship graph snapshot for external hosts', () => {
    const graphProject: CanvasProject = {
      ...project,
      nodes: [
        project.nodes[0],
        {
          id: 'config-1',
          type: 'config',
          title: 'Generation config',
          position: { x: 420, y: 0 },
          width: 300,
          height: 300,
          metadata: {},
        },
      ],
      connections: [{ id: 'edge-1', fromNodeId: 'image-1', toNodeId: 'config-1' }],
    }
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: graphProject,
        selectedNodeIds: ['config-1'],
        selectedConnectionId: null,
      }),
      commit: () => {},
    })

    const graph = bridge.getGraph()

    expect(graph).toMatchObject({
      projectId: 'project-1',
      title: 'Host bridge test',
      nodeCount: 2,
      connectionCount: 1,
      nodeTypes: { image: 1, config: 1 },
    })
    expect(graph.nodes.find((node) => node.id === 'image-1')).toMatchObject({
      outgoing: [{ connectionId: 'edge-1', nodeId: 'config-1' }],
      outgoingCount: 1,
    })
    expect(graph.nodes.find((node) => node.id === 'config-1')).toMatchObject({
      incoming: [{ connectionId: 'edge-1', nodeId: 'image-1' }],
      incomingCount: 1,
    })
  })

  it('keeps bridge reads current immediately after applying ops', () => {
    const currentProject: CanvasProject = { ...project, nodes: [], connections: [] }
    let committedNodeIds: string[] = []
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        committedNodeIds = next.project.nodes.map((node) => node.id)
      },
      now: () => '2026-07-20T03:00:00.000Z',
    })

    bridge.applyOps([
      { type: 'add_node', id: 'text-1', nodeType: 'text', title: 'Prompt' },
      { type: 'add_node', id: 'config-1', nodeType: 'config', title: 'Config' },
      { type: 'connect_nodes', id: 'edge-1', fromNodeId: 'text-1', toNodeId: 'config-1' },
    ])

    expect(committedNodeIds).toEqual(['text-1', 'config-1'])
    expect(bridge.getSnapshot().project.nodes.map((node) => node.id)).toEqual(['text-1', 'config-1'])
    expect(bridge.getGraph()).toMatchObject({
      nodeCount: 2,
      connectionCount: 1,
      nodeTypes: { text: 1, config: 1 },
    })
    expect(bridge.getGraph().nodes.find((node) => node.id === 'text-1')?.outgoing).toEqual([
      { connectionId: 'edge-1', nodeId: 'config-1' },
    ])
  })

  it('exports a compact canvas snapshot for agent-style host integrations', () => {
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project,
        selectedNodeIds: ['image-1'],
        selectedConnectionId: null,
      }),
      commit: () => {},
    })

    expect(bridge.exportSnapshot()).toEqual({
      projectId: 'project-1',
      title: 'Host bridge test',
      nodes: project.nodes,
      connections: [],
      selectedNodeIds: ['image-1'],
      selectedConnectionId: null,
      viewport: { x: 0, y: 0, k: 1 },
    })
  })

  it('returns selected nodes and selected-node relations for host tools', () => {
    const selectionProject: CanvasProject = {
      ...project,
      nodes: [
        project.nodes[0],
        {
          id: 'config-1',
          type: 'config',
          title: 'Generation config',
          position: { x: 420, y: 0 },
          width: 300,
          height: 300,
          metadata: {},
        },
        {
          id: 'text-1',
          type: 'text',
          title: 'Prompt',
          position: { x: -320, y: 0 },
          width: 260,
          height: 180,
          metadata: { content: 'prompt' },
        },
      ],
      connections: [
        { id: 'selected-edge', fromNodeId: 'image-1', toNodeId: 'config-1' },
        { id: 'outside-edge', fromNodeId: 'text-1', toNodeId: 'image-1' },
      ],
    }
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: selectionProject,
        selectedNodeIds: ['image-1', 'config-1'],
        selectedConnectionId: null,
      }),
      commit: () => {},
    })

    expect(bridge.getSelection()).toEqual({
      nodes: [selectionProject.nodes[0], selectionProject.nodes[1]],
      connections: [{ id: 'selected-edge', fromNodeId: 'image-1', toNodeId: 'config-1' }],
      selectedNodeIds: ['image-1', 'config-1'],
      selectedConnectionId: null,
    })
  })

  it('provides high-level text and layout commands for agent-style hosts', () => {
    let currentProject: CanvasProject = { ...project, nodes: [], connections: [] }
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
      createId: (prefix = 'id') => `${prefix}-1`,
      now: () => '2026-07-20T04:00:00.000Z',
    })

    bridge.createTextNodes({
      items: [
        { id: 'text-a', text: 'first prompt', title: 'Prompt A' },
        { id: 'text-b', text: 'second prompt', title: 'Prompt B' },
      ],
      x: 100,
      y: 80,
      gap: 24,
      direction: 'row',
    })
    bridge.updateNodeText({ id: 'text-a', text: 'updated prompt', title: 'Updated Prompt' })
    bridge.moveNodes({ items: [{ id: 'text-a', dx: 10, dy: -20 }, { id: 'text-b', x: 640, y: 160 }] })
    bridge.resizeNode({ id: 'text-a', width: 360, height: 220, freeResize: true })

    expect(bridge.getSnapshot().project.nodes).toMatchObject([
      {
        id: 'text-a',
        type: 'text',
        title: 'Updated Prompt',
        position: { x: 110, y: 60 },
        width: 360,
        height: 220,
        metadata: {
          content: 'updated prompt',
          status: 'success',
          freeResize: true,
        },
      },
      {
        id: 'text-b',
        type: 'text',
        title: 'Prompt B',
        position: { x: 640, y: 160 },
        metadata: {
          content: 'second prompt',
          status: 'success',
        },
      },
    ])
    expect(bridge.getSnapshot().selectedNodeIds).toEqual(['text-b'])
    expect(currentProject.updatedAt).toBe('2026-07-20T04:00:00.000Z')
  })
})
