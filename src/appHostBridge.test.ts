import { describe, expect, it } from 'vitest'
import { createArtboardFlowAppHostBridge } from './appHostBridge'
import type { CanvasProject } from './canvas/types'

const baseProject: CanvasProject = {
  id: 'project-1',
  title: 'Hero canvas',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T02:00:00.000Z',
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      title: 'Prompt',
      position: { x: 0, y: 0 },
      width: 320,
      height: 220,
      metadata: { content: 'hello', status: 'success' },
    },
  ],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('artboard flow app host bridge', () => {
  it('describes available app host commands for external agents', () => {
    const bridge = createArtboardFlowAppHostBridge({
      getProjects: () => [baseProject],
      getActiveProjectId: () => null,
      openProject: () => {},
      createProject: async () => baseProject,
    })

    expect(bridge.getCapabilities()).toEqual([
      { name: 'listProjects', scope: 'app', description: '列出画布项目摘要，支持关键词和分页。' },
      { name: 'getActiveProjectId', scope: 'app', description: '读取当前打开的画布项目 ID。' },
      { name: 'openProject', scope: 'app', description: '按项目 ID 打开画布或返回画布库。' },
      { name: 'createProject', scope: 'app', description: '新建画布项目，并可选择立即打开。' },
    ])
  })

  it('lists, opens, and creates projects for external hosts', async () => {
    let projects: CanvasProject[] = [
      baseProject,
      {
        ...baseProject,
        id: 'project-2',
        title: 'Archive canvas',
        updatedAt: '2026-07-20T01:00:00.000Z',
        nodes: [],
        connections: [{ id: 'stale', fromNodeId: 'missing', toNodeId: 'missing-2' }],
      },
    ]
    const opened: Array<{ id: string | null; replace?: boolean }> = []
    const bridge = createArtboardFlowAppHostBridge({
      getProjects: () => projects,
      getActiveProjectId: () => opened.at(-1)?.id ?? null,
      openProject: (id, replace) => {
        opened.push({ id, replace })
      },
      createProject: async (title) => {
        const project = {
          ...baseProject,
          id: 'project-3',
          title,
          nodes: [],
          connections: [],
        }
        projects = [project, ...projects]
        return project
      },
    })

    expect(bridge.listProjects({ keyword: 'canvas', page: 1, pageSize: 1 })).toEqual({
      total: 2,
      page: 1,
      pageSize: 1,
      items: [
        {
          id: 'project-1',
          title: 'Hero canvas',
          createdAt: '2026-07-20T00:00:00.000Z',
          updatedAt: '2026-07-20T02:00:00.000Z',
          nodeCount: 1,
          connectionCount: 0,
          path: '/canvas/project-1',
        },
      ],
    })

    expect(bridge.openProject({ id: 'project-2', replace: true })).toEqual({
      ok: true,
      id: 'project-2',
      path: '/canvas/project-2',
    })
    expect(opened).toEqual([{ id: 'project-2', replace: true }])

    await expect(bridge.createProject({ title: 'New host canvas', open: true })).resolves.toEqual({
      ok: true,
      project: {
        id: 'project-3',
        title: 'New host canvas',
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T02:00:00.000Z',
        nodeCount: 0,
        connectionCount: 0,
        path: '/canvas/project-3',
      },
    })
    expect(opened.at(-1)).toEqual({ id: 'project-3', replace: undefined })
  })
})
