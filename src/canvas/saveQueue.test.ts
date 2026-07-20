import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProjectSaveQueue } from './saveQueue'
import type { CanvasProject } from './types'

const project = (id: string, title: string): CanvasProject => ({
  schemaVersion: 1,
  id,
  title,
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  nodes: [],
  connections: [],
  backgroundMode: 'dots',
  viewport: { x: 0, y: 0, k: 1 },
})

const advanceTimers = async (ms: number) => {
  await vi.advanceTimersByTime(ms)
  await Promise.resolve()
}

describe('project save queue', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces frequent project saves and persists the latest snapshot', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (value: CanvasProject) => value)
    const saved: CanvasProject[] = []
    const queue = createProjectSaveQueue({ delayMs: 350, save, onSaved: (value) => saved.push(value) })

    queue.enqueue(project('project-1', 'first'))
    queue.enqueue(project('project-1', 'second'))
    await advanceTimers(349)

    expect(save).not.toHaveBeenCalled()

    await advanceTimers(1)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'project-1', title: 'second' }))
    expect(saved.map((value) => value.title)).toEqual(['second'])
  })

  it('flushes pending project saves before the debounce delay completes', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (value: CanvasProject) => value)
    const queue = createProjectSaveQueue({ delayMs: 350, save })

    queue.enqueue(project('project-1', 'latest'))

    await queue.flush('project-1')
    await advanceTimers(350)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'latest' }))
  })
})
