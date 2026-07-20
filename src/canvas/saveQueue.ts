import type { CanvasProject } from './types'

type ProjectSaveQueueOptions = {
  delayMs: number
  save: (project: CanvasProject) => Promise<CanvasProject>
  onSaved?: (project: CanvasProject) => void
  onError?: (error: unknown) => void
}

type PendingSave = {
  project: CanvasProject
  timer: ReturnType<typeof setTimeout>
}

export function createProjectSaveQueue({ delayMs, save, onSaved, onError }: ProjectSaveQueueOptions) {
  const pending = new Map<string, PendingSave>()

  const flush = async (id: string) => {
    const item = pending.get(id)
    if (!item) return null
    clearTimeout(item.timer)
    pending.delete(id)
    try {
      const saved = await save(item.project)
      onSaved?.(saved)
      return saved
    } catch (error) {
      onError?.(error)
      return null
    }
  }

  return {
    enqueue(project: CanvasProject) {
      const current = pending.get(project.id)
      if (current) clearTimeout(current.timer)
      const timer = setTimeout(() => {
        void flush(project.id)
      }, delayMs)
      pending.set(project.id, { project, timer })
    },
    flush,
    async flushAll() {
      await Promise.all(Array.from(pending.keys()).map((id) => flush(id)))
    },
    cancel(id: string) {
      const item = pending.get(id)
      if (!item) return
      clearTimeout(item.timer)
      pending.delete(id)
    },
  }
}
