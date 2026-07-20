import { describe, expect, it } from 'vitest'
import { packCanvasProjects, readCanvasProjectsFile } from './export'
import type { CanvasProject } from './types'

const project: CanvasProject = {
  schemaVersion: 1,
  id: 'project-1',
  title: '测试画布',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  nodes: [
    {
      id: 'node-1',
      type: 'text',
      title: '文本节点',
      position: { x: 10, y: 20 },
      width: 260,
      height: 180,
      metadata: { content: 'hello', status: 'success' },
    },
  ],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
}

describe('canvas export files', () => {
  it('packs projects into a zip that can be imported back', async () => {
    const zip = packCanvasProjects([project])
    const file = new File([zip], 'canvas.artboard-flow.zip', { type: 'application/zip' })

    const imported = await readCanvasProjectsFile(file)

    expect(imported).toEqual([project])
  })

  it('imports a wrapped json export', async () => {
    const file = new File(
      [JSON.stringify({ app: 'artboard-flow', version: 1, exportedAt: '2026-07-19T00:00:00.000Z', projects: [{ project, files: [] }] })],
      'canvas.json',
      { type: 'application/json' },
    )

    await expect(readCanvasProjectsFile(file)).resolves.toEqual([project])
  })

  it('keeps compatibility with a single legacy project json', async () => {
    const file = new File([JSON.stringify(project)], 'legacy.artboard-flow.json', { type: 'application/json' })

    await expect(readCanvasProjectsFile(file)).resolves.toEqual([project])
  })

  it('stores media node data urls as zip files and restores them on import', async () => {
    const content = 'data:image/png;base64,aGVsbG8='
    const mediaProject: CanvasProject = {
      ...project,
      nodes: [
        {
          id: 'image-1',
          type: 'image',
          title: '参考图',
          position: { x: 10, y: 20 },
          width: 280,
          height: 220,
          metadata: { content, status: 'success', mimeType: 'image/png', bytes: 5 },
        },
      ],
    }

    const zip = packCanvasProjects([mediaProject])
    const zipText = new TextDecoder().decode(zip)
    const file = new File([zip], 'media.artboard-flow.zip', { type: 'application/zip' })

    const [imported] = await readCanvasProjectsFile(file)

    expect(zipText).not.toContain(content)
    expect(zipText).toContain('projects/project-1/files/image-1-content.png')
    expect(imported.nodes[0].metadata.content).toBe(content)
  })

  it('sanitizes imported projects before they reach the canvas', async () => {
    const dirtyProject: CanvasProject = {
      ...project,
      nodes: [
        project.nodes[0],
        {
          id: 'node-2',
          type: 'image',
          title: '图片节点',
          position: { x: 320, y: 20 },
          width: 260,
          height: 180,
          metadata: { groupId: 'missing-group', splitSourceNodeId: 'missing-source', splitOutputIndex: 0 },
        },
        {
          id: 'node-3',
          type: 'config',
          title: '配置节点',
          position: { x: 620, y: 20 },
          width: 260,
          height: 180,
          metadata: {},
        },
        {
          id: 'node-4',
          type: 'group',
          title: '分组',
          position: { x: 0, y: 260 },
          width: 400,
          height: 260,
          metadata: {},
        },
      ],
      connections: [
        { id: 'connection-1', fromNodeId: 'node-1', toNodeId: 'node-2' },
        { id: 'duplicate', fromNodeId: 'node-1', toNodeId: 'node-2' },
        { id: 'missing-target', fromNodeId: 'node-1', toNodeId: 'missing' },
        { id: 'self', fromNodeId: 'node-2', toNodeId: 'node-2' },
        { id: 'group-source', fromNodeId: 'node-4', toNodeId: 'node-2' },
        { id: 'config-source', fromNodeId: 'node-3', toNodeId: 'node-2' },
      ],
    }
    const file = new File([JSON.stringify(dirtyProject)], 'dirty.artboard-flow.json', { type: 'application/json' })

    const [imported] = await readCanvasProjectsFile(file)

    expect(imported.connections).toEqual([{ id: 'connection-1', fromNodeId: 'node-1', toNodeId: 'node-2' }])
    expect(imported.nodes.find((node) => node.id === 'node-2')?.metadata).toEqual({})
  })
})
