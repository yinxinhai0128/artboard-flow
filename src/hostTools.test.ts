import { describe, expect, it } from 'vitest'
import type { ArtboardFlowAppHostBridge } from './appHostBridge'
import type { CanvasHostBridge } from './canvas/hostBridge'
import { createArtboardFlowHostTools, listArtboardFlowHostTools, runArtboardFlowHostTool } from './hostTools'

describe('artboard flow host tools', () => {
  it('maps agent-style tool names to app and canvas host bridge methods', async () => {
    const calls: string[] = []
    const app = {
      listProjects: (input: unknown) => ({ total: 1, page: 1, pageSize: 20, items: [{ input }] }),
      getActiveProjectId: () => 'project-1',
      openProject: (input: unknown) => ({ ok: true, input }),
      createProject: async (input: unknown) => ({ ok: true, project: { input } }),
    } as unknown as Partial<ArtboardFlowAppHostBridge>
    const canvas = {
      getSnapshot: () => ({ project: { id: 'project-1' }, selectedNodeIds: [], selectedConnectionId: null }),
      getGraph: () => ({ projectId: 'project-1', nodeCount: 2, connectionCount: 1, nodes: [] }),
      createTextNode: (input: unknown) => {
        calls.push('createTextNode')
        return { input }
      },
      generateImage: (input: unknown) => {
        calls.push('generateImage')
        return { input }
      },
      getGenerationStatus: async (input: unknown) => ({ total: 0, input }),
      addTextAsset: async (input: unknown) => ({ kind: 'text', input }),
      addImageAsset: async (input: unknown) => ({ kind: 'image', input }),
    } as unknown as Partial<CanvasHostBridge>

    await expect(runArtboardFlowHostTool({ app, canvas }, 'canvas_list_projects', { keyword: 'hero' })).resolves.toMatchObject({
      total: 1,
    })
    await expect(runArtboardFlowHostTool({ app, canvas }, 'canvas_create_text_node', { text: 'hello' })).resolves.toEqual({
      input: { text: 'hello' },
    })
    await expect(runArtboardFlowHostTool({ app, canvas }, 'canvas_generate_image', { prompt: 'robot' })).resolves.toEqual({
      input: { prompt: 'robot' },
    })
    await expect(runArtboardFlowHostTool({ app, canvas }, 'canvas_get_graph', {})).resolves.toMatchObject({
      projectId: 'project-1',
      connectionCount: 1,
    })
    await expect(runArtboardFlowHostTool({ app, canvas }, 'generation_get_status', { scope: 'image' })).resolves.toMatchObject({
      total: 0,
    })
    await expect(runArtboardFlowHostTool({ app, canvas }, 'assets_add', { kind: 'text', content: 'note' })).resolves.toMatchObject({
      kind: 'text',
      input: { text: 'note' },
    })
    await expect(runArtboardFlowHostTool({ app, canvas }, 'assets_add', { kind: 'image', imageUrl: 'data:image/png;base64,abc' })).resolves.toMatchObject({
      kind: 'image',
      input: { imageUrl: 'data:image/png;base64,abc' },
    })
    expect(calls).toEqual(['createTextNode', 'generateImage'])
  })

  it('lists supported agent-style tool names with scopes', () => {
    expect(listArtboardFlowHostTools()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'canvas_list_projects', scope: 'app' }),
      expect.objectContaining({ name: 'canvas_get_state', scope: 'canvas' }),
      expect.objectContaining({ name: 'canvas_get_graph', scope: 'canvas' }),
      expect.objectContaining({ name: 'canvas_generate_video', scope: 'canvas' }),
      expect.objectContaining({ name: 'generation_get_status', scope: 'canvas' }),
      expect.objectContaining({ name: 'assets_add', scope: 'canvas' }),
    ]))
    expect(listArtboardFlowHostTools()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'canvas_connect_nodes',
        description: expect.stringContaining('连接节点'),
        inputSchema: expect.objectContaining({
          required: ['connections'],
          properties: expect.objectContaining({
            connections: expect.objectContaining({ type: 'array' }),
          }),
        }),
      }),
    ]))
    expect(listArtboardFlowHostTools().every((tool) => tool.description.trim().length > 0)).toBe(true)
    expect(listArtboardFlowHostTools().every((tool) => tool.inputSchema.type === 'object')).toBe(true)
  })

  it('reports missing bridges and unknown tools clearly', async () => {
    await expect(runArtboardFlowHostTool({}, 'canvas_get_state', {})).rejects.toThrow('HOST_CANVAS_UNAVAILABLE')
    await expect(runArtboardFlowHostTool({}, 'canvas_list_projects', {})).rejects.toThrow('HOST_APP_UNAVAILABLE')
    await expect(runArtboardFlowHostTool({}, 'not_a_tool', {})).rejects.toThrow('UNKNOWN_HOST_TOOL')
  })

  it('validates required tool inputs before calling host bridges', async () => {
    let called = false
    const canvas = {
      connectNodes: (input: unknown) => {
        called = true
        return { input }
      },
    } as unknown as Partial<CanvasHostBridge>

    await expect(runArtboardFlowHostTool({ canvas }, 'canvas_connect_nodes', {
      connections: [{ fromNodeId: 'source-1' }],
    })).rejects.toThrow('INVALID_HOST_TOOL_INPUT')
    expect(called).toBe(false)

    await expect(runArtboardFlowHostTool({ canvas }, 'canvas_connect_nodes', {
      connections: [{ fromNodeId: 'source-1', toNodeId: 'target-1' }],
    })).resolves.toEqual({
      input: { connections: [{ fromNodeId: 'source-1', toNodeId: 'target-1' }] },
    })
    expect(called).toBe(true)
  })

  it('creates a runtime tool facade from lazy bridge getters', async () => {
    const runtime = createArtboardFlowHostTools({
      getApp: () => ({
        listProjects: () => ({ total: 0, page: 1, pageSize: 20, items: [] }),
      }),
      getCanvas: () => ({
        getSnapshot: () => ({ project: { id: 'project-1' }, selectedNodeIds: [], selectedConnectionId: null }),
      }) as unknown as Partial<CanvasHostBridge>,
    })

    expect(runtime.listTools().map((tool) => tool.name)).toContain('canvas_get_state')
    await expect(runtime.runTool('canvas_get_state')).resolves.toMatchObject({
      project: { id: 'project-1' },
    })
    await expect(runtime.runTool('canvas_list_projects')).resolves.toMatchObject({
      total: 0,
    })
  })
})
