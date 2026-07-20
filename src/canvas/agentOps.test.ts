import { describe, expect, it } from 'vitest'
import { applyCanvasAgentOps, summarizeCanvasAgentOps, type CanvasAgentSnapshot } from './agentOps'
import type { CanvasProject } from './types'

const project: CanvasProject = {
  schemaVersion: 1,
  id: 'project-1',
  title: 'Agent 测试画布',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  nodes: [
    {
      id: 'config-1',
      type: 'config',
      title: '配置',
      position: { x: 0, y: 0 },
      width: 300,
      height: 300,
      metadata: { composerContent: '使用 @[node:text-1] 作为提示词', status: 'idle' },
    },
    {
      id: 'text-1',
      type: 'text',
      title: '提示词',
      position: { x: 360, y: 0 },
      width: 260,
      height: 180,
      metadata: { content: 'cinematic light', status: 'success' },
    },
  ],
  connections: [{ id: 'edge-1', fromNodeId: 'text-1', toNodeId: 'config-1' }],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

const snapshot = (source: CanvasProject = project): CanvasAgentSnapshot => ({
  project: source,
  selectedNodeIds: [],
  selectedConnectionId: null,
})

describe('canvas agent operations', () => {
  it('adds and updates nodes with deterministic ids and merged metadata', () => {
    const result = applyCanvasAgentOps(
      snapshot(),
      [
        {
          type: 'add_node',
          nodeType: 'image',
          title: '参考图',
          position: { x: 720, y: 40 },
          metadata: { content: 'data:image/png;base64,aGVsbG8=', status: 'success' },
        },
        {
          type: 'update_node',
          id: 'agent-node-1',
          patch: { width: 420 },
          metadata: { prompt: 'use as visual reference' },
        },
      ],
      { createId: () => 'agent-node-1', now: () => '2026-07-20T01:00:00.000Z' },
    )

    const node = result.project.nodes.find((item) => item.id === 'agent-node-1')
    expect(node).toMatchObject({
      id: 'agent-node-1',
      type: 'image',
      title: '参考图',
      position: { x: 720, y: 40 },
      width: 420,
      metadata: {
        content: 'data:image/png;base64,aGVsbG8=',
        status: 'success',
        prompt: 'use as visual reference',
      },
    })
    expect(result.selectedNodeIds).toEqual(['agent-node-1'])
    expect(result.project.updatedAt).toBe('2026-07-20T01:00:00.000Z')
  })

  it('connects only valid nodes and prevents duplicate or config-sourced relations', () => {
    const result = applyCanvasAgentOps(
      snapshot(),
      [
        { type: 'add_node', id: 'image-1', nodeType: 'image', x: 700, y: 0 },
        { type: 'connect_nodes', id: 'edge-2', fromNodeId: 'text-1', toNodeId: 'image-1' },
        { type: 'connect_nodes', id: 'duplicate', fromNodeId: 'text-1', toNodeId: 'image-1' },
        { type: 'connect_nodes', id: 'invalid-source', fromNodeId: 'config-1', toNodeId: 'image-1' },
        { type: 'connect_nodes', id: 'missing', fromNodeId: 'missing', toNodeId: 'image-1' },
      ],
      { createId: () => 'unused' },
    )

    expect(result.project.connections).toEqual([
      { id: 'edge-1', fromNodeId: 'text-1', toNodeId: 'config-1' },
      { id: 'edge-2', fromNodeId: 'text-1', toNodeId: 'image-1' },
    ])
  })

  it('deletes nodes with their relations and removes stale config references', () => {
    const result = applyCanvasAgentOps(
      snapshot(project),
      [{ type: 'delete_node', id: 'text-1' }],
      { now: () => '2026-07-20T01:00:00.000Z' },
    )

    expect(result.project.nodes.map((node) => node.id)).toEqual(['config-1'])
    expect(result.project.connections).toEqual([])
    expect(result.project.nodes[0].metadata.composerContent).toBe('使用 作为提示词')
  })

  it('sets viewport and filters selection to existing nodes', () => {
    const result = applyCanvasAgentOps(snapshot(), [
      { type: 'set_viewport', viewport: { x: 120, y: 80, k: 1.4 } },
      { type: 'select_nodes', ids: ['text-1', 'missing'] },
    ])

    expect(result.project.viewport).toEqual({ x: 120, y: 80, k: 1.4 })
    expect(result.selectedNodeIds).toEqual(['text-1'])
    expect(result.selectedConnectionId).toBeNull()
  })

  it('ignores update operations for missing nodes without refreshing the project timestamp', () => {
    const result = applyCanvasAgentOps(
      snapshot(),
      [{ type: 'update_node', id: 'missing', patch: { title: '不会出现' } }],
      { now: () => '2026-07-20T01:00:00.000Z' },
    )

    expect(result.project.nodes).toEqual(project.nodes)
    expect(result.project.updatedAt).toBe(project.updatedAt)
  })

  it('summarizes operation batches for agent feedback', () => {
    expect(summarizeCanvasAgentOps([
      { type: 'add_node', nodeType: 'text' },
      { type: 'add_node', nodeType: 'image' },
      { type: 'connect_nodes', fromNodeId: 'a', toNodeId: 'b' },
    ])).toBe('新增节点 2、连接 1')
  })
})
