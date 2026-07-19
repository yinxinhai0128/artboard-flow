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
})
