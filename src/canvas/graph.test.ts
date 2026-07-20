import { describe, expect, it } from 'vitest'
import { createCanvasGraphSnapshot, relationCountsForProject } from './graph'
import type { CanvasProject } from './types'

const project: CanvasProject = {
  schemaVersion: 1,
  id: 'project-1',
  title: '关系测试画布',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  nodes: [
    {
      id: 'text-1',
      type: 'text',
      title: '提示词',
      position: { x: 0, y: 0 },
      width: 260,
      height: 180,
      metadata: { content: 'cinematic light' },
    },
    {
      id: 'image-1',
      type: 'image',
      title: '参考图',
      position: { x: 320, y: 0 },
      width: 280,
      height: 220,
      metadata: { groupId: 'group-1' },
    },
    {
      id: 'config-1',
      type: 'config',
      title: '生成配置',
      position: { x: 680, y: 0 },
      width: 300,
      height: 300,
      metadata: {},
    },
    {
      id: 'group-1',
      type: 'group',
      title: '素材组',
      position: { x: 280, y: -40 },
      width: 360,
      height: 300,
      metadata: {},
    },
  ],
  connections: [
    { id: 'text-image', fromNodeId: 'text-1', toNodeId: 'image-1' },
    { id: 'image-config', fromNodeId: 'image-1', toNodeId: 'config-1' },
    { id: 'missing', fromNodeId: 'missing', toNodeId: 'config-1' },
  ],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('canvas graph snapshots', () => {
  it('builds a whole-canvas relationship snapshot for host integrations', () => {
    const snapshot = createCanvasGraphSnapshot(project)

    expect(snapshot.projectId).toBe('project-1')
    expect(snapshot.title).toBe('关系测试画布')
    expect(snapshot.nodeCount).toBe(4)
    expect(snapshot.connectionCount).toBe(3)
    expect(snapshot.nodeTypes).toEqual({ text: 1, image: 1, config: 1, group: 1 })
    expect(snapshot.nodes.find((node) => node.id === 'image-1')).toEqual({
      id: 'image-1',
      type: 'image',
      title: '参考图',
      groupId: 'group-1',
      splitSourceNodeId: undefined,
      incoming: [{ connectionId: 'text-image', nodeId: 'text-1' }],
      outgoing: [{ connectionId: 'image-config', nodeId: 'config-1' }],
      incomingCount: 1,
      outgoingCount: 1,
    })
    expect(snapshot.nodes.find((node) => node.id === 'config-1')?.incoming).toEqual([
      { connectionId: 'image-config', nodeId: 'image-1' },
    ])
  })

  it('computes relation counts while ignoring missing endpoints', () => {
    const counts = relationCountsForProject(project)

    expect(counts.get('text-1')).toEqual({ incoming: 0, outgoing: 1 })
    expect(counts.get('image-1')).toEqual({ incoming: 1, outgoing: 1 })
    expect(counts.get('config-1')).toEqual({ incoming: 1, outgoing: 0 })
    expect(counts.get('group-1')).toEqual({ incoming: 0, outgoing: 0 })
  })
})
