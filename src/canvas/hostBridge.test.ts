import { describe, expect, it } from 'vitest'
import { createCanvasHostBridge } from './hostBridge'
import type { CanvasGenerationJob, CanvasProject } from './types'

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
  it('describes available canvas host commands for external agents', () => {
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: () => {},
    })

    expect(bridge.getCapabilities()).toEqual(expect.arrayContaining([
      { name: 'getSnapshot', scope: 'canvas', description: '读取当前画布项目、选区和连线状态。' },
      { name: 'connectNodes', scope: 'canvas', description: '批量创建节点之间的关系连线。' },
      { name: 'createImagePromptFlow', scope: 'generation', description: '创建提示词文本、图片生成配置和任务节点关系链。' },
      { name: 'submitGenerationTask', scope: 'generation', description: '把已有生成任务节点提交给宿主生成适配器。' },
      { name: 'searchAssets', scope: 'assets', description: '按类型、关键词和分页查询宿主素材库。' },
    ]))
  })

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

  it('searches host assets with kind, keyword, and pagination for agent-style listing', async () => {
    const assets = [
      {
        storageKey: 'hero-a.png',
        url: '/api/assets/hero-a.png',
        mimeType: 'image/png',
        bytes: 128,
        extension: 'png',
        kind: 'image' as const,
        updatedAt: '2026-07-20T03:00:00.000Z',
      },
      {
        storageKey: 'note-hero.txt',
        url: '/api/assets/note-hero.txt',
        mimeType: 'text/plain',
        bytes: 64,
        extension: 'txt',
        kind: 'text' as const,
        updatedAt: '2026-07-20T04:00:00.000Z',
      },
      {
        storageKey: 'hero-b.png',
        url: '/api/assets/hero-b.png',
        mimeType: 'image/png',
        bytes: 256,
        extension: 'png',
        kind: 'image' as const,
        updatedAt: '2026-07-20T05:00:00.000Z',
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
        add: async () => assets[0],
      },
    })

    await expect(bridge.searchAssets({ kind: 'image', keyword: 'hero', page: 2, pageSize: 1 })).resolves.toEqual({
      total: 2,
      page: 2,
      pageSize: 1,
      items: [assets[0]],
    })
  })

  it('returns generation job status for external hosts with task, node, scope, and limit filters', async () => {
    const jobs: CanvasGenerationJob[] = [
      {
        id: 'job-queued',
        projectId: 'project-1',
        nodeId: 'task-1',
        status: 'queued',
        createdAt: '2026-07-20T01:00:00.000Z',
        updatedAt: '2026-07-20T01:00:00.000Z',
        payload: {
          mode: 'image',
          model: 'image-model',
          size: '1024x1024',
          count: 1,
          prompt: 'queued prompt',
          summary: { text: 1, image: 0, video: 0, audio: 0 },
          inputs: [],
          createdAt: '2026-07-20T01:00:00.000Z',
        },
        result: null,
      },
      {
        id: 'job-succeeded',
        projectId: 'project-1',
        nodeId: 'task-1',
        status: 'succeeded',
        createdAt: '2026-07-20T02:00:00.000Z',
        updatedAt: '2026-07-20T03:00:00.000Z',
        payload: {
          mode: 'image',
          model: 'image-model',
          size: '1024x1024',
          count: 1,
          prompt: 'finished prompt',
          summary: { text: 1, image: 0, video: 0, audio: 0 },
          inputs: [],
          createdAt: '2026-07-20T02:00:00.000Z',
        },
        result: { content: '/api/assets/out.png', mimeType: 'image/png' },
      },
      {
        id: 'job-video',
        projectId: 'project-1',
        nodeId: 'task-2',
        status: 'running',
        createdAt: '2026-07-20T04:00:00.000Z',
        updatedAt: '2026-07-20T04:00:00.000Z',
        payload: {
          mode: 'video',
          model: 'video-model',
          size: '1280x720',
          count: 1,
          prompt: 'video prompt',
          summary: { text: 1, image: 0, video: 0, audio: 0 },
          inputs: [],
          createdAt: '2026-07-20T04:00:00.000Z',
        },
        result: null,
      },
    ]
    const requestedProjectIds: string[] = []
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: () => {},
      generation: {
        list: async (filter) => {
          requestedProjectIds.push(filter.projectId)
          return jobs
        },
      },
    })

    await expect(bridge.getGenerationStatus({ nodeIds: ['task-1'], scope: 'image', limit: 1 })).resolves.toEqual({
      total: 2,
      summary: { queued: 1, running: 0, succeeded: 1, failed: 0, cancelled: 0 },
      jobs: [jobs[0]],
    })
    await expect(bridge.getGenerationStatus({ taskId: 'job-video' })).resolves.toMatchObject({
      total: 1,
      summary: { queued: 0, running: 1, succeeded: 0, failed: 0, cancelled: 0 },
      jobs: [jobs[2]],
    })
    expect(requestedProjectIds).toEqual(['project-1', 'project-1'])
  })

  it('submits host-created generation task nodes through the generation adapter', async () => {
    let currentProject: CanvasProject = { ...project, nodes: [], connections: [] }
    let counter = 1
    const submitted: Array<{ projectId: string; nodeId: string; prompt: string }> = []
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
      createId: (prefix = 'id') => `${prefix}-${counter++}`,
      now: () => '2026-07-20T06:00:00.000Z',
      generation: {
        list: async () => [],
        submit: async (projectId, nodeId, payload) => {
          submitted.push({ projectId, nodeId, prompt: payload.prompt })
          return {
            id: 'job-1',
            projectId,
            nodeId,
            status: 'queued',
            createdAt: '2026-07-20T06:01:00.000Z',
            updatedAt: '2026-07-20T06:01:00.000Z',
            payload,
            result: null,
          }
        },
      },
    })

    bridge.createConfigNode({
      id: 'config-1',
      mode: 'image',
      prompt: 'submit from host bridge',
      autoRun: true,
    })
    const result = await bridge.submitGenerationTask({ nodeId: 'task-1' })

    expect(submitted).toEqual([{ projectId: 'project-1', nodeId: 'task-1', prompt: 'submit from host bridge' }])
    expect(result.job.id).toBe('job-1')
    expect(currentProject.nodes.find((node) => node.id === 'task-1')?.metadata).toMatchObject({
      generationJobId: 'job-1',
      generationJobStatus: 'queued',
      status: 'loading',
    })
  })

  it('provides generation shortcuts that create autorun flows for AI hosts', () => {
    let currentProject = project
    let counter = 1
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
      createId: (prefix = 'id') => `${prefix}-${counter++}`,
      now: () => '2026-07-20T07:00:00.000Z',
    })

    const imageResult = bridge.generateImage({
      prompt: 'shortcut image prompt',
      referenceNodeIds: ['image-1'],
      model: 'image-model',
      size: '1024x1024',
      count: 1,
    })
    const imageTask = imageResult.project.nodes.find((node) => node.type === 'image' && node.metadata.generationPayload?.mode === 'image' && !node.metadata.outputNodeId)

    expect(imageTask?.metadata.generationPayload?.prompt).toContain('shortcut image prompt')
    expect(imageResult.generationRequests).toHaveLength(1)

    const videoResult = bridge.generateVideo({
      prompt: 'shortcut video prompt',
      model: 'video-model',
      size: '1280x720',
      count: 1,
    })
    const videoTask = videoResult.project.nodes.find((node) => node.type === 'video' && node.metadata.generationPayload?.mode === 'video' && !node.metadata.outputNodeId)

    expect(videoTask?.type).toBe('video')
    expect(videoTask?.metadata.generationPayload?.prompt).toContain('shortcut video prompt')
    expect(videoResult.generationRequests).toHaveLength(1)
    expect(videoResult.generationRequests[0]).toMatchObject({
      nodeId: videoResult.project.nodes.find((node) => node.type === 'config' && node.metadata.generationMode === 'video')?.id,
      mode: 'video',
    })
    expect(videoResult.generationRequests[0]?.prompt).toContain('@[node:text-')
  })

  it('keeps an image prompt flow shortcut compatible with agent-style commands', () => {
    let currentProject = project
    let counter = 1
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
      createId: (prefix = 'id') => `${prefix}-${counter++}`,
      now: () => '2026-07-20T07:30:00.000Z',
    })

    const result = bridge.createImagePromptFlow({
      prompt: 'agent compatible image flow',
      x: 120,
      y: 160,
      model: 'image-model',
      size: '1024x1024',
      count: 2,
      autoRun: true,
    })
    const textNode = result.project.nodes.find((node) => node.type === 'text')
    const configNode = result.project.nodes.find((node) => node.type === 'config')
    const taskNode = result.project.nodes.find((node) => node.type === 'image' && node.metadata.generationPayload?.mode === 'image' && !node.metadata.outputNodeId)

    expect(textNode?.position).toEqual({ x: 120, y: 160 })
    expect(configNode?.metadata).toMatchObject({ generationMode: 'image', model: 'image-model', size: '1024x1024', count: 2 })
    expect(taskNode?.metadata.generationPayload?.prompt).toContain('agent compatible image flow')
    expect(result.generationRequests).toHaveLength(1)
  })

  it('updates arbitrary node fields and metadata for host-side generated results', () => {
    let currentProject = project
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
    })

    const result = bridge.updateNode({
      id: 'image-1',
      patch: { title: 'Generated output', width: 512, height: 512 },
      metadata: {
        content: '/api/assets/generated.png',
        status: 'success',
        mimeType: 'image/png',
        naturalWidth: 1024,
        naturalHeight: 1024,
      },
    })

    expect(result.project.nodes.find((node) => node.id === 'image-1')).toMatchObject({
      title: 'Generated output',
      width: 512,
      height: 512,
      metadata: {
        content: '/api/assets/generated.png',
        status: 'success',
        mimeType: 'image/png',
        naturalWidth: 1024,
        naturalHeight: 1024,
      },
    })
    expect(bridge.undo()?.project.nodes.find((node) => node.id === 'image-1')?.metadata.content).toBe('data:image/png;base64,abc')
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

  it('adds text content as reusable host assets and canvas asset nodes', async () => {
    let currentProject: CanvasProject = { ...project, nodes: [], connections: [] }
    const uploadedDataUrls: string[] = []
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
      createId: () => 'node-text-asset',
      assets: {
        list: async () => [],
        add: async (dataUrl) => {
          uploadedDataUrls.push(dataUrl)
          return {
            storageKey: 'agent-note.txt',
            url: '/api/assets/agent-note.txt',
            mimeType: 'text/plain',
            bytes: 15,
            extension: 'txt',
          }
        },
      },
    })

    await expect(bridge.addTextAsset({ text: 'Agent note 中文' })).resolves.toMatchObject({
      storageKey: 'agent-note.txt',
      mimeType: 'text/plain',
    })
    const result = await bridge.addTextAssetNode({
      text: 'Agent note 中文',
      title: 'Agent note',
      x: 120,
      y: 180,
    })

    expect(uploadedDataUrls).toEqual([
      'data:text/plain;charset=utf-8,Agent%20note%20%E4%B8%AD%E6%96%87',
      'data:text/plain;charset=utf-8,Agent%20note%20%E4%B8%AD%E6%96%87',
    ])
    expect(result.project.nodes[0]).toMatchObject({
      id: 'node-text-asset',
      type: 'text',
      title: 'Agent note',
      position: { x: 120, y: 180 },
      metadata: {
        content: '/api/assets/agent-note.txt',
        storageKey: 'agent-note.txt',
        mimeType: 'text/plain',
        status: 'success',
      },
    })
  })

  it('adds image URLs as reusable host assets and canvas asset nodes', async () => {
    let currentProject: CanvasProject = { ...project, nodes: [], connections: [] }
    const uploadedDataUrls: string[] = []
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
      createId: () => 'node-image-asset',
      assets: {
        list: async () => [],
        add: async (dataUrl) => {
          uploadedDataUrls.push(dataUrl)
          return {
            storageKey: 'agent-image.png',
            url: '/api/assets/agent-image.png',
            mimeType: 'image/png',
            bytes: 32,
            extension: 'png',
          }
        },
      },
    })

    await expect(bridge.addImageAsset({ imageUrl: 'data:image/png;base64,aGVybw==' })).resolves.toMatchObject({
      storageKey: 'agent-image.png',
      mimeType: 'image/png',
    })
    const result = await bridge.addImageAssetNode({
      imageUrl: 'data:image/png;base64,aGVybw==',
      title: 'Agent image',
      x: 220,
      y: 260,
    })

    expect(uploadedDataUrls).toEqual([
      'data:image/png;base64,aGVybw==',
      'data:image/png;base64,aGVybw==',
    ])
    expect(result.project.nodes[0]).toMatchObject({
      id: 'node-image-asset',
      type: 'image',
      title: 'Agent image',
      position: { x: 220, y: 260 },
      metadata: {
        content: '/api/assets/agent-image.png',
        storageKey: 'agent-image.png',
        mimeType: 'image/png',
        status: 'success',
      },
    })
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
    let counter = 1
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
      createId: (prefix = 'id') => `${prefix}-${counter++}`,
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

  it('provides high-level relation, selection, viewport, deletion, and generation commands', () => {
    let currentProject: CanvasProject = {
      ...project,
      nodes: [
        {
          id: 'text-1',
          type: 'text',
          title: 'Prompt',
          position: { x: 0, y: 0 },
          width: 260,
          height: 180,
          metadata: { content: 'cinematic prompt', status: 'success' },
        },
        {
          id: 'config-1',
          type: 'config',
          title: 'Config',
          position: { x: 420, y: 0 },
          width: 300,
          height: 300,
          metadata: { generationMode: 'image', composerContent: '@[node:text-1]', status: 'idle' },
        },
      ],
      connections: [],
    }
    let counter = 1
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
      createId: (prefix = 'id') => `${prefix}-${counter++}`,
      now: () => '2026-07-20T05:00:00.000Z',
    })

    bridge.connectNodes({ connections: [{ fromNodeId: 'text-1', toNodeId: 'config-1' }] })
    bridge.selectNodes({ ids: ['text-1', 'config-1', 'missing'] })
    bridge.setViewport({ viewport: { x: 120, y: 80, k: 1.25 } })
    const generated = bridge.runGeneration({ nodeId: 'config-1', mode: 'image' })

    expect(generated.generationRequests).toEqual([
      { nodeId: 'config-1', mode: 'image', prompt: '@[node:text-1]' },
    ])
    expect(bridge.getSnapshot().selectedNodeIds).toEqual(['task-2'])
    expect(bridge.getSnapshot().project.viewport).toEqual({ x: 120, y: 80, k: 1.25 })
    expect(bridge.getSnapshot().project.connections).toEqual([
      { id: 'id-1', fromNodeId: 'text-1', toNodeId: 'config-1' },
      { id: 'id-3', fromNodeId: 'config-1', toNodeId: 'task-2' },
    ])

    bridge.deleteNodes({ ids: ['text-1'] })

    expect(bridge.getSnapshot().project.nodes.map((node) => node.id)).toEqual(['config-1', 'task-2'])
    expect(bridge.getSnapshot().project.connections).toEqual([
      { id: 'id-3', fromNodeId: 'config-1', toNodeId: 'task-2' },
    ])
  })

  it('provides high-level generic node, text node, and config node creation commands', () => {
    let currentProject: CanvasProject = { ...project, nodes: [], connections: [] }
    let counter = 1
    const bridge = createCanvasHostBridge({
      getSnapshot: () => ({
        project: currentProject,
        selectedNodeIds: [],
        selectedConnectionId: null,
      }),
      commit: (next) => {
        currentProject = next.project
      },
      createId: (prefix = 'id') => `${prefix}-${counter++}`,
      now: () => '2026-07-20T06:00:00.000Z',
    })

    bridge.createNode({
      id: 'image-1',
      nodeType: 'image',
      title: 'Reference',
      x: 120,
      y: 80,
      metadata: { content: '/api/assets/ref.png', status: 'success', mimeType: 'image/png' },
    })
    bridge.createTextNode({
      id: 'text-1',
      title: 'Prompt',
      text: 'single prompt',
      x: 460,
      y: 80,
      width: 320,
    })
    const generated = bridge.createConfigNode({
      id: 'config-1',
      title: 'Image Config',
      mode: 'image',
      prompt: 'direct config prompt',
      x: 840,
      y: 80,
      model: 'image-model',
      size: '1024x1024',
      count: 2,
      autoRun: true,
    })

    expect(generated.generationRequests).toEqual([
      { nodeId: 'config-1', mode: 'image', prompt: 'direct config prompt' },
    ])
    expect(bridge.getSnapshot().project.nodes).toMatchObject([
      {
        id: 'image-1',
        type: 'image',
        title: 'Reference',
        position: { x: 120, y: 80 },
        metadata: { content: '/api/assets/ref.png', status: 'success', mimeType: 'image/png' },
      },
      {
        id: 'text-1',
        type: 'text',
        title: 'Prompt',
        position: { x: 460, y: 80 },
        width: 320,
        metadata: { content: 'single prompt', status: 'success' },
      },
      {
        id: 'config-1',
        type: 'config',
        title: 'Image Config',
        position: { x: 840, y: 80 },
        metadata: {
          generationMode: 'image',
          composerContent: 'direct config prompt',
          prompt: 'direct config prompt',
          model: 'image-model',
          size: '1024x1024',
          count: 2,
          status: 'success',
          outputNodeId: 'task-1',
        },
      },
      {
        id: 'task-1',
        type: 'image',
        title: '图片生成任务',
        metadata: {
          status: 'idle',
          prompt: 'direct config prompt',
          model: 'image-model',
          size: '1024x1024',
          count: 2,
        },
      },
    ])
    expect(bridge.getSnapshot().project.connections).toEqual([
      { id: 'id-2', fromNodeId: 'config-1', toNodeId: 'task-1' },
    ])
  })
})
